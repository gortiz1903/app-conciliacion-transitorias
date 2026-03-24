import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth, requireRole } from '../../middleware/auth';
import { generateSuggestions } from './reconciliation.service';
import db from '../../config/database';
import { AppError } from '../../middleware/errorHandler';

const router = Router();

// Get suggestions for a given account+agency+period
router.get(
  '/suggestions',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const { account_id, agency_id, period_id } = req.query;
    if (!account_id || !agency_id || !period_id) {
      throw new AppError(400, 'account_id, agency_id, and period_id are required');
    }

    const account = await db('accounts').where('id', account_id).first();
    if (!account) throw new AppError(404, 'Account not found');

    const suggestions = await generateSuggestions(
      parseInt(account_id as string, 10),
      parseInt(agency_id as string, 10),
      parseInt(period_id as string, 10),
      account.reconciliation_type
    );

    res.json({ suggestions });
  }
);

// Create a reconciliation group (confirm a match)
router.post(
  '/groups',
  requireAuth,
  requireRole('ADMIN', 'CONCILIADOR'),
  async (req: AuthenticatedRequest, res: Response) => {
    const { movement_ids, amounts, notes, account_id, agency_id, period_id } = req.body;

    if (!movement_ids?.length || movement_ids.length < 2) {
      throw new AppError(400, 'At least 2 movements are required');
    }

    const account = await db('accounts').where('id', account_id).first();
    if (!account) throw new AppError(404, 'Account not found');

    // Verify all movements are PENDING and belong to the right account+agency
    const movements = await db('movements').whereIn('id', movement_ids);
    for (const m of movements) {
      if (m.status !== 'PENDING') {
        throw new AppError(400, `Movement ${m.id} is not in PENDING status`);
      }
    }

    const totalDebit = movements.reduce((s: number, m: any) => s + parseFloat(m.debit), 0);
    const totalCredit = movements.reduce((s: number, m: any) => s + parseFloat(m.credit), 0);
    const difference = Math.abs(totalDebit - totalCredit);
    const hasDifference = difference > 0.01;

    const trx = await db.transaction();
    try {
      // Create group
      const [group] = await trx('reconciliation_groups')
        .insert({
          account_id,
          agency_id,
          period_id,
          reconciliation_type: account.reconciliation_type,
          status: hasDifference ? 'RECONCILED_WITH_DIFF' : 'RECONCILED_COMPLETE',
          total_debit: totalDebit,
          total_credit: totalCredit,
          difference,
          reconciled_by: req.userId,
          notes: notes || null,
        })
        .returning('*');

      // Create items
      const items = movement_ids.map((movId: number, idx: number) => ({
        group_id: group.id,
        movement_id: movId,
        amount: amounts?.[idx] || parseFloat(movements.find((m: any) => m.id === movId)?.debit) ||
          parseFloat(movements.find((m: any) => m.id === movId)?.credit),
      }));
      await trx('reconciliation_items').insert(items);

      // Update movement statuses
      const newStatus = hasDifference ? 'RECONCILED_WITH_DIFF' : 'RECONCILED_COMPLETE';
      await trx('movements').whereIn('id', movement_ids).update({ status: newStatus });

      // If there's a difference, create exchange rate adjustment record
      if (hasDifference) {
        await trx('exchange_rate_adjustments').insert({
          group_id: group.id,
          expected_amount: difference,
          status: 'PENDING',
        });
      }

      // Update account_period_status to IN_PROGRESS
      await trx('account_period_status')
        .where({ account_id, agency_id, period_id })
        .update({ status: 'IN_PROGRESS' });

      // Audit
      await trx('audit_log').insert({
        user_id: req.userId,
        action: 'RECONCILE',
        entity_type: 'reconciliation_group',
        entity_id: group.id,
        details: JSON.stringify({ movement_ids, totalDebit, totalCredit, difference }),
        ip_address: req.ip,
      });

      await trx.commit();
      res.status(201).json({ group });
    } catch (err) {
      await trx.rollback();
      throw err;
    }
  }
);

// Undo a reconciliation group
router.delete(
  '/groups/:id',
  requireAuth,
  requireRole('ADMIN', 'CONCILIADOR'),
  async (req: AuthenticatedRequest, res: Response) => {
    const groupId = parseInt(req.params.id, 10);

    const group = await db('reconciliation_groups').where('id', groupId).first();
    if (!group) throw new AppError(404, 'Reconciliation group not found');

    const trx = await db.transaction();
    try {
      // Get movement IDs in this group
      const items = await trx('reconciliation_items').where('group_id', groupId);
      const movementIds = items.map((i: any) => i.movement_id);

      // Revert movements to PENDING
      await trx('movements').whereIn('id', movementIds).update({ status: 'PENDING' });

      // Delete related records
      await trx('exchange_rate_adjustments').where('group_id', groupId).del();
      await trx('reconciliation_items').where('group_id', groupId).del();
      await trx('reconciliation_groups').where('id', groupId).del();

      await trx('audit_log').insert({
        user_id: req.userId,
        action: 'UNRECONCILE',
        entity_type: 'reconciliation_group',
        entity_id: groupId,
        details: JSON.stringify({ movement_ids: movementIds }),
        ip_address: req.ip,
      });

      await trx.commit();
      res.json({ message: 'Reconciliation undone' });
    } catch (err) {
      await trx.rollback();
      throw err;
    }
  }
);

// Create a split for a movement
router.post(
  '/splits',
  requireAuth,
  requireRole('ADMIN', 'CONCILIADOR'),
  async (req: AuthenticatedRequest, res: Response) => {
    const { movement_id, amount, description } = req.body;

    const movement = await db('movements').where('id', movement_id).first();
    if (!movement) throw new AppError(404, 'Movement not found');

    const movementAmount = parseFloat(movement.debit) || parseFloat(movement.credit);

    // Check existing splits don't exceed original
    const existingSplits = await db('movement_splits').where('movement_id', movement_id);
    const usedAmount = existingSplits.reduce((s: number, sp: any) => s + parseFloat(sp.amount), 0);

    if (usedAmount + parseFloat(amount) > movementAmount + 0.01) {
      throw new AppError(400, `Split total (${usedAmount + parseFloat(amount)}) exceeds movement amount (${movementAmount})`);
    }

    const [split] = await db('movement_splits')
      .insert({
        movement_id,
        amount: parseFloat(amount),
        description: description || null,
        created_by: req.userId,
      })
      .returning('*');

    await db('audit_log').insert({
      user_id: req.userId,
      action: 'SPLIT',
      entity_type: 'movement',
      entity_id: movement_id,
      details: JSON.stringify({ split_id: split.id, amount, description }),
      ip_address: req.ip,
    });

    res.status(201).json({ split, remainingAmount: movementAmount - usedAmount - parseFloat(amount) });
  }
);

// Close/approve an account for a period
router.post(
  '/close',
  requireAuth,
  requireRole('ADMIN', 'CONCILIADOR'),
  async (req: AuthenticatedRequest, res: Response) => {
    const { account_id, agency_id, period_id } = req.body;

    // Verify no pending movements
    const pendingCount = await db('movements')
      .where({ account_id, agency_id, period_id, status: 'PENDING' })
      .count('id as count')
      .first();

    if (parseInt(pendingCount?.count as string, 10) > 0) {
      throw new AppError(400, `Cannot close: ${pendingCount?.count} pending movements remain`);
    }

    await db('account_period_status')
      .where({ account_id, agency_id, period_id })
      .update({
        status: 'CLOSED',
        closed_by: req.userId,
        closed_at: db.fn.now(),
      });

    // Mark all movements as CLOSED
    await db('movements')
      .where({ account_id, agency_id, period_id })
      .whereIn('status', ['RECONCILED_COMPLETE', 'RECONCILED_WITH_DIFF'])
      .update({ status: 'CLOSED' });

    await db('audit_log').insert({
      user_id: req.userId,
      action: 'CLOSE',
      entity_type: 'account_period_status',
      details: JSON.stringify({ account_id, agency_id, period_id }),
      ip_address: req.ip,
    });

    res.json({ message: 'Account closed successfully' });
  }
);

// Get exchange rate adjustments pending
router.get(
  '/adjustments/pending',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const { agency_id, period_id } = req.query;

    let query = db('exchange_rate_adjustments')
      .join('reconciliation_groups', 'reconciliation_groups.id', 'exchange_rate_adjustments.group_id')
      .join('accounts', 'accounts.id', 'reconciliation_groups.account_id')
      .join('agencies', 'agencies.id', 'reconciliation_groups.agency_id')
      .where('exchange_rate_adjustments.status', 'PENDING')
      .select(
        'exchange_rate_adjustments.*',
        'accounts.account_number',
        'accounts.name as account_name',
        'agencies.code as agency_code',
        'reconciliation_groups.total_debit',
        'reconciliation_groups.total_credit'
      );

    if (agency_id) query = query.where('reconciliation_groups.agency_id', agency_id);
    if (period_id) query = query.where('reconciliation_groups.period_id', period_id);

    const adjustments = await query;
    res.json({ adjustments });
  }
);

export default router;
