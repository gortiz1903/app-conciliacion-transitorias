import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../services/api';
import type { User } from '../types';

export function useAuth() {
  const queryClient = useQueryClient();

  const hasDevUser = !!localStorage.getItem('dev_user_id');

  const { data, isLoading, error } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await authApi.getMe();
      return res.data.user as User;
    },
    retry: false,
    // Only try to fetch if we have a dev user or a session
    enabled: hasDevUser || undefined,
  });

  const login = async () => {
    const res = await authApi.getLoginUrl();
    window.location.href = res.data.authUrl;
  };

  const logout = async () => {
    localStorage.removeItem('dev_user_id');
    try { await authApi.logout(); } catch { /* ignore */ }
    queryClient.clear();
    window.location.href = '/login';
  };

  return {
    user: data ?? null,
    isLoading,
    isAuthenticated: !!data,
    error,
    login,
    logout,
  };
}
