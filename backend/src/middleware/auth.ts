import { Request, Response, NextFunction } from 'express';
import db from '../config/database';
import { env } from '../config/env';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: string;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  // 1. Try session first (production flow)
  let userId = (req.session as any)?.userId;
  let userRole = (req.session as any)?.userRole;

  // 2. Dev mode fallback: accept x-dev-user-id header
  if (!userId && env.nodeEnv !== 'production') {
    const devUserId = req.headers['x-dev-user-id'] as string;
    if (devUserId) {
      const user = await db('users').where('id', devUserId).first();
      if (user && user.active) {
        userId = user.id;
        userRole = user.role;
      }
    }
  }

  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  req.userId = userId;
  req.userRole = userRole;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

export async function requireAgencyAccess(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  if (req.userRole === 'ADMIN' || req.userRole === 'AUDITOR') {
    next();
    return;
  }

  const agencyId = req.params.agencyId || req.body?.agency_id;
  if (!agencyId) {
    next();
    return;
  }

  const assignment = await db('user_agency_assignments')
    .where({ user_id: req.userId, agency_id: agencyId })
    .first();

  if (!assignment) {
    res.status(403).json({ error: 'No access to this agency' });
    return;
  }

  next();
}
