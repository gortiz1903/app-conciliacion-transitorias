import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AccountsListPage from './pages/AccountsListPage';
import AccountDetailPage from './pages/AccountDetailPage';
import CsvUploadPage from './pages/CsvUploadPage';
import AdminUsersPage from './pages/AdminUsersPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="flex h-screen items-center justify-center">Cargando...</div>;
  if (!isAuthenticated) return <Navigate to="/login" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/accounts" element={<AccountsListPage />} />
                <Route path="/accounts/:accountId/agency/:agencyId" element={<AccountDetailPage />} />
                <Route path="/upload" element={<CsvUploadPage />} />
                <Route path="/admin/users" element={<AdminUsersPage />} />
                <Route path="*" element={<Navigate to="/dashboard" />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
