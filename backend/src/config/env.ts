import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'conciliacion_transitorias',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    url: process.env.DATABASE_URL,
  },

  azure: {
    tenantId: process.env.AZURE_AD_TENANT_ID || '',
    clientId: process.env.AZURE_AD_CLIENT_ID || '',
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET || '',
    redirectUri: process.env.AZURE_AD_REDIRECT_URI || 'http://localhost:3001/api/auth/callback',
  },

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
};
