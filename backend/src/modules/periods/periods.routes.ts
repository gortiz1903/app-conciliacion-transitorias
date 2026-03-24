import { Router, Response } from 'express';
import { AuthenticatedRequest, requireAuth } from '../../middleware/auth';
import db from '../../config/database';

const router = Router();

router.get('/', requireAuth, async (_req: AuthenticatedRequest, res: Response) => {
  const periods = await db('periods').orderBy('code', 'desc');
  res.json({ periods });
});

export default router;
