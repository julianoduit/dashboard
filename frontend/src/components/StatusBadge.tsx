import type { SyncStatus } from '../api/admin';

const MAPA: Record<SyncStatus, { classe: string; texto: string }> = {
  sucesso: { classe: 'badge--ok', texto: 'Sucesso' },
  erro: { classe: 'badge--erro', texto: 'Erro' },
  executando: { classe: 'badge--run', texto: 'Sincronizando' },
  adiado: { classe: 'badge--warn', texto: 'Adiado (cota do dia)' },
};

export function SyncBadge({ status }: { status: SyncStatus | null }) {
  if (!status) return <span className="badge">Nunca sincronizada</span>;
  const m = MAPA[status];
  return (
    <span className={`badge ${m.classe}`}>
      <span className="badge__dot" aria-hidden="true" />
      {m.texto}
    </span>
  );
}

export function Badge({ tom, children }: { tom?: 'ok' | 'erro' | 'warn'; children: string }) {
  return (
    <span className={`badge${tom ? ` badge--${tom}` : ''}`}>
      {tom ? <span className="badge__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
