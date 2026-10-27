import { getPool, type Queryable } from '../pool.js';

/** Namespace do advisory lock de sync (pg_try_advisory_lock(SYNC_LOCK_NAMESPACE, ad_account_id)). */
export const SYNC_LOCK_NAMESPACE = 72_001;

export type SyncRunType = 'diario' | 'manual' | 'backfill';

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

export async function finishRunSuccess(id: number, linhas: number, db: Queryable = getPool()): Promise<void> {
  await db.query(`UPDATE sync_runs SET status = 'sucesso', fim = now(), linhas_gravadas = $2 WHERE id = $1`, [id, linhas]);
}

export async function finishRunError(id: number, erro: string, linhas: number, db: Queryable = getPool()): Promise<void> {
  await db.query(`UPDATE sync_runs SET status = 'erro', fim = now(), erro = $2, linhas_gravadas = $3 WHERE id = $1`, [
    id,
    erro.slice(0, 4000),
    linhas,
  ]);
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
  status: 'executando' | 'sucesso' | 'erro';
  periodo_inicio: string;
  periodo_fim: string;
  inicio: Date;
  fim: Date | null;
  linhas_gravadas: number;
  erro: string | null;
  disparado_por_nome: string | null;
}

export async function list(
  filter: { adAccountId?: number; status?: string; limit: number },
  db: Queryable = getPool(),
): Promise<SyncRunRow[]> {
  const res = await db.query<SyncRunRow>(
    `SELECT r.id, r.ad_account_id, a.nome AS conta_nome, a.customer_id, r.tipo, r.status,
            r.periodo_inicio, r.periodo_fim, r.inicio, r.fim, r.linhas_gravadas, r.erro, u.nome AS disparado_por_nome
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
