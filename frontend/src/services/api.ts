import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// Auth
export const authApi = {
  getLoginUrl: () => api.get<{ authUrl: string }>('/auth/login'),
  getMe: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  devLogin: (name: string, email: string, role: string) =>
    api.post('/auth/dev-login', { name, email, role }),
};

// Agencies
export const agenciesApi = {
  list: () => api.get('/agencies'),
};

// Accounts
export const accountsApi = {
  list: () => api.get('/accounts'),
  getStatus: (accountId: number, periodId: number) =>
    api.get(`/accounts/${accountId}/status`, { params: { period_id: periodId } }),
  create: (data: { account_number: string; name: string; reconciliation_type: string }) =>
    api.post('/accounts', data),
};

// Periods
export const periodsApi = {
  list: () => api.get('/periods'),
};

// CSV Upload
export const csvApi = {
  uploadMovements: (file: File, period: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('period', period);
    return api.post('/csv-upload/movements', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  uploadBalances: (file: File, period: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('period', period);
    return api.post('/csv-upload/balances', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  history: (period?: string) => api.get('/csv-upload/history', { params: { period } }),
};

// Movements
export const movementsApi = {
  list: (params: Record<string, string | number | undefined>) =>
    api.get('/movements', { params }),
  get: (id: number) => api.get(`/movements/${id}`),
  addComment: (id: number, comment: string) =>
    api.post(`/movements/${id}/comments`, { comment }),
};

// Reconciliation
export const reconciliationApi = {
  getSuggestions: (accountId: number, agencyId: number, periodId: number) =>
    api.get('/reconciliation/suggestions', {
      params: { account_id: accountId, agency_id: agencyId, period_id: periodId },
    }),
  createGroup: (data: {
    movement_ids: number[];
    amounts?: number[];
    notes?: string;
    account_id: number;
    agency_id: number;
    period_id: number;
  }) => api.post('/reconciliation/groups', data),
  deleteGroup: (id: number) => api.delete(`/reconciliation/groups/${id}`),
  createSplit: (data: { movement_id: number; amount: number; description: string }) =>
    api.post('/reconciliation/splits', data),
  closeAccount: (data: { account_id: number; agency_id: number; period_id: number }) =>
    api.post('/reconciliation/close', data),
  getPendingAdjustments: (agencyId?: number, periodId?: number) =>
    api.get('/reconciliation/adjustments/pending', {
      params: { agency_id: agencyId, period_id: periodId },
    }),
};

// Reports
export const reportsApi = {
  dashboard: (periodId: number) =>
    api.get('/reports/dashboard', { params: { period_id: periodId } }),
  reconciliationProof: (accountId: number, agencyId: number, periodId: number) =>
    api.get('/reports/reconciliation-proof', {
      params: { account_id: accountId, agency_id: agencyId, period_id: periodId },
    }),
  exportExcel: (accountId: number, agencyId: number, periodId: number) =>
    api.get('/reports/export/excel', {
      params: { account_id: accountId, agency_id: agencyId, period_id: periodId },
      responseType: 'blob',
    }),
};

// Users
export const usersApi = {
  list: () => api.get('/users'),
  updateRole: (userId: string, role: string) =>
    api.patch(`/users/${userId}/role`, { role }),
  assignAgencies: (userId: string, agencyIds: number[]) =>
    api.post(`/users/${userId}/agencies`, { agency_ids: agencyIds }),
};

// Audit
export const auditApi = {
  list: (params: Record<string, string | number | undefined>) =>
    api.get('/audit', { params }),
};

export default api;
