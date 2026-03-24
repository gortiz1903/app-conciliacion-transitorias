import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Navigate } from 'react-router-dom';

export default function LoginPage() {
  const { isAuthenticated, login, isLoading } = useAuth();

  if (isLoading) return <div className="flex h-screen items-center justify-center">Cargando...</div>;
  if (isAuthenticated) return <Navigate to="/dashboard" />;

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <Card className="w-[400px]">
        <CardHeader className="text-center">
          <CardTitle>Conciliacion de Cuentas Transitorias</CardTitle>
          <CardDescription>Inicia sesion con tu cuenta corporativa de Microsoft</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={login} className="w-full" size="lg">
            Iniciar sesion con Microsoft
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
