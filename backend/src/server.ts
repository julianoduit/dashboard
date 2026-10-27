import express from 'express';
import { env } from './config/env.js';
import { closePool, getPool } from './db/pool.js';
import { logger } from './logger.js';
import { startScheduler } from './sync/scheduler.js';

const app = express();
app.disable('x-powered-by');

app.get('/api/health', async (_req, res) => {
  try {
    await getPool().query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

const config = env();
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
