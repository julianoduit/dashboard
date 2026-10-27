import { useState } from 'react';
import { useAdminContas, useSyncRuns, type SyncRun, type SyncStatus } from '../../api/admin';
import { SyncBadge } from '../../components/StatusBadge';
import { customerId, dataCurta, dataHora, duracao, numero } from '../../lib/format';
import { AdminShell } from './AdminShell';

const TIPOS: Record<SyncRun['tipo'], string> = { diario: 'Diária', manual: 'Manual', backfill: 'Carga inicial (13 meses)' };

function Erro({ r }: { r: SyncRun }) {
  if (!r.erro) return null;
  return (
    <details>
      <summary className="link-btn" style={{ color: 'var(--bad)' }}>
        Ver erro
      </summary>
      <pre className="error-text">{r.erro}</pre>
    </details>
  );
}

export function SyncRunsPage() {
  const contas = useAdminContas();
  const [status, setStatus] = useState<SyncStatus | ''>('');
  const [accountId, setAccountId] = useState<number | ''>('');
  const runs = useSyncRuns({ ...(status && { status }), ...(accountId && { accountId }) });

  const descricao = (r: SyncRun) => `${dataCurta(r.periodo_inicio)} a ${dataCurta(r.periodo_fim)}`;
  const quem = (r: SyncRun) => (r.disparado_por_nome ? `por ${r.disparado_por_nome}` : r.tipo === 'diario' ? 'automática' : '');

  return (
    <AdminShell>
      <div className="admin-head">
        <div>
          <h1 className="admin-head__title">Sincronizações</h1>
          <p className="admin-head__lead">Histórico das execuções do sync com a Google Ads API (mais recentes primeiro).</p>
        </div>
      </div>

      <div className="toolbar">
        <select className="select" style={{ width: 'auto' }} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as SyncStatus | '')}>
          <option value="">Todos os status</option>
          <option value="erro">Só erros</option>
          <option value="sucesso">Só sucesso</option>
          <option value="executando">Em andamento</option>
        </select>
        <select
          className="select"
          style={{ width: 'auto', maxWidth: 320 }}
          aria-label="Conta"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">Todas as contas</option>
          {(contas.data ?? [])
            .filter((c) => c.ativo || c.ultima_sync_status)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
        </select>
        <span className="toolbar__count">{runs.data ? `${runs.data.length} execuções` : ''}</span>
      </div>

      {runs.error ? <p className="notice">{runs.error.message}</p> : null}
      {runs.isPending ? (
        <div className="empty">
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      ) : (
        <div className="card admin-card">
          {!runs.data?.length ? <p className="empty">Nenhuma sincronização encontrada.</p> : null}
          <table className="admin-table admin-table--responsive" hidden={!runs.data?.length}>
            <thead>
              <tr>
                <th scope="col">Conta</th>
                <th scope="col">Status</th>
                <th scope="col">Tipo</th>
                <th scope="col">Período reprocessado</th>
                <th scope="col">Início</th>
                <th scope="col" className="num">
                  Duração
                </th>
                <th scope="col" className="num">
                  Linhas
                </th>
              </tr>
            </thead>
            <tbody>
              {runs.data?.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="cell-title">{r.conta_nome}</span>
                    <span className="cell-sub">{customerId(r.customer_id)}</span>
                  </td>
                  <td>
                    <SyncBadge status={r.status} />
                    <Erro r={r} />
                  </td>
                  <td>
                    {TIPOS[r.tipo]}
                    <span className="cell-sub">{quem(r)}</span>
                  </td>
                  <td>{descricao(r)}</td>
                  <td>{dataHora(r.inicio)}</td>
                  <td className="num">{duracao(r.inicio, r.fim)}</td>
                  <td className="num">{numero(r.linhas_gravadas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="admin-list">
            {runs.data?.map((r) => (
              <li key={r.id} className="admin-list__item">
                <div className="admin-list__row" style={{ justifyContent: 'space-between' }}>
                  <span className="cell-title">{r.conta_nome}</span>
                  <SyncBadge status={r.status} />
                </div>
                <span className="cell-sub">
                  {TIPOS[r.tipo]} {quem(r)} · {dataHora(r.inicio)} · {duracao(r.inicio, r.fim)} · {numero(r.linhas_gravadas)} linhas
                </span>
                <span className="cell-sub">Período: {descricao(r)}</span>
                <Erro r={r} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </AdminShell>
  );
}
