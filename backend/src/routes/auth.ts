import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { verifyPassword } from '../auth/password.js';
import { clearSessionCookie, setSessionCookie } from '../auth/session.js';
import * as users from '../db/repositories/users.js';
import { HttpError } from '../http/errors.js';
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
    if (!user || !ok || !user.ativo) throw new HttpError(401, 'E-mail ou senha incorretos');

    setSessionCookie(res, user);
    res.json({ id: user.id, nome: user.nome, email: user.email, papel: user.papel });
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
