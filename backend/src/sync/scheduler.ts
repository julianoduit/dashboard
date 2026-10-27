import cron from 'node-cron';
import { env } from '../config/env.js';
import { failInterruptedRuns } from '../db/repositories/syncRuns.js';
import { getGoogleAdsClient } from '../googleAds/client.js';
import { logger } from '../logger.js';
import { syncAllActive } from './syncAll.js';

export async function startScheduler(): Promise<{ stop: () => void } | undefined> {
  const config = env();
  const interrompidas = await failInterruptedRuns();
  if (interrompidas) logger.warn({ interrompidas }, 'Execuções de sync interrompidas marcadas como erro');

  if (!config.SYNC_SCHEDULER_ENABLED) {
    logger.info('Agendamento de sync desligado (SYNC_SCHEDULER_ENABLED=false)');
    return undefined;
  }
  if (!cron.validate(config.SYNC_CRON)) throw new Error(`SYNC_CRON inválido: ${config.SYNC_CRON}`);

  const client = getGoogleAdsClient();
  const task = cron.schedule(
    config.SYNC_CRON,
    async () => {
      try {
        await syncAllActive(client);
      } catch (err) {
        logger.error({ erro: err instanceof Error ? err.message : String(err) }, 'Sync diário falhou');
      }
    },
    { timezone: config.SYNC_TZ, noOverlap: true, name: 'sync-diario' },
  );
  logger.info({ cron: config.SYNC_CRON, tz: config.SYNC_TZ }, 'Sync diário agendado');
  return { stop: () => void task.stop() };
}
