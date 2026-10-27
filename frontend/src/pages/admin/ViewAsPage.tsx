import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useConta, useContasDoUsuario } from '../../api/admin';
import { AdminShell } from './AdminShell';
import { Dashboard } from '../client/Dashboard';

function Faixa({ children }: { children: ReactNode }) {
  return <div className="impersonation">{children}</div>;
}

/** "Ver como cliente": mesmas contas e mesma tela que o cliente enxerga. */
export function ViewAsPage() {
  const userId = Number(useParams().id);
  const q = useContasDoUsuario(userId);
  return (
    <AdminShell bare>
      {q.isPending ? (
        <div className="empty">
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      ) : q.error ? (
        <div className="container">
          <p className="notice">{q.error.message}</p>
        </div>
      ) : (
        <>
          <Dashboard
            contas={q.data.contas}
            titulo={
              <Faixa>
                <span>
                  Você está vendo o dashboard como <strong>{q.data.usuario.nome}</strong> ({q.data.usuario.email}).
                  {q.data.contas.length ? ` ${q.data.contas.length} conta(s) visível(is).` : ''}
                </span>
                <Link to={`/admin/usuarios/${userId}`} className="link-btn">
                  Editar acesso
                </Link>
              </Faixa>
            }
          />
        </>
      )}
    </AdminShell>
  );
}

/** Dashboard de uma conta para a equipe (mesma tela do cliente). */
export function AccountDashboardPage() {
  const id = Number(useParams().id);
  const q = useConta(id);
  return (
    <AdminShell bare>
      {q.isPending ? (
        <div className="empty">
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      ) : q.error ? (
        <div className="container">
          <p className="notice">{q.error.message}</p>
        </div>
      ) : (
        <>
          <Dashboard
            contas={[q.data]}
            titulo={
              <Faixa>
                <span>Visão da equipe Dúit: é exatamente o que os clientes vinculados a esta conta veem.</span>
                <Link to="/admin/contas" className="link-btn">
                  ← Contas
                </Link>
              </Faixa>
            }
          />
        </>
      )}
    </AdminShell>
  );
}
