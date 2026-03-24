import { ConfidentialClientApplication, Configuration } from '@azure/msal-node';
import { env } from '../../config/env';

const msalConfig: Configuration = {
  auth: {
    clientId: env.azure.clientId,
    authority: `https://login.microsoftonline.com/${env.azure.tenantId}`,
    clientSecret: env.azure.clientSecret,
  },
};

export const msalClient = new ConfidentialClientApplication(msalConfig);

export const SCOPES = ['user.read', 'openid', 'profile', 'email'];
