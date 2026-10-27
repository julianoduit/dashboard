import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool } from '../../src/db/pool.js';
import { createAccount, resetDb } from '../helpers/db.js';
import { createUser, insertCampaignDay, loginAs, makeApp } from '../helpers/app.js';

const METRIC_PATHS = ['', '/summary', '/daily', '/conversion-actions', '/campaigns'];
const Q = '?inicio=2026-10-01&fim=2026-10-26';

describe('controle de acesso por conta', () => {
  let contaA: number;
  let contaB: number;
  let contaInativaA: number;
  let clienteA: { id: number; email: string };
  let clienteB: { id: number; email: string };
  let admin: { id: number; email: string };

  beforeEach(async () => {
    await resetDb();
    contaA = await createAccount({ customerId: '1000000001', nome: 'Conta A' });
    contaB = await createAccount({ customerId: '1000000002', nome: 'Conta B' });
    contaInativaA = await createAccount({ customerId: '1000000003', nome: 'Conta A inativa', ativo: false });
    await insertCampaignDay(contaA, '2026-10-10', { cost: 100, conversions: 5 });
    await insertCampaignDay(contaB, '2026-10-10', { cost: 999, conversions: 50 });
    clienteA = await createUser({ email: 'a@cliente.com', contas: [contaA, contaInativaA] });
    clienteB = await createUser({ email: 'b@cliente.com', contas: [contaB] });
    admin = await createUser({ email: 'admin@duit.com', papel: 'admin' });
  });
  afterAll(closePool);

  it('cliente A não acessa nenhuma rota de métrica da conta do cliente B (404)', async () => {
    const { app } = makeApp();
    const a = await loginAs(app, clienteA.email);
    for (const path of METRIC_PATHS) {
      const res = await a.get(`/api/accounts/${contaB}${path}${Q}`);
      expect(res.status, path).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain('999');
    }
  });

  it('cliente acessa a própria conta', async () => {
    const { app } = makeApp();
    const a = await loginAs(app, clienteA.email);
    for (const path of METRIC_PATHS) {
      expect((await a.get(`/api/accounts/${contaA}${path}${Q}`)).status, path).toBe(200);
    }
    const res = await a.get(`/api/accounts/${contaA}/summary${Q}`);
    expect(res.body.atual.investimento).toBe(100);
  });

  it('conta vinculada mas desativada não aparece nem é acessível para o cliente', async () => {
    const { app } = makeApp();
    const a = await loginAs(app, clienteA.email);
    const list = await a.get('/api/accounts');
    expect(list.body.map((c: { id: number }) => c.id)).toEqual([contaA]);
    expect((await a.get(`/api/accounts/${contaInativaA}/summary`)).status).toBe(404);
  });

  it('IDs inexistentes ou malformados respondem igual a sem acesso', async () => {
    const { app } = makeApp();
    const a = await loginAs(app, clienteA.email);
    for (const id of ['999999', 'abc', '1;DROP', '-1', '1.5']) {
      expect((await a.get(`/api/accounts/${id}/summary`)).status, id).toBe(404);
    }
  });

  it('cliente não acessa rotas de admin (403)', async () => {
    const { app } = makeApp();
    const a = await loginAs(app, clienteA.email);
    const rotas: Array<[string, string]> = [
      ['get', '/api/admin/accounts'],
      ['post', '/api/admin/accounts/refresh-mcc'],
      ['patch', `/api/admin/accounts/${contaB}`],
      ['post', `/api/admin/accounts/${contaB}/sync`],
      ['get', '/api/admin/sync-runs'],
      ['get', '/api/admin/users'],
      ['post', '/api/admin/users'],
      ['put', `/api/admin/users/${clienteA.id}/accounts`],
      ['get', `/api/admin/users/${clienteB.id}/accounts`],
      ['delete', `/api/admin/users/${clienteB.id}`],
    ];
    for (const [method, path] of rotas) {
      const res = await (a as unknown as Record<string, (p: string) => request.Test>)[method]!(path).send({ accountIds: [contaB] });
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it('cliente não consegue se vincular a outra conta pela API', async () => {
    const { app } = makeApp();
    const a = await loginAs(app, clienteA.email);
    await a.put(`/api/admin/users/${clienteA.id}/accounts`).send({ accountIds: [contaB] });
    expect((await a.get(`/api/accounts/${contaB}/summary`)).status).toBe(404);
  });

  it('admin acessa qualquer conta', async () => {
    const { app } = makeApp();
    const ad = await loginAs(app, admin.email);
    expect((await ad.get(`/api/accounts/${contaA}/summary${Q}`)).status).toBe(200);
    expect((await ad.get(`/api/accounts/${contaB}/summary${Q}`)).body.atual.investimento).toBe(999);
  });

  it('sem sessão: 401 em métricas e admin', async () => {
    const { app } = makeApp();
    expect((await request(app).get(`/api/accounts/${contaA}/summary`)).status).toBe(401);
    expect((await request(app).get('/api/accounts')).status).toBe(401);
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
  });

  it('cookie forjado ou adulterado é rejeitado', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/accounts').set('Cookie', 'duit_session=eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIiwidHYiOjB9.');
    expect(res.status).toBe(401);
  });

  it('vínculo removido pelo admin corta o acesso na hora', async () => {
    const { app } = makeApp();
    const a = await loginAs(app, clienteA.email);
    const ad = await loginAs(app, admin.email);
    expect((await a.get(`/api/accounts/${contaA}/summary`)).status).toBe(200);
    expect((await ad.put(`/api/admin/users/${clienteA.id}/accounts`).send({ accountIds: [] })).status).toBe(200);
    expect((await a.get(`/api/accounts/${contaA}/summary`)).status).toBe(404);
  });
});
