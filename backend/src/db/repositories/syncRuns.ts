import { getPool, type Queryable } from '../pool.js';

/** Namespace do advisory lock de sync (pg_try_advisory_lock(SYNC_LOCK_NAMESPACE, ad_account_id)). */
export const SYNC_LOCK_NAMESPACE = 72_001;

export type SyncRunType = 'diario' | 'manual' | 'backfill';
export type SyncRunStatus = 'executando' | 'sucesso' | 'erro' | 'adiado';

export async function startRun(
  input: { adAccountId: number; tipo: SyncRunType; inicio: string; fim: string; disparadoPor?: number | null },
  db: Queryable = getPool(),
): Promise<number> {
  const res = await db.query<{ id: number }>(
    `INSERT INTO sync_runs (ad_account_id, tipo, periodo_inicio, periodo_fim, disparado_por)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [input.adAccountId, input.tipo, input.inicio, input.fim, input.disparadoPor ?? null],
  );
  return res.rows[0]!.id;
}

export async function finishRun(
  id: number,
  r: { status: Exclude<SyncRunStatus, 'executando'>; linhas: number; operacoes: number; periodoInicio?: string; erro?: string; observacao?: string },
  db: Queryable = getPool(),
): Promise<void> {
  await db.query(
    `UPDATE sync_runs SET status = $2, fim = now(), linhas_gravadas = $3, operacoes = $4,
            periodo_inicio = coalesce($5::date, periodo_inicio), erro = $6, observacao = $7
      WHERE id = $1`,
    [id, r.status, r.linhas, r.operacoes, r.periodoInicio ?? null, r.erro?.slice(0, 4000) ?? null, r.observacao ?? null],
  );
}

/** Operações gastas hoje (no fuso informado) por todas as execuções do dashboard. */
export async function operationsUsedToday(timeZone: string, db: Queryable = getPool()): Promise<number> {
  const res = await db.query<{ n: number }>(
    `SELECT coalesce(sum(operacoes), 0)::int AS n FROM sync_runs
      WHERE (inicio AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date`,
    [timeZone],
  );
  return res.rows[0]!.n;
}

/**
 * Execuções que ficaram "executando" porque o processo caiu no meio. Só marca as que
 * não têm nenhuma sessão segurando o lock da conta (ou seja, ninguém está sincronizando).
 */
export async function failInterruptedRuns(db: Queryable = getPool()): Promise<number> {
  const res = await db.query(
    `UPDATE sync_runs r
        SET status = 'erro', fim = now(), erro = 'Interrompida: o processo foi reiniciado durante a sincronização'
      WHERE r.status = 'executando'
        AND NOT EXISTS (
          SELECT 1 FROM pg_locks l
           WHERE l.locktype = 'advisory' AND l.granted
             AND l.classid = $1 AND l.objid = r.ad_account_id AND l.objsubid = 2
        )`,
    [SYNC_LOCK_NAMESPACE],
  );
  return res.rowCount ?? 0;
}

export interface SyncRunRow {
  id: number;
  ad_account_id: number;
  conta_nome: string;
  customer_id: string;
  tipo: SyncRunType;
  status: SyncRunStatus;
  periodo_inicio: string;
  periodo_fim: string;
  inicio: Date;
  fim: Date | null;
  linhas_gravadas: number;
  operacoes: number;
  erro: string | null;
  observacao: string | null;
  disparado_por_nome: string | null;
}

export async function list(
  filter: { adAccountId?: number; status?: string; limit: number },
  db: Queryable = getPool(),
): Promise<SyncRunRow[]> {
  const res = await db.query<SyncRunRow>(
    `SELECT r.id, r.ad_account_id, a.nome AS conta_nome, a.customer_id, r.tipo, r.status,
            r.periodo_inicio, r.periodo_fim, r.inicio, r.fim, r.linhas_gravadas, r.operacoes, r.erro, r.observacao, u.nome AS disparado_por_nome
       FROM sync_runs r
       JOIN ad_accounts a ON a.id = r.ad_account_id
       LEFT JOIN users u ON u.id = r.disparado_por
      WHERE ($1::bigint IS NULL OR r.ad_account_id = $1)
        AND ($2::sync_run_status IS NULL OR r.status = $2)
      ORDER BY r.id DESC
      LIMIT $3`,
    [filter.adAccountId ?? null, filter.status ?? null, filter.limit],
  );
  return res.rows;
}

export async function isRunning(adAccountId: number, db: Queryable = getPool()): Promise<boolean> {
  const res = await db.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND granted AND classid = $1 AND objid = $2 AND objsubid = 2
     ) AS ok`,
    [SYNC_LOCK_NAMESPACE, adAccountId],
  );
  return res.rows[0]!.ok;
}
