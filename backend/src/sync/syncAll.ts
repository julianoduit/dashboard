import * as accounts from '../db/repositories/accounts.js';
import { logger } from '../logger.js';
import { syncAccount, type SearchClient, type SyncResult } from './syncAccount.js';

/** Sincroniza todas as contas ativas, uma de cada vez. Falha em uma conta não interrompe as outras. */
export async function syncAllActive(client: SearchClient): Promise<Array<{ accountId: number; result?: SyncResult; erro?: string }>> {
  const list = await accounts.listActive();
  logger.info({ contas: list.length }, 'Sync diário: início');
  const results: Array<{ accountId: number; result?: SyncResult; erro?: string }> = [];
  for (const account of list) {
    try {
      results.push({ accountId: account.id, result: await syncAccount(account.id, { client, tipo: 'diario' }) });
    } catch (err) {
      // Erros antes de existir um sync_run (ex.: lock ocupado). Erros da API já viram sync_run com status erro.
      const erro = err instanceof Error ? err.message : String(err);
      logger.error({ customerId: account.customer_id, erro }, 'Sync diário: conta ignorada');
      results.push({ accountId: account.id, erro });
    }
  }
  const falhas = results.filter((r) => r.erro || r.result?.status === 'erro').length;
  logger.info({ contas: list.length, falhas }, 'Sync diário: fim');
  return results;
}
