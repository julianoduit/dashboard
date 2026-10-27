import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAdminContas, useAdminUsuarios, type AdminConta, type AdminUsuario } from '../../api/admin';
import { Badge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { AdminShell } from './AdminShell';

function normaliza(s: string) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function NomesContas({ u, porId }: { u: AdminUsuario; porId: Map<number, AdminConta> }) {
  if (u.papel === 'admin') return <span className="muted">Todas (admin)</span>;
  if (!u.contas.length) return <Badge tom="warn">Sem conta vinculada</Badge>;
  const nomes = u.contas.map((id) => porId.get(id)?.nome ?? `#${id}`);
  const inativas = u.contas.filter((id) => porId.get(id) && !porId.get(id)!.ativo).length;
  return (
    <span>
      {nomes.slice(0, 2).join(', ')}
      {nomes.length > 2 ? ` +${nomes.length - 2}` : ''}
      {inativas ? <span className="cell-sub">{inativas} desativada(s): o cliente não vê</span> : null}
    </span>
  );
}

function Acoes({ u }: { u: AdminUsuario }) {
  return (
    <>
      {u.papel === 'cliente' ? (
        <Link className="btn btn--sm" to={`/admin/usuarios/${u.id}/ver`}>
          Ver como cliente
        </Link>
      ) : null}{' '}
      <Link className="btn btn--sm" to={`/admin/usuarios/${u.id}`}>
        Editar
      </Link>
    </>
  );
}

export function UsersPage() {
  const usuarios = useAdminUsuarios();
  const contas = useAdminContas();
  const [busca, setBusca] = useState('');
  const { toast, node } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const msg = (location.state as { msg?: string } | null)?.msg;
  useEffect(() => {
    if (msg) {
      toast(msg);
      navigate('.', { replace: true, state: null });
    }
  }, [msg, toast, navigate]);
  const porId = useMemo(() => new Map((contas.data ?? []).map((c) => [c.id, c])), [contas.data]);

  const lista = useMemo(() => {
    const q = normaliza(busca.trim());
    return (usuarios.data ?? []).filter((u) => !q || normaliza(u.nome).includes(q) || u.email.includes(q));
  }, [usuarios.data, busca]);

  return (
    <AdminShell>
      <div className="admin-head">
        <div>
          <h1 className="admin-head__title">Usuários</h1>
          <p className="admin-head__lead">Clientes veem só as contas vinculadas a eles. Admins veem tudo.</p>
        </div>
        <Link className="btn btn--primary" to="/admin/usuarios/novo">
          Novo usuário
        </Link>
      </div>

      <div className="toolbar">
        <input
          className="input toolbar__search"
          type="search"
          placeholder="Buscar por nome ou e-mail"
          aria-label="Buscar usuário"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <span className="toolbar__count">
          {lista.length} de {usuarios.data?.length ?? 0}
        </span>
      </div>

      {usuarios.error ? <p className="notice">{usuarios.error.message}</p> : null}
      {usuarios.isPending ? (
        <div className="empty">
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      ) : (
        <div className="card admin-card">
          {!lista.length ? <p className="empty">Nenhum usuário encontrado.</p> : null}
          <table className="admin-table admin-table--responsive" hidden={!lista.length}>
            <thead>
              <tr>
                <th scope="col">Usuário</th>
                <th scope="col">Papel</th>
                <th scope="col">Contas</th>
                <th scope="col" className="actions">
                  <span className="visually-hidden">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span className="cell-title">{u.nome}</span>
                    <span className="cell-sub">{u.email}</span>
                    {!u.ativo ? <Badge tom="erro">Desativado</Badge> : null}
                  </td>
                  <td>{u.papel === 'admin' ? 'Equipe Dúit' : 'Cliente'}</td>
                  <td>
                    <NomesContas u={u} porId={porId} />
                  </td>
                  <td className="actions">
                    <Acoes u={u} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="admin-list">
            {lista.map((u) => (
              <li key={u.id} className="admin-list__item">
                <div>
                  <span className="cell-title">{u.nome}</span>
                  <span className="cell-sub">
                    {u.email} · {u.papel === 'admin' ? 'Equipe Dúit' : 'Cliente'}
                  </span>
                  {!u.ativo ? <Badge tom="erro">Desativado</Badge> : null}
                </div>
                <NomesContas u={u} porId={porId} />
                <div className="admin-list__row">
                  <Acoes u={u} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {node}
    </AdminShell>
  );
}
