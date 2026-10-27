import request from 'supertest';
import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/auth/password.js';
import { getPool } from '../../src/db/pool.js';
import { FakeGoogleAds } from './fakeGoogleAds.js';

export const SENHA = 'senha-de-teste-123';
let hashCache: Promise<string> | undefined;

export async function createUser(
  o: Partial<{ nome: string; email: string; papel: 'admin' | 'cliente'; ativo: boolean; contas: number[] }> = {},
): Promise<{ id: number; email: string }> {
  hashCache ??= hashPassword(SENHA);
  const email = o.email ?? `user${Math.random().toString(36).slice(2)}@teste.com`;
  const res = await getPool().query<{ id: number }>(
    `INSERT INTO users (nome, email, senha_hash, papel, ativo) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [o.nome ?? 'Usuário', email, await hashCache, o.papel ?? 'cliente', o.ativo ?? true],
  );
  const id = res.rows[0]!.id;
  for (const accountId of o.contas ?? []) {
    await getPool().query('INSERT INTO user_ad_accounts (user_id, ad_account_id) VALUES ($1, $2)', [id, accountId]);
  }
  return { id, email };
}

export function makeApp(fake = new FakeGoogleAds()) {
  return { app: createApp({ googleAds: () => fake }), fake };
}

/** Agente supertest já logado (guarda o cookie de sessão). */
export async function loginAs(app: ReturnType<typeof createApp>, email: string, senha = SENHA) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, senha });
  if (res.status !== 200) throw new Error(`login falhou: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

export async function insertCampaignDay(
  accountId: number,
  data: string,
  m: Partial<{ campaignId: number; nome: string; impressions: number; clicks: number; cost: number; conversions: number; value: number }> = {},
) {
  await getPool().query(
    `INSERT INTO campaign_daily_metrics (ad_account_id, campaign_id, campaign_name, campaign_status, channel_type, data,
       impressions, clicks, cost, conversions, conversions_value)
     VALUES ($1, $2, $3, 'ENABLED', 'SEARCH', $4, $5, $6, $7, $8, $9)`,
    [accountId, m.campaignId ?? 1, m.nome ?? 'Campanha 1', data, m.impressions ?? 0, m.clicks ?? 0, m.cost ?? 0, m.conversions ?? 0, m.value ?? 0],
  );
}

export async function insertConversionDay(
  accountId: number,
  data: string,
  m: { actionId: number; nome: string; conversions: number; campaignId?: number; value?: number; categoria?: string },
) {
  await getPool().query(
    `INSERT INTO conversion_action_daily_metrics (ad_account_id, campaign_id, data, conversion_action_id,
       conversion_action_name, conversion_action_category, conversions, conversions_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [accountId, m.campaignId ?? 1, data, m.actionId, m.nome, m.categoria ?? 'CONTACT', m.conversions, m.value ?? 0],
  );
}
