import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { verifyPassword } from '../auth/password.js';
import { clearSessionCookie, setSessionCookie } from '../auth/session.js';
import { integracaoEnv } from '../config/env.js';
import * as ssoTokens from '../db/repositories/ssoTokens.js';
import * as users from '../db/repositories/users.js';
import { HttpError } from '../http/errors.js';
import { logger } from '../logger.js';
import { requireAuth } from '../middleware/auth.js';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  senha: z.string().min(1).max(200),
});

export function authRouter(): Router {
  const router = Router();
  const tooMany = { erro: 'Muitas tentativas de login. Aguarde alguns minutos e tente de novo.' };

  // Por IP + e-mail: protege uma conta específica contra tentativa de senha.
  const perAccount = rateLimit({
    windowMs: 15 * 60_000,
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}|${String(req.body?.email ?? '').trim().toLowerCase()}`,
    message: tooMany,
  });
  // Por IP: protege contra varredura de vários e-mails a partir do mesmo lugar.
  const perIp = rateLimit({
    windowMs: 15 * 60_000,
    limit: 30,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: tooMany,
  });

  router.post('/login', perIp, perAccount, async (req, res) => {
    const { email, senha } = loginSchema.parse(req.body);
    const user = await users.findByEmailWithHash(email);
    const ok = await verifyPassword(senha, user?.senha_hash);
    // Com o login único do KiipitADS ligado, a equipe entra só por lá: senha de admin não vale aqui.
    const adminBloqueado = user?.papel === 'admin' && !integracaoEnv().adminPasswordLogin;
    if (!user || !ok || !user.ativo || adminBloqueado) {
      // IP para auditoria (e para conferir o TRUST_PROXY atrás do Tailscale/Caddy). O e-mail não vai para o log.
      logger.warn({ ip: req.ip }, 'Login recusado');
      throw new HttpError(401, 'E-mail ou senha incorretos');
    }

    setSessionCookie(res, user);
    res.json({ id: user.id, nome: user.nome, email: user.email, papel: user.papel });
  });

  // Link de login único gerado pelo KiipitADS. Público, mas o token é aleatório, de uso único e vale 60 s.
  const ssoLimit = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
  router.get('/sso', ssoLimit, async (req, res) => {
    const token = typeof req.query.t === 'string' ? req.query.t : '';
    const destino = /^[A-Za-z0-9_-]{20,100}$/.test(token) ? await ssoTokens.consume(token) : undefined;
    if (!destino) {
      logger.warn({ ip: req.ip }, 'Link de login único inválido ou expirado');
      res
        .status(400)
        .type('html')
        .send(
          '<!doctype html><meta charset="utf-8"><title>Link expirado</title><body style="font-family:system-ui;padding:40px">' +
            '<h1>Link expirado</h1><p>Este link vale uma vez só, por 60 segundos. Volte ao KiipitADS e clique de novo.</p></body>',
        );
      return;
    }
    const servico = await users.ensureServiceUser();
    setSessionCookie(res, servico);
    logger.info({ ip: req.ip, destino }, 'Login único do KiipitADS');
    res.redirect(303, destino);
  });

  router.post('/logout', (_req, res) => {
    clearSessionCookie(res);
    res.status(204).end();
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json(req.user);
  });

  return router;
}
