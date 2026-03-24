import { Router, Request, Response } from 'express';
import { msalClient, SCOPES } from './auth.config';
import { env } from '../../config/env';
import db from '../../config/database';
import logger from '../../config/logger';

const router = Router();

// Initiate Microsoft SSO login
router.get('/login', async (_req: Request, res: Response) => {
  try {
    const authUrl = await msalClient.getAuthCodeUrl({
      scopes: SCOPES,
      redirectUri: env.azure.redirectUri,
    });
    res.json({ authUrl });
  } catch (error) {
    logger.error('Error generating auth URL', error);
    res.status(500).json({ error: 'Failed to generate login URL' });
  }
});

// Handle OAuth callback
router.get('/callback', async (req: Request, res: Response) => {
  const { code } = req.query;

  if (!code || typeof code !== 'string') {
    res.redirect(`${env.frontendUrl}/login?error=no_code`);
    return;
  }

  try {
    const tokenResponse = await msalClient.acquireTokenByCode({
      code,
      scopes: SCOPES,
      redirectUri: env.azure.redirectUri,
    });

    const account = tokenResponse.account;
    if (!account) {
      res.redirect(`${env.frontendUrl}/login?error=no_account`);
      return;
    }

    // Upsert user in database
    const existingUser = await db('users').where('azure_oid', account.localAccountId).first();

    let user;
    if (existingUser) {
      [user] = await db('users')
        .where('azure_oid', account.localAccountId)
        .update({
          email: account.username,
          display_name: account.name || account.username,
          updated_at: db.fn.now(),
        })
        .returning('*');
    } else {
      [user] = await db('users')
        .insert({
          azure_oid: account.localAccountId,
          email: account.username,
          display_name: account.name || account.username,
          role: 'CONCILIADOR', // Default role, admin assigns later
        })
        .returning('*');
    }

    // Store user info in session
    (req.session as any).userId = user.id;
    (req.session as any).userRole = user.role;

    res.redirect(`${env.frontendUrl}/dashboard`);
  } catch (error) {
    logger.error('Error in auth callback', error);
    res.redirect(`${env.frontendUrl}/login?error=auth_failed`);
  }
});

// Get current user
router.get('/me', async (req: Request, res: Response) => {
  // Try session first, then dev header
  let userId = (req.session as any)?.userId;
  if (!userId && env.nodeEnv !== 'production') {
    userId = req.headers['x-dev-user-id'] as string;
  }
  if (!userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const user = await db('users')
    .where('id', userId)
    .select('id', 'email', 'display_name', 'role', 'active')
    .first();

  if (!user || !user.active) {
    res.status(401).json({ error: 'User not found or inactive' });
    return;
  }

  // Get assigned agencies
  const agencies = await db('user_agency_assignments')
    .join('agencies', 'agencies.id', 'user_agency_assignments.agency_id')
    .where('user_agency_assignments.user_id', userId)
    .select('agencies.*');

  res.json({ user: { ...user, agencies } });
});

// Dev login — generic entry without Microsoft SSO (development only)
router.post('/dev-login', async (req: Request, res: Response) => {
  if (env.nodeEnv === 'production') {
    res.status(404).json({ error: 'Not available' });
    return;
  }

  const { name, email, role } = req.body;
  if (!name || !email) {
    res.status(400).json({ error: 'name and email are required' });
    return;
  }

  const validRole = ['ADMIN', 'CONCILIADOR', 'AUDITOR'].includes(role) ? role : 'ADMIN';

  // Upsert dev user
  let user = await db('users').where('email', email).first();
  if (user) {
    [user] = await db('users')
      .where('email', email)
      .update({ display_name: name, role: validRole, updated_at: db.fn.now() })
      .returning('*');
  } else {
    [user] = await db('users')
      .insert({
        azure_oid: `dev-${Date.now()}`,
        email,
        display_name: name,
        role: validRole,
      })
      .returning('*');

    // Assign all agencies to dev user
    const agencies = await db('agencies').select('id');
    if (agencies.length > 0) {
      await db('user_agency_assignments').insert(
        agencies.map((a: any) => ({ user_id: user.id, agency_id: a.id }))
      );
    }
  }

  (req.session as any).userId = user.id;
  (req.session as any).userRole = user.role;

  // Get assigned agencies
  const agencies = await db('user_agency_assignments')
    .join('agencies', 'agencies.id', 'user_agency_assignments.agency_id')
    .where('user_agency_assignments.user_id', user.id)
    .select('agencies.*');

  res.json({ user: { ...user, agencies } });
});

// Logout
router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      logger.error('Error destroying session', err);
      res.status(500).json({ error: 'Failed to logout' });
      return;
    }
    res.json({ message: 'Logged out' });
  });
});

export default router;
