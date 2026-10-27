import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool, getPool } from '../../src/db/pool.js';
import { createAccount, resetDb } from '../helpers/db.js';
import { createUser, loginAs, makeApp } from '../helpers/app.js';
import { campaignRow } from '../helpers/fakeGoogleAds.js';

async function waitFor(fn: () => Promise<boolean>, timeoutMs = 5000) {
  const start = Date.now();
  while (!(await fn())) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('API de admin', () => {
  beforeEach(resetDb);
  afterAll(closePool);

  it('cria cliente com contas vinculadas e ele passa a ver só elas', async () => {
    const { app } = makeApp();
    const c1 = await createAccount({ customerId: '1000000001' });
    await createAccount({ customerId: '1000000002' });
    const admin = await createUser({ papel: 'admin' });
    const ad = await loginAs(app, admin.email);

    const r = await ad.post('/api/admin/users').send({ nome: 'Cliente X', email: 'X@cliente.com', senha: 'senha-forte-1', accountIds: [c1] });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ email: 'x@cliente.com', papel: 'cliente', contas: [c1] });
    expect(JSON.stringify(r.body)).not.toMatch(/senha_hash|senha-forte/);

    const cli = await loginAs(app, 'x@cliente.com', 'senha-forte-1');
    const list = await cli.get('/api/accounts');
    expect(list.body.map((a: { id: number }) => a.id)).toEqual([c1]);

    const view = await ad.get(`/api/admin/users/${r.body.id}/accounts`);
    expect(view.body.contas.map((a: { id: number }) => a.id)).toEqual([c1]);
  });

  it('valida senha curta, e-mail duplicado e conta inexistente', async () => {
    const { app } = makeApp();
    const admin = await createUser({ papel: 'admin', email: 'adm@duit.com' });
    const ad = await loginAs(app, admin.email);
    expect((await ad.post('/api/admin/users').send({ nome: 'A', email: 'a@a.com', senha: '123' })).status).toBe(400);
    expect((await ad.post('/api/admin/users').send({ nome: 'A', email: 'ADM@duit.com', senha: '12345678' })).status).toBe(409);
    expect((await ad.post('/api/admin/users').send({ nome: 'A', email: 'b@a.com', senha: '12345678', accountIds: [999] })).status).toBe(400);
  });

  it('admin não pode desativar, rebaixar nem excluir a si mesmo', async () => {
    const { app } = makeApp();
    const admin = await createUser({ papel: 'admin' });
    const ad = await loginAs(app, admin.email);
    expect((await ad.patch(`/api/admin/users/${admin.id}`).send({ ativo: false })).status).toBe(400);
    expect((await ad.patch(`/api/admin/users/${admin.id}`).send({ papel: 'cliente' })).status).toBe(400);
    expect((await ad.delete(`/api/admin/users/${admin.id}`)).status).toBe(400);
  });

  it('atualizar lista da MCC grava contas novas como inativas', async () => {
    const { app, fake } = makeApp();
    fake.searchStream = async <T>() =>
      [
        { customerClient: { id: '2000000001', descriptiveName: 'Nova', currencyCode: 'BRL', timeZone: 'America/Sao_Paulo', status: 'ENABLED' } },
        { customerClient: { id: '2000000002', descriptiveName: 'Sub', currencyCode: 'BRL', timeZone: 'America/Sao_Paulo', status: 'ENABLED', manager: true } },
      ] as T[];
    const admin = await createUser({ papel: 'admin' });
    const ad = await loginAs(app, admin.email);
    expect((await ad.post('/api/admin/accounts/refresh-mcc')).body).toEqual({ contas: 1 });
    const list = await ad.get('/api/admin/accounts');
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ customer_id: '2000000001', ativo: false, usuarios: 0 });
  });

  it('sync manual: exige conta ativa, roda em segundo plano e aparece no histórico', async () => {
    const { app, fake } = makeApp();
    fake.campaignRows = [campaignRow('2026-10-20', '1')];
    const conta = await createAccount({ ativo: false });
    const admin = await createUser({ papel: 'admin' });
    const ad = await loginAs(app, admin.email);

    expect((await ad.post(`/api/admin/accounts/${conta}/sync`)).status).toBe(409);
    expect((await ad.patch(`/api/admin/accounts/${conta}`).send({ ativo: true })).body.ativo).toBe(true);
    expect((await ad.post(`/api/admin/accounts/${conta}/sync`)).status).toBe(202);

    await waitFor(async () => {
      const r = await getPool().query(`SELECT 1 FROM sync_runs WHERE status <> 'executando'`);
      return (r.rowCount ?? 0) > 0;
    });
    const runs = await ad.get(`/api/admin/sync-runs?accountId=${conta}`);
    expect(runs.body[0]).toMatchObject({ tipo: 'manual', status: 'sucesso', disparado_por_nome: 'Usuário' });
  });
});
