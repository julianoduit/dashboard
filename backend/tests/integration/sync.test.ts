import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../../src/db/pool.js';
import { syncAccount, SyncAlreadyRunningError } from '../../src/sync/syncAccount.js';
import { syncAllActive } from '../../src/sync/syncAll.js';
import { SYNC_LOCK_NAMESPACE } from '../../src/db/repositories/syncRuns.js';
import { createAccount, resetDb } from '../helpers/db.js';
import { campaignRow, conversionRow, FakeGoogleAds } from '../helpers/fakeGoogleAds.js';

// 27/10/2026 09:00 em São Paulo: janela de 30 dias = 27/09 a 26/10.
const NOW = new Date('2026-10-27T12:00:00Z');
const opts = (client: FakeGoogleAds) => ({ client, now: NOW, windowDays: 30, backfillMonths: 13, dailyBudget: 1000 });

async function count(table: string, accountId: number): Promise<number> {
  const res = await getPool().query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE ad_account_id = $1`, [accountId]);
  return res.rows[0]!.n;
}

async function campaignMetric(accountId: number, campaignId: string, data: string) {
  const res = await getPool().query(
    `SELECT impressions, clicks, cost::text, conversions::text, campaign_name
       FROM campaign_daily_metrics WHERE ad_account_id = $1 AND campaign_id = $2 AND data = $3`,
    [accountId, campaignId, data],
  );
  return res.rows[0];
}

describe('sync: upsert idempotente', () => {
  beforeEach(resetDb);
  afterAll(closePool);

  it('reprocessar a mesma janela não duplica linhas', async () => {
    const accountId = await createAccount();
    const api = new FakeGoogleAds();
    api.campaignRows = [campaignRow('2026-10-20', '1'), campaignRow('2026-10-21', '1'), campaignRow('2026-10-21', '2')];
    api.conversionRows = [conversionRow('2026-10-20', '1', '900'), conversionRow('2026-10-21', '1', '901')];

    const first = await syncAccount(accountId, opts(api));
    const second = await syncAccount(accountId, opts(api));

    expect(first.status).toBe('sucesso');
    expect(second.status).toBe('sucesso');
    expect(await count('campaign_daily_metrics', accountId)).toBe(3);
    expect(await count('conversion_action_daily_metrics', accountId)).toBe(2);
  });

  it('atualiza valores que o Google ajustou depois (conversão atribuída ao dia do clique)', async () => {
    const accountId = await createAccount();
    const api = new FakeGoogleAds();
    api.campaignRows = [campaignRow('2026-10-20', '1', { conversions: 1, costMicros: 12_345_678 })];
    await syncAccount(accountId, opts(api));

    api.campaignRows = [campaignRow('2026-10-20', '1', { conversions: 3, costMicros: 12_345_678, name: 'Renomeada' })];
    await syncAccount(accountId, opts(api));

    const row = await campaignMetric(accountId, '1', '2026-10-20');
    expect(row.conversions).toBe('3.000000');
    expect(row.cost).toBe('12.345678');
    expect(row.campaign_name).toBe('Renomeada');
    expect(await count('campaign_daily_metrics', accountId)).toBe(1);
  });

  it('remove da janela a linha que a API deixou de devolver', async () => {
    const accountId = await createAccount();
    const api = new FakeGoogleAds();
    api.conversionRows = [conversionRow('2026-10-20', '1', '900'), conversionRow('2026-10-20', '1', '901')];
    await syncAccount(accountId, opts(api));
    expect(await count('conversion_action_daily_metrics', accountId)).toBe(2);

    // A conversão da ação 901 foi retirada pelo Google: a linha some da resposta.
    api.conversionRows = [conversionRow('2026-10-20', '1', '900')];
    await syncAccount(accountId, opts(api));
    expect(await count('conversion_action_daily_metrics', accountId)).toBe(1);
  });

  it('não toca em dados fora da janela de 30 dias', async () => {
    const accountId = await createAccount();
    const api = new FakeGoogleAds();
    // 2026-08-01 está fora da janela (27/09 a 26/10).
    api.campaignRows = [campaignRow('2026-08-01', '1'), campaignRow('2026-10-20', '1')];
    await getPool().query(
      `INSERT INTO campaign_daily_metrics (ad_account_id, campaign_id, campaign_name, campaign_status, channel_type, data, impressions)
       VALUES ($1, 1, 'Antiga', 'ENABLED', 'SEARCH', '2026-08-01', 999)`,
      [accountId],
    );
    api.campaignRows = [campaignRow('2026-10-20', '1')];
    await syncAccount(accountId, opts(api));

    const old = await campaignMetric(accountId, '1', '2026-08-01');
    expect(old.impressions).toBe(999);
    expect(api.queries.every((q) => !q.query.includes('2026-08'))).toBe(true);
  });

  it('renomear a ação de conversão não duplica conversões', async () => {
    const accountId = await createAccount();
    const api = new FakeGoogleAds();
    api.conversionRows = [conversionRow('2026-10-20', '1', '900', { name: 'WhatsApp', conversions: 2 })];
    await syncAccount(accountId, opts(api));
    api.conversionRows = [conversionRow('2026-10-20', '1', '900', { name: 'Clique no WhatsApp', conversions: 2 })];
    await syncAccount(accountId, opts(api));

    const res = await getPool().query(
      `SELECT conversion_action_name, conversions::float AS c FROM conversion_action_daily_metrics WHERE ad_account_id = $1`,
      [accountId],
    );
    expect(res.rows).toEqual([{ conversion_action_name: 'Clique no WhatsApp', c: 2 }]);
  });

  it('chaves repetidas no mesmo lote são somadas em vez de quebrar o upsert', async () => {
    const accountId = await createAccount();
    const api = new FakeGoogleAds();
    api.conversionRows = [
      conversionRow('2026-10-20', '1', '900', { conversions: 1 }),
      conversionRow('2026-10-20', '1', '900', { conversions: 2 }),
    ];
    const result = await syncAccount(accountId, opts(api));
    expect(result.status).toBe('sucesso');
    const res = await getPool().query(`SELECT conversions::float AS c FROM conversion_action_daily_metrics WHERE ad_account_id = $1`, [accountId]);
    expect(res.rows).toEqual([{ c: 3 }]);
  });
});

describe('sync: carga histórica gradual, cota diária e registro de execução', () => {
  beforeEach(resetDb);

  async function conta(id: number) {
    const r = await getPool().query('SELECT historico_ate, ultima_sync_em FROM ad_accounts WHERE id = $1', [id]);
    return r.rows[0] as { historico_ate: string | null; ultima_sync_em: Date | null };
  }

  it('conta nova com cota folgada: janela + 13 meses de histórico, mês a mês', async () => {
    const accountId = await createAccount({ historicoAte: null });
    const api = new FakeGoogleAds();
    api.campaignRows = [campaignRow('2025-09-27', '1'), campaignRow('2026-10-26', '1')];

    const result = await syncAccount(accountId, { ...opts(api), tipo: 'manual', dailyBudget: 1000 });
    expect(result).toMatchObject({ status: 'sucesso', inicio: '2025-09-27', fim: '2026-10-26', historicoCompleto: true });
    // janela 27/09-26/10 = 2 blocos; histórico 27/09/2025 a 26/09/2026 = 13 blocos; 2 consultas cada.
    expect(result.operacoes).toBe(30);
    expect(api.queries).toHaveLength(30);
    expect(await count('campaign_daily_metrics', accountId)).toBe(2);
    const c = await conta(accountId);
    expect(c.historico_ate).toBe('2025-09-27');
    expect(c.ultima_sync_em).not.toBeNull();

    const run = await getPool().query('SELECT tipo, status, linhas_gravadas, operacoes FROM sync_runs WHERE id = $1', [result.syncRunId]);
    expect(run.rows[0]).toEqual({ tipo: 'manual', status: 'sucesso', linhas_gravadas: 2, operacoes: 30 });
  });

  it('cota curta: janela entra, histórico para no limite e continua no dia seguinte sem duplicar', async () => {
    const accountId = await createAccount({ historicoAte: null });
    const api = new FakeGoogleAds();
    api.campaignRows = [campaignRow('2026-08-15', '1'), campaignRow('2026-10-20', '1')];

    // 10 operações: janela (4) + 3 meses de histórico (6).
    const r1 = await syncAccount(accountId, { ...opts(api), tipo: 'manual', dailyBudget: 10 });
    expect(r1).toMatchObject({ status: 'sucesso', operacoes: 10, historicoCompleto: false });
    expect(r1.observacao).toMatch(/continua no próximo sync/);
    expect((await conta(accountId)).historico_ate).toBe('2026-07-01');

    // Mesmo dia: cota esgotada, a passada de histórico fica adiada sem chamar a API.
    const antes = api.queries.length;
    const r2 = await syncAccount(accountId, { ...opts(api), modo: 'historico', dailyBudget: 10 });
    expect(r2.status).toBe('adiado');
    expect(api.queries.length).toBe(antes);

    // "Dia seguinte" (zera o uso de hoje): retoma de 01/07 para trás, até completar.
    await getPool().query(`UPDATE sync_runs SET inicio = inicio - interval '1 day'`);
    const r3 = await syncAccount(accountId, { ...opts(api), modo: 'historico', dailyBudget: 1000 });
    expect(r3).toMatchObject({ status: 'sucesso', historicoCompleto: true });
    expect((await conta(accountId)).historico_ate).toBe('2025-09-27');
    // julho só nas 2 consultas da 1ª execução: a retomada não refez meses já carregados
    expect(api.queries.filter((q) => q.query.includes("'2026-07-01' AND")).length).toBe(2);
    expect(await count('campaign_daily_metrics', accountId)).toBe(2);
  });

  it('sem cota nem para a janela: execução adiada, nada marcado como atualizado', async () => {
    const accountId = await createAccount({ historicoAte: null });
    const api = new FakeGoogleAds();
    const r = await syncAccount(accountId, { ...opts(api), dailyBudget: 1 });
    expect(r.status).toBe('adiado');
    expect(api.queries).toHaveLength(0);
    expect(await conta(accountId)).toEqual({ historico_ate: null, ultima_sync_em: null });
  });

  it('syncAll: janela de todas as contas antes de qualquer histórico', async () => {
    const a = await createAccount({ customerId: '1000000001', historicoAte: null });
    const b = await createAccount({ customerId: '1000000002', historicoAte: null });
    const api = new FakeGoogleAds();
    const itens = await syncAllActive(api, { now: NOW });
    expect(itens.filter((i) => i.etapa === 'janela').map((i) => i.result?.status)).toEqual(['sucesso', 'sucesso']);
    expect((await conta(a)).ultima_sync_em).not.toBeNull();
    expect((await conta(b)).ultima_sync_em).not.toBeNull();
    // A primeira consulta de histórico só acontece depois das 4 consultas de janela de cada conta.
    const primeiraHistorico = api.queries.findIndex((q) => q.query.includes("'2026-09-01' AND '2026-09-26'"));
    expect(primeiraHistorico).toBeGreaterThanOrEqual(8);
  });

  it('erro na API grava sync_run com erro e não marca backfill como concluído', async () => {
    const accountId = await createAccount({ historicoAte: null });
    const api = new FakeGoogleAds();
    api.failFor.add('1234567890');

    const result = await syncAccount(accountId, opts(api));
    expect(result.status).toBe('erro');
    const run = await getPool().query('SELECT status, erro, fim FROM sync_runs WHERE id = $1', [result.syncRunId]);
    expect(run.rows[0].status).toBe('erro');
    expect(run.rows[0].erro).toContain('falha simulada');
    expect(run.rows[0].fim).not.toBeNull();
    expect(await conta(accountId)).toEqual({ historico_ate: null, ultima_sync_em: null });
  });

  it('erro em uma conta não interrompe as outras', async () => {
    const ok1 = await createAccount({ customerId: '1000000001', nome: 'A' });
    const bad = await createAccount({ customerId: '1000000002', nome: 'B' });
    const ok2 = await createAccount({ customerId: '1000000003', nome: 'C' });
    await createAccount({ customerId: '1000000004', nome: 'Inativa', ativo: false });
    const api = new FakeGoogleAds();
    api.campaignRows = [campaignRow('2026-10-20', '1')];
    api.failFor.add('1000000002');

    const results = await syncAllActive(api, { now: NOW });
    const byId = Object.fromEntries(results.filter((r) => r.etapa === 'janela').map((r) => [r.accountId, r.result?.status]));
    expect(byId).toEqual({ [ok1]: 'sucesso', [bad]: 'erro', [ok2]: 'sucesso' });
  });

  it('não roda duas sincronizações da mesma conta ao mesmo tempo', async () => {
    const accountId = await createAccount();
    const holder = await getPool().connect();
    try {
      await holder.query('SELECT pg_advisory_lock($1, $2)', [SYNC_LOCK_NAMESPACE, accountId]);
      await expect(syncAccount(accountId, opts(new FakeGoogleAds()))).rejects.toBeInstanceOf(SyncAlreadyRunningError);
    } finally {
      await holder.query('SELECT pg_advisory_unlock_all()');
      holder.release();
    }
  });
});
