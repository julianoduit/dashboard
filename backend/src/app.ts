import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { authEnv } from './config/env.js';
import { getPool } from './db/pool.js';
import { getGoogleAdsClient } from './googleAds/client.js';
import { errorHandler, notFoundHandler } from './http/errors.js';
import { requireAdmin, requireAuth } from './middleware/auth.js';
import { accountsRouter } from './routes/accounts.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import type { SearchClient } from './sync/syncAccount.js';

export interface AppDeps {
  /** Cliente da Google Ads API, criado só quando o admin pede algo que precisa dele. */
  googleAds?: () => SearchClient;
}

export function createApp(deps: AppDeps = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', authEnv().TRUST_PROXY);
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Nenhuma resposta da API deve ficar em cache de navegador ou proxy.
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/health', async (_req, res) => {
    try {
      await getPool().query('SELECT 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  app.use('/api/auth', authRouter());
  app.use('/api/accounts', requireAuth, accountsRouter());
  app.use('/api/admin', requireAuth, requireAdmin, adminRouter({ googleAds: deps.googleAds ?? getGoogleAdsClient }));

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
