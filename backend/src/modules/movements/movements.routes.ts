import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../../middleware/auth';
import db from '../../config/database';

const router = Router();

// List movements with filters
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const {
    account_id,
    agency_id,
    period_id,
    status,
    search,
    page = '1',
    limit = '50',
    sort_by = 'entry_date',
    sort_order = 'desc',
  } = req.query;

  const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);

  let query = db('movements')
    .join('agencies', 'agencies.id', 'movements.agency_id')
    .join('accounts', 'accounts.id', 'movements.account_id')
    .join('periods', 'periods.id', 'movements.period_id')
    .select(
      'movements.*',
      'agencies.code as agency_code',
      'agencies.name as agency_name',
      'accounts.account_number',
      'accounts.name as account_display_name',
      'accounts.reconciliation_type',
      'periods.code as period_code'
    );

  if (account_id) query = query.where('movements.account_id', account_id);
  if (agency_id) query = query.where('movements.agency_id', agency_id);
  if (period_id) query = query.where('movements.period_id', period_id);
  if (status) query = query.where('movements.status', status);
  if (search) {
    query = query.where(function () {
      this.where('movements.reference', 'ilike', `%${search}%`)
        .orWhere('movements.document_number', 'ilike', `%${search}%`)
        .orWhere('movements.client_vendor', 'ilike', `%${search}%`)
        .orWhere('movements.invoice', 'ilike', `%${search}%`)
        .orWhere('movements.purchase_order', 'ilike', `%${search}%`)
        .orWhere('movements.entry_number', 'ilike', `%${search}%`);
    });
  }

  // Count for pagination
  const [{ count }] = await query.clone().clearSelect().count('movements.id');

  const movements = await query
    .orderBy(`movements.${sort_by}`, sort_order as string)
    .limit(parseInt(limit as string, 10))
    .offset(offset);

  res.json({
    movements,
    pagination: {
      total: parseInt(count as string, 10),
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
      pages: Math.ceil(parseInt(count as string, 10) / parseInt(limit as string, 10)),
    },
  });
});

// Get single movement with comments and splits
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const movement = await db('movements')
    .join('agencies', 'agencies.id', 'movements.agency_id')
    .join('accounts', 'accounts.id', 'movements.account_id')
    .where('movements.id', req.params.id)
    .select('movements.*', 'agencies.code as agency_code', 'accounts.account_number')
    .first();

  if (!movement) {
    res.status(404).json({ error: 'Movement not found' });
    return;
  }

  const [comments, splits, reconciliations] = await Promise.all([
    db('movement_comments')
      .join('users', 'users.id', 'movement_comments.user_id')
      .where('movement_id', movement.id)
      .select('movement_comments.*', 'users.display_name')
      .orderBy('created_at', 'asc'),
    db('movement_splits').where('movement_id', movement.id).orderBy('created_at', 'asc'),
    db('reconciliation_items')
      .join('reconciliation_groups', 'reconciliation_groups.id', 'reconciliation_items.group_id')
      .where('reconciliation_items.movement_id', movement.id)
      .select('reconciliation_groups.*', 'reconciliation_items.amount as applied_amount'),
  ]);

  res.json({ movement, comments, splits, reconciliations });
});

// Add comment to movement
router.post('/:id/comments', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { comment } = req.body;
  if (!comment?.trim()) {
    res.status(400).json({ error: 'Comment is required' });
    return;
  }

  const [newComment] = await db('movement_comments')
    .insert({
      movement_id: req.params.id,
      user_id: req.userId,
      comment: comment.trim(),
    })
    .returning('*');

  await db('audit_log').insert({
    user_id: req.userId,
    action: 'COMMENT',
    entity_type: 'movement',
    entity_id: parseInt(req.params.id, 10),
    details: JSON.stringify({ comment: comment.trim() }),
    ip_address: req.ip,
  });

  res.status(201).json(newComment);
});

export default router;
