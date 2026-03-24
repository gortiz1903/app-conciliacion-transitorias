import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import session from 'express-session';
import { env } from './config/env';
import logger from './config/logger';
import { errorHandler } from './middleware/errorHandler';

// Routes
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import agenciesRoutes from './modules/agencies/agencies.routes';
import accountsRoutes from './modules/accounts/accounts.routes';
import periodsRoutes from './modules/periods/periods.routes';
import csvUploadRoutes from './modules/csv-upload/csv-upload.routes';
import movementsRoutes from './modules/movements/movements.routes';
import reconciliationRoutes from './modules/reconciliation/reconciliation.routes';
import reportsRoutes from './modules/reports/reports.routes';
import auditRoutes from './modules/audit/audit.routes';

const app = express();

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: env.frontendUrl,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: env.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: env.nodeEnv === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
  },
}));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/agencies', agenciesRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/periods', periodsRoutes);
app.use('/api/csv-upload', csvUploadRoutes);
app.use('/api/movements', movementsRoutes);
app.use('/api/reconciliation', reconciliationRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/audit', auditRoutes);

// Error handler
app.use(errorHandler);

app.listen(env.port, () => {
  logger.info(`Server running on port ${env.port} in ${env.nodeEnv} mode`);
});

export default app;
