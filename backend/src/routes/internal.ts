import { createHash, timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { integracaoEnv } from '../config/env.js';
import * as accounts from '../db/repositories/accounts.js';
import * as ssoTokens from '../db/repositories/ssoTokens.js';
import * as syncRuns from '../db/repositories/syncRuns.js';
import * as users from '../db/repositories/users.js';
import { getPool } from '../db/pool.js';
import { HttpError, notFound } from '../http/errors.js';
import { logger } from '../logger.js';
import { syncAccount, type SearchClient } from '../sync/syncAccount.js';
import { comHistorico } from './admin.js';

/**
 * API interna usada pelo KiipitADS (painel da equipe). Só existe com INTERNAL_API_TOKEN
 * configurado, exige o token em toda chamada e não é publicada pelo Caddy: fica acessível
 * apenas pela rede Docker interna do servidor. Contas são identificadas pelo customer_id.
 */

const digest = (v: string) => createHash('sha256').update(v).digest();

function exigeToken(esperado: string): RequestHandler {
  const alvo = digest(esperado);
  return (req, _res, next) => {
    const h = req.get('authorization') ?? '';
    const recebido = h.startsWith('Bearer ') ? h.slice(7) : '';
    // Compara os hashes (mesmo tamanho) em tempo constante.
    if (!recebido || !timingSafeEqual(digest(recebido), alvo)) throw new HttpError(401, 'Token inválido');
    next();
  };
}

const customerIdParam = z
  .string()
  .transform((v) => v.replace(/-/g, ''))
  .pipe(z.string().regex(/^\d{10}$/));

/** Só caminhos do próprio site: nada de URL externa (evita redirecionamento aberto). */
export const destinoSchema = z
  .string()
  .max(300)
  .refine((d) => d.startsWith('/') && !d.startsWith('//') && !d.includes('\\') && !/[\r\n]/.test(d), 'destino inválido');

interface UsuarioVinculado {
  id: number;
  nome: string;
  email: string;
  ativo: boolean;
}

async function usuariosPorConta(): Promise<Map<number, UsuarioVinculado[]>> {
  const res = await getPool().query<UsuarioVinculado & { ad_account_id: number }>(
    `SELECT ua.ad_account_id, u.id, u.nome, u.email::text AS email, u.ativo
       FROM user_ad_accounts ua JOIN users u ON u.id = ua.user_id
      WHERE u.papel = 'cliente'
      ORDER BY u.nome`,
  );
  const mapa = new Map<number, UsuarioVinculado[]>();
  for (const { ad_account_id, ...u } of res.rows) mapa.set(ad_account_id, [...(mapa.get(ad_account_id) ?? []), u]);
  return mapa;
}

async function contasDetalhadas() {
  const [lista, vinculos] = await Promise.all([accounts.listForAdmin(), usuariosPorConta()]);
  return lista.map((c) => {
    const h = comHistorico(c);
    return {
      customerId: c.customer_id,
      id: c.id,
      nome: c.nome,
      ativo: c.ativo,
      exibirRoas: c.exibir_roas,
      naMcc: c.na_mcc,
      ultimaSyncEm: c.ultima_sync_em,
      ultimaSyncStatus: c.ultima_sync_status,
      ultimaSyncErro: c.ultima_sync_erro,
      historicoAte: c.historico_ate,
      historicoCompleto: h.historico_completo,
      usuarios: vinculos.get(c.id) ?? [],
    };
  });
}

async function contaOu404(raw: string | undefined) {
  const parsed = customerIdParam.safeParse(raw);
  const conta = parsed.success ? await accounts.findByCustomerId(parsed.data) : undefined;
  if (!conta) throw notFound('Conta não está no dashboard');
  return conta;
}

export function internalRouter(deps: { googleAds: () => SearchClient }): Router | undefined {
  const cfg = integracaoEnv();
  if (!cfg.INTERNAL_API_TOKEN || !cfg.PUBLIC_URL) return undefined;
  const publicUrl = cfg.PUBLIC_URL.replace(/\/+$/, '');
  const router = Router();
  router.use(exigeToken(cfg.INTERNAL_API_TOKEN));

  router.get('/accounts', async (_req, res) => {
    res.json(await contasDetalhadas());
  });

  router.get('/accounts/:customerId', async (req, res) => {
    const conta = await contaOu404(req.params.customerId);
    res.json((await contasDetalhadas()).find((c) => c.id === conta.id));
  });

  router.patch('/accounts/:customerId', async (req, res) => {
    const conta = await contaOu404(req.params.customerId);
    const flags = z
      .object({ ativo: z.boolean(), exibirRoas: z.boolean() })
      .partial()
      .refine((v) => Object.keys(v).length > 0, 'nada para atualizar')
      .parse(req.body);
    await accounts.updateFlags(conta.id, flags);
    res.json((await contasDetalhadas()).find((c) => c.id === conta.id));
  });

  router.post('/accounts/:customerId/sync', async (req, res) => {
    const conta = await contaOu404(req.params.customerId);
    if (!conta.ativo) throw new HttpError(409, 'Ative a conta no dashboard antes de sincronizar');
    if (await syncRuns.isRunning(conta.id)) throw new HttpError(409, 'Já existe uma sincronização em andamento para esta conta');
    const servico = await users.ensureServiceUser();
    void syncAccount(conta.id, { client: deps.googleAds(), tipo: 'manual', disparadoPor: servico.id }).catch((err: unknown) =>
      logger.error({ customerId: conta.customer_id, erro: err instanceof Error ? err.message : String(err) }, 'Sync pedido pelo KiipitADS falhou'),
    );
    res.status(202).json({ status: 'iniciado' });
  });

  /** Gera um link de uso único (60 s) que abre o dashboard já logado como a equipe. */
  router.post('/sso', async (req, res) => {
    const { destino } = z.object({ destino: destinoSchema.default('/admin/contas') }).parse(req.body ?? {});
    const { token, expiraEm } = await ssoTokens.create(destino);
    res.json({ url: `${publicUrl}/api/auth/sso?t=${token}`, expiraEm });
  });

  return router;
}
