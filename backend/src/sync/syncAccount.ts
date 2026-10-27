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
import { addDays, addMonths, splitByMonth, startOfMonth, todayInTimeZone } from '../lib/dates.js';
import { dataCurta } from '../lib/format.js';
import { logger } from '../logger.js';

export interface SearchClient {
  searchStream<T>(customerId: string, query: string, onAttempt?: () => void): Promise<T[]>;
}

/**
 * completo: janela recente + histórico (sync manual).
 * janela: só os últimos N dias (1ª passada do sync diário).
 * historico: só avança a carga histórica (2ª passada do sync diário, com a sobra da cota).
 */
export type SyncModo = 'completo' | 'janela' | 'historico';

export interface SyncOptions {
  client: SearchClient;
  tipo?: 'diario' | 'manual';
  modo?: SyncModo;
  disparadoPor?: number | null;
  now?: Date;
  windowDays?: number;
  backfillMonths?: number;
  dailyBudget?: number;
}

export interface SyncResult {
  syncRunId: number;
  status: 'sucesso' | 'erro' | 'adiado';
  linhas: number;
  operacoes: number;
  inicio: string;
  fim: string;
  historicoCompleto: boolean;
  erro?: string;
  observacao?: string;
}

export class SyncAlreadyRunningError extends Error {
  constructor(customerId: string) {
    super(`Já existe uma sincronização em andamento para a conta ${customerId}`);
    this.name = 'SyncAlreadyRunningError';
  }
}

/** Cada bloco (um mês) custa duas consultas: campanhas e ações de conversão. */
export const OPS_POR_BLOCO = 2;

interface Periodo {
  inicio: string;
  fim: string;
}

/**
 * Janela recente, no fuso da conta. O dia de hoje fica de fora: com sync às 05:00 ele teria só
 * algumas horas e ficaria congelado assim até o dia seguinte.
 */
export function janelaRecente(fuso: string, now: Date, windowDays: number): Periodo {
  const fim = addDays(todayInTimeZone(fuso, now), -1);
  return { inicio: addDays(fim, -(windowDays - 1)), fim };
}

/** Data mais antiga que a carga histórica deve alcançar. */
export function alvoHistorico(fim: string, months: number): string {
  return addDays(addMonths(fim, -months), 1);
}

/** Próximo mês a carregar, imediatamente antes de `desde` e sem passar do alvo. null = completo. */
export function proximoBlocoHistorico(desde: string, alvo: string): Periodo | null {
  if (desde <= alvo) return null;
  const fim = addDays(desde, -1);
  const inicioMes = startOfMonth(fim);
  return { inicio: inicioMes < alvo ? alvo : inicioMes, fim };
}

function describeError(err: unknown): string {
  if (err instanceof GoogleAdsApiError) return err.toSafeString();
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Sincroniza uma conta respeitando o orçamento diário de operações. Cada bloco mensal é gravado
 * numa transação (upsert de tudo que veio + remoção do que não veio mais) e a carga histórica é
 * registrada bloco a bloco, então uma execução interrompida continua de onde parou.
 * Erros da API viram sync_run com status erro e são devolvidos, não lançados.
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
  const modo = opts.modo ?? 'completo';
  const janela = janelaRecente(account.fuso, opts.now ?? new Date(), opts.windowDays ?? config.SYNC_WINDOW_DAYS);
  const alvo = alvoHistorico(janela.fim, opts.backfillMonths ?? config.SYNC_BACKFILL_MONTHS);
  const orcamento = opts.dailyBudget ?? config.SYNC_DAILY_OPS_BUDGET;
  const disponivel = orcamento - (await syncRuns.operationsUsedToday(config.SYNC_TZ, db));

  const fazJanela = modo !== 'historico';
  // Sem janela carregada não há de onde recuar: o histórico só avança depois da 1ª janela.
  const fazHistorico = modo !== 'janela' && (fazJanela || account.historico_ate !== null);
  // De onde o histórico recua: a data mais antiga já carregada (ou o início da janela).
  let desde = account.historico_ate && account.historico_ate < janela.inicio ? account.historico_ate : janela.inicio;
  if (!fazJanela && account.historico_ate) desde = account.historico_ate;

  const primeiro = fazJanela ? janela : proximoBlocoHistorico(desde, alvo);
  const tipo = modo === 'historico' ? 'backfill' : (opts.tipo ?? 'diario');
  const runId = await syncRuns.startRun(
    {
      adAccountId: account.id,
      tipo,
      inicio: primeiro?.inicio ?? alvo,
      fim: primeiro?.fim ?? janela.fim,
      disparadoPor: opts.disparadoPor ?? null,
    },
    db,
  );
  const log = logger.child({ customerId: account.customer_id, syncRunId: runId, modo });

  let linhas = 0;
  let operacoes = 0;
  let maisAntigo: string | undefined;
  const temOrcamento = () => disponivel - operacoes >= OPS_POR_BLOCO;
  const contar = () => {
    operacoes++;
  };

  const syncBloco = async (bloco: Periodo) => {
    const [campaignRows, conversionRows] = await Promise.all([
      opts.client.searchStream<CampaignDailyRow>(account.customer_id, campaignDailyQuery(bloco.inicio, bloco.fim), contar),
      opts.client.searchStream<ConversionActionDailyRow>(account.customer_id, conversionActionDailyQuery(bloco.inicio, bloco.fim), contar),
    ]);
    await db.query('BEGIN');
    try {
      const c = await metrics.upsertCampaignDaily(db, account.id, runId, campaignRows.map(mapCampaignRow));
      const a = await metrics.upsertConversionActionDaily(db, account.id, runId, conversionRows.map(mapConversionActionRow));
      await metrics.deleteStaleInRange(db, account.id, runId, bloco.inicio, bloco.fim);
      await db.query('COMMIT');
      linhas += c + a;
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
    if (!maisAntigo || bloco.inicio < maisAntigo) maisAntigo = bloco.inicio;
  };

  const cotaAtingida = () =>
    `Cota diária do dashboard atingida (${orcamento} operações na Google Ads API). Continua no próximo sync.`;

  try {
    let adiado = false;
    if (fazJanela) {
      for (const bloco of splitByMonth(janela.inicio, janela.fim)) {
        if (!temOrcamento()) {
          adiado = true;
          break;
        }
        await syncBloco(bloco);
      }
      if (!adiado) {
        await accounts.markSynced(account.id, db);
        await accounts.extendHistory(account.id, janela.inicio, db);
      }
    }

    let paradoPorCota = false;
    if (fazHistorico && !adiado) {
      for (let bloco = proximoBlocoHistorico(desde, alvo); bloco; bloco = proximoBlocoHistorico(desde, alvo)) {
        if (!temOrcamento()) {
          paradoPorCota = true;
          break;
        }
        await syncBloco(bloco);
        await accounts.extendHistory(account.id, bloco.inicio, db);
        desde = bloco.inicio;
      }
      // Na passada só de histórico, não ter cota nem para o 1º mês é "adiado", não "sucesso".
      if (!fazJanela && paradoPorCota && operacoes === 0) adiado = true;
    }

    const historicoCompleto = fazHistorico ? desde <= alvo : (account.historico_ate ?? janela.inicio) <= alvo;
    const status = adiado ? 'adiado' : 'sucesso';
    const observacao = adiado
      ? cotaAtingida()
      : paradoPorCota
        ? `Histórico carregado desde ${dataCurta(desde)}; o restante continua no próximo sync (cota do dia).`
        : undefined;
    await syncRuns.finishRun(
      runId,
      { status, linhas, operacoes, ...(maisAntigo && { periodoInicio: maisAntigo }), ...(observacao && { observacao }) },
      db,
    );
    log.info({ status, linhas, operacoes, historicoDesde: desde }, 'Sync concluído');
    return {
      syncRunId: runId,
      status,
      linhas,
      operacoes,
      inicio: maisAntigo ?? primeiro?.inicio ?? janela.inicio,
      fim: janela.fim,
      historicoCompleto,
      ...(observacao && { observacao }),
    };
  } catch (err) {
    const erro = describeError(err);
    await syncRuns.finishRun(runId, { status: 'erro', linhas, operacoes, erro, ...(maisAntigo && { periodoInicio: maisAntigo }) }, db);
    log.error({ erro, linhas, operacoes }, 'Sync falhou');
    return {
      syncRunId: runId,
      status: 'erro',
      linhas,
      operacoes,
      inicio: maisAntigo ?? janela.inicio,
      fim: janela.fim,
      historicoCompleto: false,
      erro,
    };
  }
}
