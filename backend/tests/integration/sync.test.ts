import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../../src/db/pool.js';
import { syncAccount, SyncAlreadyRunningError } from '../../src/sync/syncAccount.js';
import { syncAllActive } from '../../src/sync/syncAll.js';
import { SYNC_LOCK_NAMESPACE } from '../../src/db/repositories/syncRuns.js';
import { createAccount, resetDb } from '../helpers/db.js';
import { campaignRow, conversionRow, FakeGoogleAds } from '../helpers/fakeGoogleAds.js';

// 27/10/2026 09:00 em São Paulo: janela de 30 dias = 27/09 a 26/10.
const NOW = new Date('2026-10-27T12:00:00Z');
const opts = (client: FakeGoogleAds) => ({ client, now: NOW, windowDays: 30, backfillMonths: 13 });

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

describe('sync: período, backfill e registro de execução', () => {
  beforeEach(resetDb);

  it('primeira sync faz backfill de 13 meses em blocos mensais e marca a conta', async () => {
    const accountId = await createAccount({ backfillConcluido: false });
    const api = new FakeGoogleAds();
    api.campaignRows = [campaignRow('2025-09-27', '1'), campaignRow('2026-10-26', '1')];

    const result = await syncAccount(accountId, opts(api));
    expect(result).toMatchObject({ status: 'sucesso', inicio: '2025-09-27', fim: '2026-10-26' });
    // set/2025 a out/2026 = 14 meses de calendário, 2 consultas por bloco.
    expect(api.queries).toHaveLength(28);
    expect(await count('campaign_daily_metrics', accountId)).toBe(2);

    const acc = await getPool().query('SELECT backfill_concluido, ultima_sync_em FROM ad_accounts WHERE id = $1', [accountId]);
    expect(acc.rows[0].backfill_concluido).toBe(true);
    expect(acc.rows[0].ultima_sync_em).not.toBeNull();

    const run = await getPool().query('SELECT tipo, status, linhas_gravadas FROM sync_runs WHERE id = $1', [result.syncRunId]);
    expect(run.rows[0]).toEqual({ tipo: 'backfill', status: 'sucesso', linhas_gravadas: 2 });
  });

  it('erro na API grava sync_run com erro e não marca backfill como concluído', async () => {
    const accountId = await createAccount({ backfillConcluido: false });
    const api = new FakeGoogleAds();
    api.failFor.add('1234567890');

    const result = await syncAccount(accountId, opts(api));
    expect(result.status).toBe('erro');
    const run = await getPool().query('SELECT status, erro, fim FROM sync_runs WHERE id = $1', [result.syncRunId]);
    expect(run.rows[0].status).toBe('erro');
    expect(run.rows[0].erro).toContain('falha simulada');
    expect(run.rows[0].fim).not.toBeNull();
    const acc = await getPool().query('SELECT backfill_concluido, ultima_sync_em FROM ad_accounts WHERE id = $1', [accountId]);
    expect(acc.rows[0]).toEqual({ backfill_concluido: false, ultima_sync_em: null });
  });

  it('erro em uma conta não interrompe as outras', async () => {
    const ok1 = await createAccount({ customerId: '1000000001', nome: 'A' });
    const bad = await createAccount({ customerId: '1000000002', nome: 'B' });
    const ok2 = await createAccount({ customerId: '1000000003', nome: 'C' });
    await createAccount({ customerId: '1000000004', nome: 'Inativa', ativo: false });
    const api = new FakeGoogleAds();
    api.campaignRows = [campaignRow('2026-10-20', '1')];
    api.failFor.add('1000000002');

    const results = await syncAllActive(api);
    const byId = Object.fromEntries(results.map((r) => [r.accountId, r.result?.status]));
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
