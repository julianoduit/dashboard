import { closePool } from '../db/pool.js';
import { GoogleAdsApiError } from '../googleAds/errors.js';

/** Executa um script de linha de comando com tratamento de erro seguro e fechamento do pool. */
export async function runCli(main: () => Promise<void>): Promise<void> {
  try {
    await main();
  } catch (err) {
    const msg = err instanceof GoogleAdsApiError ? err.toSafeString() : err instanceof Error ? err.message : String(err);
    console.error(`Erro: ${msg}`);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
