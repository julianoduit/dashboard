import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool } from '../../src/db/pool.js';
import { resetDb } from '../helpers/db.js';
import { createUser, loginAs, makeApp, SENHA } from '../helpers/app.js';

describe('autenticação', () => {
  beforeEach(resetDb);
  afterAll(closePool);

  it('login define cookie httpOnly + SameSite=Strict e /me devolve o usuário sem dados sensíveis', async () => {
    const { app } = makeApp();
    await createUser({ email: 'cli@teste.com', nome: 'Cliente' });
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ email: 'CLI@teste.com ', senha: SENHA });
    expect(res.status).toBe(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/duit_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);

    const me = await agent.get('/api/auth/me');
    expect(me.body).toMatchObject({ nome: 'Cliente', email: 'cli@teste.com', papel: 'cliente' });
    expect(JSON.stringify(me.body)).not.toMatch(/senha|hash|token/i);
  });

  it('senha errada, e-mail inexistente e usuário inativo têm a mesma resposta', async () => {
    const { app } = makeApp();
    await createUser({ email: 'ok@teste.com' });
    await createUser({ email: 'inativo@teste.com', ativo: false });
    const r1 = await request(app).post('/api/auth/login').send({ email: 'ok@teste.com', senha: 'errada' });
    const r2 = await request(app).post('/api/auth/login').send({ email: 'naoexiste@teste.com', senha: SENHA });
    const r3 = await request(app).post('/api/auth/login').send({ email: 'inativo@teste.com', senha: SENHA });
    for (const r of [r1, r2, r3]) {
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ erro: 'E-mail ou senha incorretos' });
    }
  });

  it('rate limit: bloqueia após 5 tentativas erradas para o mesmo e-mail', async () => {
    const { app } = makeApp();
    await createUser({ email: 'alvo@teste.com' });
    for (let i = 0; i < 5; i++) {
      expect((await request(app).post('/api/auth/login').send({ email: 'alvo@teste.com', senha: 'x' })).status).toBe(401);
    }
    const blocked = await request(app).post('/api/auth/login').send({ email: 'alvo@teste.com', senha: SENHA });
    expect(blocked.status).toBe(429);
  });

  it('logout limpa o cookie', async () => {
    const { app } = makeApp();
    const u = await createUser();
    const agent = await loginAs(app, u.email);
    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('desativar o usuário derruba a sessão ativa', async () => {
    const { app } = makeApp();
    const admin = await createUser({ papel: 'admin' });
    const cli = await createUser();
    const ca = await loginAs(app, cli.email);
    const ad = await loginAs(app, admin.email);
    expect((await ca.get('/api/auth/me')).status).toBe(200);
    expect((await ad.patch(`/api/admin/users/${cli.id}`).send({ ativo: false })).status).toBe(200);
    expect((await ca.get('/api/auth/me')).status).toBe(401);
  });

  it('trocar a senha derruba sessões antigas e a nova senha funciona', async () => {
    const { app } = makeApp();
    const admin = await createUser({ papel: 'admin' });
    const cli = await createUser();
    const ca = await loginAs(app, cli.email);
    const ad = await loginAs(app, admin.email);
    await ad.patch(`/api/admin/users/${cli.id}`).send({ senha: 'nova-senha-456' });
    expect((await ca.get('/api/auth/me')).status).toBe(401);
    await expect(loginAs(app, cli.email, 'nova-senha-456')).resolves.toBeDefined();
  });

  it('corpo inválido no login responde 400 sem stack', async () => {
    const { app } = makeApp();
    const r = await request(app).post('/api/auth/login').set('content-type', 'application/json').send('{invalido');
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).not.toMatch(/at .*\.ts/);
  });
});
