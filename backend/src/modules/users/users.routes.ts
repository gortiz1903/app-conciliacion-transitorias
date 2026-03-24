import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth, requireRole } from '../../middleware/auth';
import db from '../../config/database';
import { AppError } from '../../middleware/errorHandler';

const router = Router();

// List all users (admin only)
router.get('/', requireAuth, requireRole('ADMIN'), async (_req: AuthenticatedRequest, res: Response) => {
  const users = await db('users')
    .select('id', 'email', 'display_name', 'role', 'active', 'created_at');
  res.json({ users });
});

// Update user role
router.patch('/:id/role', requireAuth, requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  const { role } = req.body;
  if (!['ADMIN', 'CONCILIADOR', 'AUDITOR'].includes(role)) {
    throw new AppError(400, 'Invalid role');
  }

  await db('users').where('id', req.params.id).update({ role });

  await db('audit_log').insert({
    user_id: req.userId,
    action: 'UPDATE',
    entity_type: 'user',
    entity_id: 0,
    details: JSON.stringify({ target_user: req.params.id, new_role: role }),
    ip_address: req.ip,
  });

  res.json({ message: 'Role updated' });
});

// Assign agencies to user
router.post('/:id/agencies', requireAuth, requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  const { agency_ids } = req.body;
  if (!Array.isArray(agency_ids)) {
    throw new AppError(400, 'agency_ids must be an array');
  }

  const userId = req.params.id;

  // Replace all assignments
  await db('user_agency_assignments').where('user_id', userId).del();

  if (agency_ids.length > 0) {
    await db('user_agency_assignments').insert(
      agency_ids.map((agencyId: number) => ({ user_id: userId, agency_id: agencyId }))
    );
  }

  res.json({ message: 'Agencies assigned' });
});

// Get user's assigned agencies
router.get('/:id/agencies', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const agencies = await db('user_agency_assignments')
    .join('agencies', 'agencies.id', 'user_agency_assignments.agency_id')
    .where('user_agency_assignments.user_id', req.params.id)
    .select('agencies.*');

  res.json({ agencies });
});

export default router;
