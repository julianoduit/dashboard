import { createApp } from './app.js';
import { env } from './config/env.js';
import { closePool } from './db/pool.js';
import { logger } from './logger.js';
import { startScheduler } from './sync/scheduler.js';

const config = env();
const app = createApp();
const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, 'API no ar'));
const scheduler = await startScheduler();

async function shutdown(signal: string) {
  logger.info({ signal }, 'Encerrando');
  scheduler?.stop();
  server.close();
  await closePool();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
