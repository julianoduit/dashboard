import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';

export function AppShell({ children, nav }: { children: ReactNode; nav?: ReactNode }) {
  const { usuario, logout } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__inner">
          <Link to="/" className="brand" aria-label="Início">
            <img src="/brand/logo.svg" alt="Dúit Marketing" />
          </Link>
          {nav}
          <div className="topbar__spacer" />
          {usuario ? (
            <div className="user-menu">
              <span className="user-menu__name">{usuario.nome}</span>
              <button type="button" className="btn btn--ghost" onClick={() => void logout()}>
                Sair
              </button>
            </div>
          ) : null}
        </div>
      </header>
      <main className="main">{children}</main>
      <footer className="footer">Dúit Marketing · dados do Google Ads</footer>
    </div>
  );
}
