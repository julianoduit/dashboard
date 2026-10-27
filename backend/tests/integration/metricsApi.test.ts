import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool } from '../../src/db/pool.js';
import { createAccount, resetDb } from '../helpers/db.js';
import { createUser, insertCampaignDay, insertConversionDay, loginAs, makeApp } from '../helpers/app.js';

describe('API de métricas', () => {
  let conta: number;
  let agent: Awaited<ReturnType<typeof loginAs>>;

  beforeEach(async () => {
    await resetDb();
    conta = await createAccount();
    const u = await createUser({ contas: [conta] });
    agent = await loginAs(makeApp().app, u.email);

    // Período atual: 20 a 26/10. Anterior: 13 a 19/10.
    await insertCampaignDay(conta, '2026-10-20', { campaignId: 1, nome: 'Busca', impressions: 1000, clicks: 100, cost: 200, conversions: 10, value: 0 });
    await insertCampaignDay(conta, '2026-10-22', { campaignId: 2, nome: 'PMax', impressions: 3000, clicks: 50, cost: 300, conversions: 0 });
    await insertCampaignDay(conta, '2026-10-15', { campaignId: 1, nome: 'Busca antigo', impressions: 500, clicks: 40, cost: 100, conversions: 4 });

    await insertConversionDay(conta, '2026-10-20', { actionId: 10, nome: 'WhatsApp', conversions: 6 });
    await insertConversionDay(conta, '2026-10-20', { actionId: 11, nome: 'Ligação', conversions: 4, categoria: 'PHONE_CALL_LEAD' });
    await insertConversionDay(conta, '2026-10-15', { actionId: 10, nome: 'Whats (nome antigo)', conversions: 3 });
    await insertConversionDay(conta, '2026-10-15', { actionId: 12, nome: 'Formulário', conversions: 1, categoria: 'SUBMIT_LEAD_FORM' });
  });
  afterAll(closePool);

  const Q = '?inicio=2026-10-20&fim=2026-10-26';

  it('summary: totais, derivadas sobre totais, período anterior e variação', async () => {
    const r = await agent.get(`/api/accounts/${conta}/summary${Q}`);
    expect(r.status).toBe(200);
    expect(r.body.periodoAnterior).toEqual({ inicio: '2026-10-13', fim: '2026-10-19' });
    expect(r.body.atual).toMatchObject({ impressoes: 4000, cliques: 150, investimento: 500, conversoes: 10 });
    expect(r.body.atual.ctr).toBeCloseTo(150 / 4000);
    expect(r.body.atual.cpcMedio).toBeCloseTo(500 / 150);
    expect(r.body.atual.custoPorConversao).toBeCloseTo(50);
    expect(r.body.atual.taxaConversao).toBeCloseTo(10 / 150);
    expect(r.body.atual.roas).toBeNull();
    expect(r.body.temValorConversao).toBe(false);
    expect(r.body.anterior).toMatchObject({ investimento: 100, conversoes: 4 });
    expect(r.body.variacao.investimento).toBeCloseTo(4);
    expect(r.body.variacao.conversoes).toBeCloseTo(1.5);
  });

  it('daily: preenche dias sem dados com zero', async () => {
    const r = await agent.get(`/api/accounts/${conta}/daily${Q}`);
    expect(r.body.atual).toHaveLength(7);
    expect(r.body.atual[0]).toMatchObject({ data: '2026-10-20', investimento: 200, conversoes: 10 });
    expect(r.body.atual[1]).toMatchObject({ data: '2026-10-21', investimento: 0, conversoes: 0 });
    expect(r.body.anterior).toHaveLength(7);
    expect(r.body.anterior[2]).toMatchObject({ data: '2026-10-15', investimento: 100 });
  });

  it('conversion-actions: usa o nome mais recente, compara com o anterior e calcula participação', async () => {
    const r = await agent.get(`/api/accounts/${conta}/conversion-actions${Q}`);
    expect(r.body.totalConversoes).toBe(10);
    expect(r.body.acoes.map((a: { nome: string }) => a.nome)).toEqual(['WhatsApp', 'Ligação', 'Formulário']);
    const whats = r.body.acoes[0];
    expect(whats.atual.conversoes).toBe(6);
    expect(whats.anterior.conversoes).toBe(3); // mesma ação (id 10), mesmo com nome antigo diferente
    expect(whats.participacao).toBeCloseTo(0.6);
    expect(whats.variacao.conversoes).toBeCloseTo(1);
    const form = r.body.acoes[2];
    expect(form.atual.conversoes).toBe(0);
    expect(form.anterior.conversoes).toBe(1);
  });

  it('campaigns: ordena por investimento, com nome mais recente e comparação', async () => {
    const r = await agent.get(`/api/accounts/${conta}/campaigns${Q}`);
    expect(r.body.campanhas.map((c: { nome: string }) => c.nome)).toEqual(['PMax', 'Busca']);
    const busca = r.body.campanhas[1];
    expect(busca.atual.custoPorConversao).toBeCloseTo(20);
    expect(busca.anterior.investimento).toBe(100);
    expect(r.body.campanhas[0].atual.custoPorConversao).toBeNull();
  });

  it('ROAS aparece quando a conta tem valor de conversão', async () => {
    await insertCampaignDay(conta, '2026-10-21', { campaignId: 3, impressions: 10, clicks: 1, cost: 100, conversions: 1, value: 900 });
    const r = await agent.get(`/api/accounts/${conta}/summary${Q}`);
    expect(r.body.temValorConversao).toBe(true);
    expect(r.body.atual.roas).toBeCloseTo(900 / 600);
  });

  it('valida o período', async () => {
    expect((await agent.get(`/api/accounts/${conta}/summary?inicio=2026-10-26&fim=2026-10-20`)).status).toBe(400);
    expect((await agent.get(`/api/accounts/${conta}/summary?inicio=2026-02-30`)).status).toBe(400);
    expect((await agent.get(`/api/accounts/${conta}/summary?inicio=2020-01-01&fim=2026-01-01`)).status).toBe(400);
    expect((await agent.get(`/api/accounts/${conta}/summary`)).status).toBe(200);
  });
});
