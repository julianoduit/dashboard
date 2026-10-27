import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { AccountsPage } from './pages/admin/AccountsPage';
import { SyncRunsPage } from './pages/admin/SyncRunsPage';
import { UserFormPage } from './pages/admin/UserFormPage';
import { UsersPage } from './pages/admin/UsersPage';
import { AccountDashboardPage, ViewAsPage } from './pages/admin/ViewAsPage';
import { ClientHome } from './pages/client/ClientHome';

function Carregando() {
  return (
    <div className="loading">
      <div className="spinner" />
    </div>
  );
}

function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { usuario, carregando } = useAuth();
  const location = useLocation();
  if (carregando) return <Carregando />;
  if (!usuario) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  // Esconder a tela é só conveniência: quem garante o acesso é o backend (rotas /api/admin exigem admin).
  if (admin && usuario.papel !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Home() {
  const { usuario } = useAuth();
  return usuario?.papel === 'admin' ? <Navigate to="/admin/contas" replace /> : <ClientHome />;
}

const admin = (el: ReactNode) => <RequireAuth admin>{el}</RequireAuth>;

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Home />
            </RequireAuth>
          }
        />
        <Route path="/admin" element={<Navigate to="/admin/contas" replace />} />
        <Route path="/admin/contas" element={admin(<AccountsPage />)} />
        <Route path="/admin/contas/:id" element={admin(<AccountDashboardPage />)} />
        <Route path="/admin/usuarios" element={admin(<UsersPage />)} />
        <Route path="/admin/usuarios/:id" element={admin(<UserFormPage />)} />
        <Route path="/admin/usuarios/:id/ver" element={admin(<ViewAsPage />)} />
        <Route path="/admin/sincronizacoes" element={admin(<SyncRunsPage />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
