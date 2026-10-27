import type { RequestHandler } from 'express';
import * as accounts from '../db/repositories/accounts.js';
import * as users from '../db/repositories/users.js';
import { notFound } from '../http/errors.js';

/**
 * Valida no backend se o usuário logado pode ver a conta do parâmetro :accountId.
 * Admin vê qualquer conta; cliente só as vinculadas e ativas. Sem acesso responde 404
 * (igual a conta inexistente), para não revelar quais IDs existem.
 */
export const requireAccountAccess: RequestHandler = async (req, _res, next) => {
  const raw = req.params.accountId;
  const accountId = typeof raw === 'string' && /^\d{1,15}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(accountId)) throw notFound('Conta não encontrada');

  const user = req.user!;
  if (user.papel !== 'admin' && !(await users.hasAccountAccess(user.id, accountId))) throw notFound('Conta não encontrada');

  const account = await accounts.findById(accountId);
  if (!account) throw notFound('Conta não encontrada');
  req.account = account;
  next();
};
