import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { authApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();

  const [name, setName] = useState('Admin Demo');
  const [email, setEmail] = useState('admin@demo.com');
  const [role, setRole] = useState('ADMIN');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isLoading) return <div className="flex h-screen items-center justify-center">Cargando...</div>;
  if (isAuthenticated) return <Navigate to="/dashboard" />;

  const handleDevLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await authApi.devLogin(name, email, role);
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al iniciar sesion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <Card className="w-[440px]">
        <CardHeader className="text-center">
          <CardTitle>Conciliacion de Cuentas Transitorias</CardTitle>
          <CardDescription>Ingresa para comenzar</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <input
              type="text"
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="ADMIN">Administrador</option>
              <option value="CONCILIADOR">Conciliador</option>
              <option value="AUDITOR">Auditor</option>
            </select>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <Button onClick={handleDevLogin} className="w-full" size="lg" disabled={loading || !name || !email}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </Button>

          <p className="text-xs text-center text-gray-400 mt-2">
            Modo desarrollo — en produccion se usara Microsoft SSO
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
