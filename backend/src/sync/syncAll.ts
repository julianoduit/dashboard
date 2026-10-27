import { env } from '../config/env.js';
import * as accounts from '../db/repositories/accounts.js';
import { logger } from '../logger.js';
import { alvoHistorico, janelaRecente, syncAccount, type SearchClient, type SyncResult } from './syncAccount.js';

export interface SyncAllItem {
  accountId: number;
  etapa: 'janela' | 'historico';
  result?: SyncResult;
  erro?: string;
}

/**
 * Sync diário em duas passadas, sem estourar a cota diária:
 * 1. janela recente de todas as contas ativas (barata: é o que o cliente vê);
 * 2. com a sobra, avança a carga histórica, começando pelas contas com menos histórico.
 * Falha em uma conta não interrompe as outras.
 */
export async function syncAllActive(client: SearchClient, opts: { now?: Date } = {}): Promise<SyncAllItem[]> {
  const config = env();
  const now = opts.now ?? new Date();
  const lista = await accounts.listActive();
  logger.info({ contas: lista.length }, 'Sync diário: início');
  const itens: SyncAllItem[] = [];

  const rodar = async (accountId: number, etapa: SyncAllItem['etapa']) => {
    try {
      const result = await syncAccount(accountId, { client, tipo: 'diario', modo: etapa, now });
      itens.push({ accountId, etapa, result });
      return result;
    } catch (err) {
      // Erros antes de existir um sync_run (ex.: lock ocupado). Erros da API já viram sync_run com status erro.
      const erro = err instanceof Error ? err.message : String(err);
      logger.error({ accountId, etapa, erro }, 'Sync diário: conta ignorada');
      itens.push({ accountId, etapa, erro });
      return undefined;
    }
  };

  for (const conta of lista) await rodar(conta.id, 'janela');

  const pendentes = (await accounts.listActive())
    .filter((c) => {
      if (!c.historico_ate) return false;
      const alvo = alvoHistorico(janelaRecente(c.fuso, now, config.SYNC_WINDOW_DAYS).fim, config.SYNC_BACKFILL_MONTHS);
      return c.historico_ate > alvo;
    })
    // Menos histórico primeiro: todo mundo ganha os meses mais recentes antes dos mais antigos.
    .sort((a, b) => (a.historico_ate! < b.historico_ate! ? 1 : -1));
  for (const conta of pendentes) {
    const r = await rodar(conta.id, 'historico');
    if (r?.status === 'adiado') break; // cota do dia acabou: o resto fica para amanhã
  }

  const falhas = itens.filter((i) => i.erro || i.result?.status === 'erro').length;
  logger.info({ contas: lista.length, historico: pendentes.length, falhas }, 'Sync diário: fim');
  return itens;
}
