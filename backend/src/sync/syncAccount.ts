import type pg from 'pg';
import { env } from '../config/env.js';
import * as accounts from '../db/repositories/accounts.js';
import * as metrics from '../db/repositories/metrics.js';
import * as syncRuns from '../db/repositories/syncRuns.js';
import { getPool } from '../db/pool.js';
import { GoogleAdsApiError } from '../googleAds/errors.js';
import { mapCampaignRow, mapConversionActionRow } from '../googleAds/mappers.js';
import {
  campaignDailyQuery,
  conversionActionDailyQuery,
  type CampaignDailyRow,
  type ConversionActionDailyRow,
} from '../googleAds/queries.js';
import { addDays, addMonths, splitByMonth, todayInTimeZone } from '../lib/dates.js';
import { logger } from '../logger.js';

export interface SearchClient {
  searchStream<T>(customerId: string, query: string): Promise<T[]>;
}

export interface SyncOptions {
  client: SearchClient;
  tipo?: 'diario' | 'manual';
  disparadoPor?: number | null;
  now?: Date;
  windowDays?: number;
  backfillMonths?: number;
}

export interface SyncResult {
  syncRunId: number;
  status: 'sucesso' | 'erro';
  linhas: number;
  inicio: string;
  fim: string;
  erro?: string;
}

export class SyncAlreadyRunningError extends Error {
  constructor(customerId: string) {
    super(`Já existe uma sincronização em andamento para a conta ${customerId}`);
    this.name = 'SyncAlreadyRunningError';
  }
}

/**
 * Período a sincronizar, no fuso da conta. O dia de hoje fica de fora: com sync às 05:00 ele
 * teria só algumas horas e ficaria congelado assim até o dia seguinte.
 */
export function syncRange(
  account: Pick<accounts.AdAccount, 'fuso' | 'backfill_concluido'>,
  opts: { now: Date; windowDays: number; backfillMonths: number },
): { inicio: string; fim: string; backfill: boolean } {
  const fim = addDays(todayInTimeZone(account.fuso, opts.now), -1);
  if (!account.backfill_concluido) {
    return { inicio: addDays(addMonths(fim, -opts.backfillMonths), 1), fim, backfill: true };
  }
  return { inicio: addDays(fim, -(opts.windowDays - 1)), fim, backfill: false };
}

function describeError(err: unknown): string {
  if (err instanceof GoogleAdsApiError) return err.toSafeString();
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Sincroniza uma conta: reprocessa o período (janela ou backfill) em blocos mensais.
 * Cada bloco é gravado numa transação: upsert de tudo que veio + remoção do que não veio mais.
 * Erros são gravados em sync_runs e devolvidos no resultado (não lançados), para que o
 * chamador siga para a próxima conta.
 */
export async function syncAccount(accountId: number, opts: SyncOptions): Promise<SyncResult> {
  const pool = getPool();
  const account = await accounts.findById(accountId, pool);
  if (!account) throw new Error(`Conta ${accountId} não encontrada`);

  const lockClient = await pool.connect();
  try {
    const lock = await lockClient.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1, $2) AS ok', [
      syncRuns.SYNC_LOCK_NAMESPACE,
      account.id,
    ]);
    if (!lock.rows[0]?.ok) throw new SyncAlreadyRunningError(account.customer_id);

    try {
      return await runLocked(account, lockClient, opts);
    } finally {
      await lockClient.query('SELECT pg_advisory_unlock($1, $2)', [syncRuns.SYNC_LOCK_NAMESPACE, account.id]);
    }
  } finally {
    lockClient.release();
  }
}

async function runLocked(account: accounts.AdAccount, db: pg.PoolClient, opts: SyncOptions): Promise<SyncResult> {
  const config = env();
  const range = syncRange(account, {
    now: opts.now ?? new Date(),
    windowDays: opts.windowDays ?? config.SYNC_WINDOW_DAYS,
    backfillMonths: opts.backfillMonths ?? config.SYNC_BACKFILL_MONTHS,
  });
  const tipo = range.backfill ? 'backfill' : (opts.tipo ?? 'diario');
  const runId = await syncRuns.startRun(
    { adAccountId: account.id, tipo, inicio: range.inicio, fim: range.fim, disparadoPor: opts.disparadoPor ?? null },
    db,
  );
  const log = logger.child({ customerId: account.customer_id, syncRunId: runId, tipo });
  log.info({ inicio: range.inicio, fim: range.fim }, 'Sync iniciado');

  let linhas = 0;
  try {
    for (const chunk of splitByMonth(range.inicio, range.fim)) {
      const [campaignRows, conversionRows] = await Promise.all([
        opts.client.searchStream<CampaignDailyRow>(account.customer_id, campaignDailyQuery(chunk.inicio, chunk.fim)),
        opts.client.searchStream<ConversionActionDailyRow>(
          account.customer_id,
          conversionActionDailyQuery(chunk.inicio, chunk.fim),
        ),
      ]);

      await db.query('BEGIN');
      try {
        const c = await metrics.upsertCampaignDaily(db, account.id, runId, campaignRows.map(mapCampaignRow));
        const a = await metrics.upsertConversionActionDaily(db, account.id, runId, conversionRows.map(mapConversionActionRow));
        const removed = await metrics.deleteStaleInRange(db, account.id, runId, chunk.inicio, chunk.fim);
        await db.query('COMMIT');
        linhas += c + a;
        log.debug({ ...chunk, campanhas: c, acoes: a, removidas: removed }, 'Bloco gravado');
      } catch (err) {
        await db.query('ROLLBACK');
        throw err;
      }
    }

    await accounts.markSynced(account.id, range.backfill, db);
    await syncRuns.finishRunSuccess(runId, linhas, db);
    log.info({ linhas }, 'Sync concluído');
    return { syncRunId: runId, status: 'sucesso', linhas, inicio: range.inicio, fim: range.fim };
  } catch (err) {
    const erro = describeError(err);
    await syncRuns.finishRunError(runId, erro, linhas, db);
    log.error({ erro, linhas }, 'Sync falhou');
    return { syncRunId: runId, status: 'erro', linhas, inicio: range.inicio, fim: range.fim, erro };
  }
}
