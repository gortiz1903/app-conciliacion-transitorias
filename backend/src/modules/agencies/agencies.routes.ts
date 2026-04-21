import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../../middleware/auth';
import db from '../../config/database';

const router = Router();

router.get('/', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  const agencies = await db('agencies').where('active', true).orderBy('name');
  res.json({ agencies });
});

export default router;
