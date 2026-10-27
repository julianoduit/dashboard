import type { RequestHandler } from 'express';
import { readSessionToken, SESSION_COOKIE, clearSessionCookie } from '../auth/session.js';
import * as users from '../db/repositories/users.js';
import type { AdAccount } from '../db/repositories/accounts.js';
import { HttpError } from '../http/errors.js';

export interface SessionUser {
  id: number;
  nome: string;
  email: string;
  papel: users.Papel;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
      account?: AdAccount;
    }
  }
}

/**
 * Exige sessão válida. Confere no banco a cada request se o usuário segue ativo e se a sessão
 * não foi invalidada (troca de senha, mudança de papel, desativação).
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const session = readSessionToken(req.cookies?.[SESSION_COOKIE]);
  if (!session) throw new HttpError(401, 'Sessão expirada. Faça login novamente.');
  const user = await users.findById(session.userId);
  if (!user || !user.ativo || user.token_version !== session.tokenVersion) {
    clearSessionCookie(res);
    throw new HttpError(401, 'Sessão expirada. Faça login novamente.');
  }
  req.user = { id: user.id, nome: user.nome, email: user.email, papel: user.papel };
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.user?.papel !== 'admin') throw new HttpError(403, 'Acesso restrito à equipe Dúit');
  next();
};
