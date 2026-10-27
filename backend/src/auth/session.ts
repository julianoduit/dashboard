import type { CookieOptions, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authEnv, env } from '../config/env.js';

export const SESSION_COOKIE = 'duit_session';

interface SessionPayload {
  sub: string;
  tv: number;
}

function cookieOptions(): CookieOptions {
  const a = authEnv();
  const secure = a.COOKIE_SECURE ? a.COOKIE_SECURE === 'true' : env().NODE_ENV === 'production';
  return { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: a.SESSION_DAYS * 86_400_000 };
}

export function setSessionCookie(res: Response, user: { id: number; token_version: number }): void {
  const a = authEnv();
  const token = jwt.sign({ tv: user.token_version } satisfies Omit<SessionPayload, 'sub'>, a.JWT_SECRET, {
    algorithm: 'HS256',
    subject: String(user.id),
    expiresIn: `${a.SESSION_DAYS}d`,
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions());
}

export function clearSessionCookie(res: Response): void {
  const { maxAge: _ignored, ...opts } = cookieOptions();
  res.clearCookie(SESSION_COOKIE, opts);
}

/** Valida assinatura e expiração. Devolve undefined para qualquer token inválido. */
export function readSessionToken(token: string | undefined): { userId: number; tokenVersion: number } | undefined {
  if (!token) return undefined;
  try {
    const payload = jwt.verify(token, authEnv().JWT_SECRET, { algorithms: ['HS256'] }) as SessionPayload;
    const userId = Number(payload.sub);
    if (!Number.isSafeInteger(userId) || typeof payload.tv !== 'number') return undefined;
    return { userId, tokenVersion: payload.tv };
  } catch {
    return undefined;
  }
}
