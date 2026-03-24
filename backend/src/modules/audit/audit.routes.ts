import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../../middleware/auth';
import db from '../../config/database';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { entity_type, entity_id, user_id, page = '1', limit = '50' } = req.query;
  const offset = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);

  let query = db('audit_log')
    .join('users', 'users.id', 'audit_log.user_id')
    .select('audit_log.*', 'users.display_name', 'users.email')
    .orderBy('audit_log.created_at', 'desc')
    .limit(parseInt(limit as string, 10))
    .offset(offset);

  if (entity_type) query = query.where('audit_log.entity_type', entity_type);
  if (entity_id) query = query.where('audit_log.entity_id', entity_id);
  if (user_id) query = query.where('audit_log.user_id', user_id);

  const logs = await query;
  res.json({ logs });
});

export default router;
