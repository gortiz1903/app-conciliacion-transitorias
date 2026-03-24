import { Request, Response, NextFunction } from 'express';
import db from '../config/database';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: string;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  req.userId = userId;
  req.userRole = (req.session as any)?.userRole;
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
