import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { AppShell } from '../../components/AppShell';

/** bare: a página já traz o próprio container (ex.: o Dashboard do cliente). */
export function AdminShell({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  return (
    <AppShell
      nav={
        <nav className="admin-nav" aria-label="Administração">
          <NavLink to="/admin/contas">Contas</NavLink>
          <NavLink to="/admin/usuarios">Usuários</NavLink>
          <NavLink to="/admin/sincronizacoes">Sincronizações</NavLink>
        </nav>
      }
    >
      {bare ? children : <div className="container">{children}</div>}
    </AppShell>
  );
}
