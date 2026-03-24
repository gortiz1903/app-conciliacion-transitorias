import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth, requireRole } from '../../middleware/auth';
import db from '../../config/database';
import { AppError } from '../../middleware/errorHandler';

const router = Router();

// List all accounts
router.get('/', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  const accounts = await db('accounts').where('active', true).orderBy('account_number');
  res.json({ accounts });
});

// Get account detail with period status for all agencies
router.get('/:id/status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { period_id } = req.query;
  if (!period_id) throw new AppError(400, 'period_id is required');

  const statuses = await db('account_period_status')
    .join('agencies', 'agencies.id', 'account_period_status.agency_id')
    .leftJoin('users', 'users.id', 'account_period_status.closed_by')
    .where({
      'account_period_status.account_id': req.params.id,
      'account_period_status.period_id': period_id,
    })
    .select(
      'account_period_status.*',
      'agencies.code as agency_code',
      'agencies.name as agency_name',
      'users.display_name as closed_by_name'
    );

  // Get movement counts per status
  const movementCounts = await db('movements')
    .where({ account_id: req.params.id, period_id: period_id as string })
    .select('agency_id', 'status')
    .count('id as count')
    .groupBy('agency_id', 'status');

  // Get accounting balances
  const balances = await db('accounting_balances')
    .where({ account_id: req.params.id, period_id: period_id as string })
    .select('*');

  res.json({ statuses, movementCounts, balances });
});

// Create a new account (admin only)
router.post('/', requireAuth, requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  const { account_number, name, reconciliation_type } = req.body;

  const existing = await db('accounts').where('account_number', account_number).first();
  if (existing) throw new AppError(409, 'Account number already exists');

  const [account] = await db('accounts')
    .insert({ account_number, name, reconciliation_type: reconciliation_type || 'NORMAL' })
    .returning('*');

  res.status(201).json({ account });
});

export default router;
