import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useAdminContas, useAlterarConta, useAtualizarMcc, useSincronizar, type AdminConta } from '../../api/admin';
import { Badge, SyncBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { customerId, dataHora, tempoRelativo } from '../../lib/format';
import { AdminShell } from './AdminShell';

type Filtro = 'todas' | 'ativas' | 'inativas' | 'erro' | 'fora';

const FILTROS: Array<{ id: Filtro; rotulo: string }> = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'ativas', rotulo: 'Sincronizando (ativas)' },
  { id: 'inativas', rotulo: 'Desativadas' },
  { id: 'erro', rotulo: 'Com erro na última sync' },
  { id: 'fora', rotulo: 'Fora da MCC' },
];

function aplicaFiltro(c: AdminConta, f: Filtro): boolean {
  switch (f) {
    case 'ativas':
      return c.ativo;
    case 'inativas':
      return !c.ativo;
    case 'erro':
      return c.ultima_sync_status === 'erro';
    case 'fora':
      return !c.na_mcc;
    default:
      return true;
  }
}

function normaliza(s: string) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function StatusGoogle({ c }: { c: AdminConta }) {
  if (!c.na_mcc) return <Badge tom="warn">Fora da MCC</Badge>;
  if (c.status_google && c.status_google !== 'ENABLED') return <Badge tom="warn">{c.status_google === 'SUSPENDED' ? 'Suspensa no Google' : c.status_google}</Badge>;
  return null;
}

function UltimaSync({ c }: { c: AdminConta }) {
  return (
    <>
      <SyncBadge status={c.ultima_sync_status} />
      {c.ultima_sync_em ? (
        <span className="cell-sub" title={dataHora(c.ultima_sync_em, c.fuso)}>
          {tempoRelativo(c.ultima_sync_em)}
        </span>
      ) : null}
      {c.ultima_sync_status === 'erro' && c.ultima_sync_erro ? (
        <span className="cell-sub" style={{ color: 'var(--bad)', maxWidth: 280, whiteSpace: 'normal' }}>
          {c.ultima_sync_erro.slice(0, 140)}
        </span>
      ) : null}
    </>
  );
}

function Acoes({ c, onSync }: { c: AdminConta; onSync: (c: AdminConta) => void }) {
  const rodando = c.ultima_sync_status === 'executando';
  return (
    <>
      <button
        type="button"
        className="btn btn--sm"
        disabled={!c.ativo || rodando}
        title={!c.ativo ? 'Ative a conta para sincronizar' : undefined}
        onClick={() => onSync(c)}
      >
        {rodando ? 'Sincronizando...' : 'Sincronizar'}
      </button>{' '}
      <Link className="btn btn--sm" to={`/admin/contas/${c.id}`}>
        Ver dashboard
      </Link>
    </>
  );
}

export function AccountsPage() {
  const contas = useAdminContas();
  const mcc = useAtualizarMcc();
  const alterar = useAlterarConta();
  const sync = useSincronizar();
  const { toast, node } = useToast();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');

  const lista = useMemo(() => {
    const q = normaliza(busca.trim()).replace(/-/g, '');
    return (contas.data ?? []).filter(
      (c) => aplicaFiltro(c, filtro) && (!q || normaliza(c.nome).includes(q) || c.customer_id.includes(q)),
    );
  }, [contas.data, busca, filtro]);

  const sincronizar = (c: AdminConta) =>
    sync.mutate(c.id, {
      onSuccess: () => toast(`Sincronização de "${c.nome}" iniciada`),
      onError: (e) => toast(e.message),
    });

  const alternar = (c: AdminConta, campo: 'ativo' | 'exibirRoas', valor: boolean) =>
    alterar.mutate({ id: c.id, [campo]: valor }, { onError: (e) => toast(e.message) });

  return (
    <AdminShell>
      <div className="admin-head">
        <div>
          <h1 className="admin-head__title">Contas da MCC</h1>
          <p className="admin-head__lead">Ative as contas que devem ser sincronizadas e aparecer para os clientes vinculados.</p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          disabled={mcc.isPending}
          onClick={() =>
            mcc.mutate(undefined, {
              onSuccess: (r) => toast(`Lista atualizada: ${r.contas} contas na MCC`),
              onError: (e) => toast(e.message),
            })
          }
        >
          {mcc.isPending ? 'Consultando o Google...' : 'Atualizar lista da MCC'}
        </button>
      </div>

      <div className="toolbar">
        <input
          className="input toolbar__search"
          type="search"
          placeholder="Buscar por nome ou ID"
          aria-label="Buscar conta"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select className="select" style={{ width: 'auto' }} aria-label="Filtrar contas" value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
          {FILTROS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.rotulo}
            </option>
          ))}
        </select>
        <span className="toolbar__count">
          {lista.length} de {contas.data?.length ?? 0}
        </span>
      </div>

      {contas.error ? <p className="notice">{contas.error.message}</p> : null}
      {contas.isPending ? (
        <div className="empty">
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      ) : (
        <div className="card admin-card">
          {!lista.length ? <p className="empty">Nenhuma conta encontrada.</p> : null}
          <table className="admin-table admin-table--responsive" hidden={!lista.length}>
            <thead>
              <tr>
                <th scope="col">Conta</th>
                <th scope="col">Sincronizar</th>
                <th scope="col" title="Mostrar valor de conversão e ROAS para o cliente">
                  Valor/ROAS
                </th>
                <th scope="col" className="num">
                  Clientes
                </th>
                <th scope="col">Última sincronização</th>
                <th scope="col" className="actions">
                  <span className="visually-hidden">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="cell-title">{c.nome}</span>
                    <span className="cell-sub">
                      {customerId(c.customer_id)} · {c.moeda}
                    </span>
                    <StatusGoogle c={c} />
                  </td>
                  <td>
                    <label className="switch">
                      <input type="checkbox" checked={c.ativo} onChange={(e) => alternar(c, 'ativo', e.target.checked)} />
                      <span className="visually-hidden">Sincronizar {c.nome}</span>
                    </label>
                  </td>
                  <td>
                    <label className="switch switch--pref">
                      <input type="checkbox" checked={c.exibir_roas} onChange={(e) => alternar(c, 'exibirRoas', e.target.checked)} />
                      <span className="visually-hidden">Mostrar valor de conversão e ROAS de {c.nome}</span>
                    </label>
                  </td>
                  <td className="num">{c.usuarios}</td>
                  <td>
                    <UltimaSync c={c} />
                  </td>
                  <td className="actions">
                    <Acoes c={c} onSync={sincronizar} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="admin-list">
            {lista.map((c) => (
              <li key={c.id} className="admin-list__item">
                <div>
                  <span className="cell-title">{c.nome}</span>
                  <span className="cell-sub">
                    {customerId(c.customer_id)} · {c.usuarios} {c.usuarios === 1 ? 'cliente' : 'clientes'}
                  </span>
                  <StatusGoogle c={c} />
                </div>
                <div className="admin-list__row">
                  <label className="switch">
                    <input type="checkbox" checked={c.ativo} onChange={(e) => alternar(c, 'ativo', e.target.checked)} />
                    Sincronizar
                  </label>
                  <label className="switch switch--pref">
                    <input type="checkbox" checked={c.exibir_roas} onChange={(e) => alternar(c, 'exibirRoas', e.target.checked)} />
                    Valor/ROAS
                  </label>
                </div>
                <div className="admin-list__row">
                  <UltimaSync c={c} />
                </div>
                <div className="admin-list__row">
                  <Acoes c={c} onSync={sincronizar} />
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
