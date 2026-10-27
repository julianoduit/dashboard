import { Router } from 'express';
import { z } from 'zod';
import { hashPassword } from '../auth/password.js';
import * as accounts from '../db/repositories/accounts.js';
import * as syncRuns from '../db/repositories/syncRuns.js';
import * as users from '../db/repositories/users.js';
import { GoogleAdsApiError } from '../googleAds/errors.js';
import { HttpError, notFound } from '../http/errors.js';
import { logger } from '../logger.js';
import { refreshMccAccounts } from '../sync/mcc.js';
import { alvoHistorico, janelaRecente, syncAccount, type SearchClient } from '../sync/syncAccount.js';
import { env } from '../config/env.js';

const idParam = z.coerce.number().int().positive();

/** Acrescenta se a carga histórica (13 meses) já terminou, para a tela não precisar calcular. */
export function comHistorico<T extends { fuso: string; historico_ate: string | null }>(c: T): T & { historico_completo: boolean } {
  const config = env();
  const alvo = alvoHistorico(janelaRecente(c.fuso, new Date(), config.SYNC_WINDOW_DAYS).fim, config.SYNC_BACKFILL_MONTHS);
  return { ...c, historico_completo: c.historico_ate !== null && c.historico_ate <= alvo };
}
const senha = z.string().min(8, 'mínimo de 8 caracteres').max(200);
const email = z.string().trim().toLowerCase().email().max(254);
const papel = z.enum(['admin', 'cliente']);

const createUserSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  email,
  senha,
  papel: papel.default('cliente'),
  accountIds: z.array(idParam).max(500).default([]),
});

const updateUserSchema = z
  .object({ nome: z.string().trim().min(1).max(200), email, senha, papel, ativo: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'nada para atualizar');

const setAccountsSchema = z.object({ accountIds: z.array(idParam).max(500) });

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string }).code === '23505';
}

async function assertAccountsExist(ids: number[]): Promise<void> {
  for (const id of new Set(ids)) {
    if (!(await accounts.findById(id))) throw new HttpError(400, `Conta ${id} não existe`);
  }
}

export function adminRouter(deps: { googleAds: () => SearchClient }): Router {
  const router = Router();

  // --- Contas ---

  router.get('/accounts', async (_req, res) => {
    res.json((await accounts.listForAdmin()).map(comHistorico));
  });

  /** Consulta a MCC na Google Ads API e atualiza ad_accounts. Só roda quando o admin pede. */
  router.post('/accounts/refresh-mcc', async (_req, res) => {
    try {
      const contas = await refreshMccAccounts(deps.googleAds());
      res.json({ contas: contas.length });
    } catch (err) {
      if (err instanceof GoogleAdsApiError) {
        logger.error({ erro: err.toSafeString() }, 'Falha ao atualizar lista da MCC');
        throw new HttpError(502, `Falha ao consultar a Google Ads API: ${err.message}`);
      }
      throw err;
    }
  });

  router.patch('/accounts/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const flags = z
      .object({ ativo: z.boolean(), exibirRoas: z.boolean() })
      .partial()
      .refine((v) => Object.keys(v).length > 0, 'nada para atualizar')
      .parse(req.body);
    if (!(await accounts.findById(id))) throw notFound('Conta não encontrada');
    await accounts.updateFlags(id, flags);
    res.json(await accounts.findById(id));
  });

  /** Dispara sync manual de uma conta. Responde na hora; o progresso aparece em sync-runs. */
  router.post('/accounts/:id/sync', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const account = await accounts.findById(id);
    if (!account) throw notFound('Conta não encontrada');
    if (!account.ativo) throw new HttpError(409, 'Ative a conta antes de sincronizar');
    if (await syncRuns.isRunning(id)) throw new HttpError(409, 'Já existe uma sincronização em andamento para esta conta');

    const client = deps.googleAds();
    void syncAccount(id, { client, tipo: 'manual', disparadoPor: req.user!.id }).catch((err: unknown) =>
      logger.error({ customerId: account.customer_id, erro: err instanceof Error ? err.message : String(err) }, 'Sync manual falhou'),
    );
    res.status(202).json({ status: 'iniciado' });
  });

  router.get('/sync-runs', async (req, res) => {
    const q = z
      .object({
        accountId: idParam.optional(),
        status: z.enum(['executando', 'sucesso', 'erro', 'adiado']).optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      })
      .parse(req.query);
    res.json(await syncRuns.list({ ...(q.accountId && { adAccountId: q.accountId }), ...(q.status && { status: q.status }), limit: q.limit }));
  });

  // --- Usuários ---

  router.get('/users', async (_req, res) => {
    res.json(await users.list());
  });

  router.post('/users', async (req, res) => {
    const input = createUserSchema.parse(req.body);
    await assertAccountsExist(input.accountIds);
    try {
      const user = await users.create({ nome: input.nome, email: input.email, senhaHash: await hashPassword(input.senha), papel: input.papel });
      await users.setAccounts(user.id, input.accountIds);
      res.status(201).json({ ...user, contas: [...new Set(input.accountIds)].sort((a, b) => a - b) });
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, 'Já existe um usuário com este e-mail');
      throw err;
    }
  });

  router.get('/users/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const user = (await users.list()).find((u) => u.id === id);
    if (!user) throw notFound('Usuário não encontrado');
    res.json(user);
  });

  router.patch('/users/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const input = updateUserSchema.parse(req.body);
    if (id === req.user!.id && (input.ativo === false || (input.papel && input.papel !== 'admin'))) {
      throw new HttpError(400, 'Você não pode desativar nem rebaixar o próprio usuário');
    }
    try {
      const user = await users.update(id, {
        ...(input.nome !== undefined && { nome: input.nome }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.senha !== undefined && { senhaHash: await hashPassword(input.senha) }),
        ...(input.papel !== undefined && { papel: input.papel }),
        ...(input.ativo !== undefined && { ativo: input.ativo }),
      });
      if (!user) throw notFound('Usuário não encontrado');
      res.json(user);
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, 'Já existe um usuário com este e-mail');
      throw err;
    }
  });

  router.delete('/users/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
    if (id === req.user!.id) throw new HttpError(400, 'Você não pode excluir o próprio usuário');
    if (!(await users.remove(id))) throw notFound('Usuário não encontrado');
    res.status(204).end();
  });

  router.put('/users/:id/accounts', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { accountIds } = setAccountsSchema.parse(req.body);
    if (!(await users.findById(id))) throw notFound('Usuário não encontrado');
    await assertAccountsExist(accountIds);
    await users.setAccounts(id, accountIds);
    res.json({ contas: [...new Set(accountIds)].sort((a, b) => a - b) });
  });

  /** Contas que um cliente enxerga. Usado pelo "Ver como cliente". */
  router.get('/users/:id/accounts', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const user = await users.findById(id);
    if (!user) throw notFound('Usuário não encontrado');
    const list = await accounts.listForUser(id);
    res.json({
      usuario: { id: user.id, nome: user.nome, email: user.email, papel: user.papel },
      contas: list.map((a) => ({ id: a.id, nome: a.nome, moeda: a.moeda, fuso: a.fuso, ultimaSyncEm: a.ultima_sync_em })),
    });
  });

  return router;
}
