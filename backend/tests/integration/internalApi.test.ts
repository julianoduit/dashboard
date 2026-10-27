import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvCache } from '../../src/config/env.js';
import { closePool, getPool } from '../../src/db/pool.js';
import { SERVICE_USER_EMAIL } from '../../src/db/repositories/users.js';
import { createAccount, resetDb } from '../helpers/db.js';
import { createUser, loginAs, makeApp, SENHA } from '../helpers/app.js';
import { campaignRow } from '../helpers/fakeGoogleAds.js';

const TOKEN = 'token-interno-de-teste-com-mais-de-32-chars';
const auth = { Authorization: `Bearer ${TOKEN}` };

async function waitFor(fn: () => Promise<boolean>, timeoutMs = 5000) {
  const start = Date.now();
  while (!(await fn())) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Gera um link de SSO pela API interna e devolve só o token. */
async function gerarToken(app: ReturnType<typeof makeApp>['app'], destino?: string) {
  const r = await request(app).post('/api/internal/sso').set(auth).send(destino ? { destino } : {});
  expect(r.status).toBe(200);
  return new URL(r.body.url).searchParams.get('t')!;
}

describe('API interna (KiipitADS)', () => {
  beforeEach(resetDb);
  afterAll(closePool);

  it('exige o token: sem token, token errado ou formato errado dá 401', async () => {
    const { app } = makeApp();
    expect((await request(app).get('/api/internal/accounts')).status).toBe(401);
    expect((await request(app).get('/api/internal/accounts').set('Authorization', 'Bearer errado')).status).toBe(401);
    expect((await request(app).get('/api/internal/accounts').set('Authorization', TOKEN)).status).toBe(401);
    expect((await request(app).get('/api/internal/accounts').set(auth)).status).toBe(200);
  });

  it('sessão de admin do site não abre a API interna (precisa do token)', async () => {
    const { app } = makeApp();
    const admin = await createUser({ papel: 'admin' });
    const ad = await loginAs(app, admin.email);
    expect((await ad.get('/api/internal/accounts')).status).toBe(401);
  });

  it('lista contas pelo customer_id com usuários vinculados e progresso do histórico', async () => {
    const { app } = makeApp();
    const conta = await createAccount({ customerId: '3552962784', nome: 'InLife' });
    await createAccount({ customerId: '1000000002', nome: 'Outra', ativo: false, historicoAte: null });
    await createUser({ nome: 'Cliente InLife', email: 'inlife@cli.com', contas: [conta] });
    await createUser({ papel: 'admin', email: 'adm@duit.com' });

    const r = await request(app).get('/api/internal/accounts').set(auth);
    const inlife = r.body.find((c: { customerId: string }) => c.customerId === '3552962784');
    expect(inlife).toMatchObject({ nome: 'InLife', ativo: true, exibirRoas: true, naMcc: true, historicoAte: '2025-09-27' });
    expect(inlife.usuarios).toEqual([{ id: expect.any(Number), nome: 'Cliente InLife', email: 'inlife@cli.com', ativo: true }]);

    const um = await request(app).get('/api/internal/accounts/355-296-2784').set(auth);
    expect(um.body.customerId).toBe('3552962784');
    expect((await request(app).get('/api/internal/accounts/9999999999').set(auth)).status).toBe(404);
    expect((await request(app).get('/api/internal/accounts/abc').set(auth)).status).toBe(404);
  });

  it('ativa/desativa e liga/desliga valor/ROAS pelo customer_id', async () => {
    const { app } = makeApp();
    await createAccount({ customerId: '3552962784', ativo: false });
    const r = await request(app).patch('/api/internal/accounts/3552962784').set(auth).send({ ativo: true, exibirRoas: false });
    expect(r.body).toMatchObject({ ativo: true, exibirRoas: false });
    expect((await request(app).patch('/api/internal/accounts/3552962784').set(auth).send({})).status).toBe(400);
  });

  it('dispara sync como a equipe (aparece no histórico) e recusa conta inativa', async () => {
    const { app, fake } = makeApp();
    fake.campaignRows = [campaignRow('2026-10-20', '1')];
    await createAccount({ customerId: '3552962784' });
    await createAccount({ customerId: '1000000002', ativo: false });
    expect((await request(app).post('/api/internal/accounts/1000000002/sync').set(auth)).status).toBe(409);
    expect((await request(app).post('/api/internal/accounts/3552962784/sync').set(auth)).status).toBe(202);
    await waitFor(async () => ((await getPool().query(`SELECT 1 FROM sync_runs WHERE status <> 'executando'`)).rowCount ?? 0) > 0);
    const run = await getPool().query(
      `SELECT r.tipo, r.status, u.email::text AS email FROM sync_runs r JOIN users u ON u.id = r.disparado_por`,
    );
    expect(run.rows[0]).toEqual({ tipo: 'manual', status: 'sucesso', email: SERVICE_USER_EMAIL });
  });
});

describe('login único (SSO) a partir do KiipitADS', () => {
  beforeEach(resetDb);

  it('link abre sessão de equipe e redireciona para o destino', async () => {
    const { app } = makeApp();
    const token = await gerarToken(app, '/admin/usuarios');
    const agent = request.agent(app);
    const r = await agent.get(`/api/auth/sso?t=${token}`);
    expect(r.status).toBe(303);
    expect(r.headers.location).toBe('/admin/usuarios');
    const me = await agent.get('/api/auth/me');
    expect(me.body).toMatchObject({ papel: 'admin', email: SERVICE_USER_EMAIL });
    expect((await agent.get('/api/admin/accounts')).status).toBe(200);
  });

  it('o link vale uma vez só', async () => {
    const { app } = makeApp();
    const token = await gerarToken(app);
    expect((await request(app).get(`/api/auth/sso?t=${token}`)).status).toBe(303);
    const segunda = await request(app).get(`/api/auth/sso?t=${token}`);
    expect(segunda.status).toBe(400);
    expect(segunda.headers['set-cookie']).toBeUndefined();
  });

  it('link expirado ou inventado não abre sessão', async () => {
    const { app } = makeApp();
    const token = await gerarToken(app);
    await getPool().query(`UPDATE sso_tokens SET expira_em = now() - interval '1 second'`);
    expect((await request(app).get(`/api/auth/sso?t=${token}`)).status).toBe(400);
    expect((await request(app).get('/api/auth/sso?t=inventadoinventadoinventado')).status).toBe(400);
    expect((await request(app).get('/api/auth/sso')).status).toBe(400);
  });

  it('não aceita destino externo (evita redirecionamento aberto)', async () => {
    const { app } = makeApp();
    for (const destino of ['https://evil.com', '//evil.com', '/\\evil.com', 'admin', '/a\r\nSet-Cookie: x=1']) {
      expect((await request(app).post('/api/internal/sso').set(auth).send({ destino })).status, destino).toBe(400);
    }
  });

  it('usuário de serviço não tem senha que funcione e não aparece na lista de usuários', async () => {
    const { app } = makeApp();
    const token = await gerarToken(app);
    await request(app).get(`/api/auth/sso?t=${token}`);
    for (const senha of ['', '!sem-senha', 'qualquer']) {
      const r = await request(app).post('/api/auth/login').send({ email: SERVICE_USER_EMAIL, senha: senha || 'x' });
      expect(r.status).toBe(401);
    }
    const admin = await createUser({ papel: 'admin' });
    const ad = await loginAs(app, admin.email);
    const lista = await ad.get('/api/admin/users');
    expect(lista.body.some((u: { email: string }) => u.email === SERVICE_USER_EMAIL)).toBe(false);
  });

  it('/api/config expõe só o link do KiipitADS e se há login de admin por senha', async () => {
    const { app } = makeApp();
    const r = await request(app).get('/api/config');
    expect(r.body).toEqual({ kiipitadsUrl: 'https://kiipitads.teste', adminPasswordLogin: true });
  });
});

describe('login de admin por senha desligado', () => {
  beforeEach(async () => {
    await resetDb();
    process.env.ADMIN_PASSWORD_LOGIN = 'false';
    resetEnvCache();
  });
  afterEach(() => {
    process.env.ADMIN_PASSWORD_LOGIN = 'true';
    resetEnvCache();
  });

  it('admin com senha certa é recusado com a mensagem genérica; cliente entra normal', async () => {
    const { app } = makeApp();
    const admin = await createUser({ papel: 'admin', email: 'adm@duit.com' });
    const cli = await createUser({ email: 'cli@empresa.com' });
    const r = await request(app).post('/api/auth/login').send({ email: admin.email, senha: SENHA });
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ erro: 'E-mail ou senha incorretos' });
    expect((await request(app).post('/api/auth/login').send({ email: cli.email, senha: SENHA })).status).toBe(200);
  });

  it('padrão: com o token interno configurado e sem ADMIN_PASSWORD_LOGIN, a senha de admin fica desligada', async () => {
    delete process.env.ADMIN_PASSWORD_LOGIN;
    resetEnvCache();
    const { app } = makeApp();
    expect((await request(app).get('/api/config')).body.adminPasswordLogin).toBe(false);
  });
});
