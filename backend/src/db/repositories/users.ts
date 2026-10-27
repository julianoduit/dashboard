import { getPool, type Queryable } from '../pool.js';

export type Papel = 'admin' | 'cliente';

export interface User {
  id: number;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  token_version: number;
  criado_em: Date;
}

const columns = 'id, nome, email::text AS email, papel, ativo, token_version, criado_em';

export async function findById(id: number, db: Queryable = getPool()): Promise<User | undefined> {
  const res = await db.query<User>(`SELECT ${columns} FROM users WHERE id = $1`, [id]);
  return res.rows[0];
}

export async function findByEmailWithHash(
  email: string,
  db: Queryable = getPool(),
): Promise<(User & { senha_hash: string }) | undefined> {
  const res = await db.query<User & { senha_hash: string }>(`SELECT ${columns}, senha_hash FROM users WHERE email = $1`, [email]);
  return res.rows[0];
}

export async function list(db: Queryable = getPool()): Promise<Array<User & { contas: number[] }>> {
  const res = await db.query<User & { contas: number[] }>(
    `SELECT u.id, u.nome, u.email::text AS email, u.papel, u.ativo, u.token_version, u.criado_em,
            coalesce(array_agg(ua.ad_account_id ORDER BY ua.ad_account_id) FILTER (WHERE ua.ad_account_id IS NOT NULL), '{}') AS contas
       FROM users u LEFT JOIN user_ad_accounts ua ON ua.user_id = u.id
      GROUP BY u.id ORDER BY u.nome`,
  );
  return res.rows;
}

export async function create(
  input: { nome: string; email: string; senhaHash: string; papel: Papel },
  db: Queryable = getPool(),
): Promise<User> {
  const res = await db.query<User>(
    `INSERT INTO users (nome, email, senha_hash, papel) VALUES ($1, $2, $3, $4) RETURNING ${columns}`,
    [input.nome, input.email, input.senhaHash, input.papel],
  );
  return res.rows[0]!;
}

/** Atualiza campos informados. Trocar senha, papel ou desativar incrementa token_version (derruba sessões). */
export async function update(
  id: number,
  input: Partial<{ nome: string; email: string; senhaHash: string; papel: Papel; ativo: boolean }>,
  db: Queryable = getPool(),
): Promise<User | undefined> {
  const res = await db.query<User>(
    `UPDATE users SET
       nome = coalesce($2, nome),
       email = coalesce($3, email),
       senha_hash = coalesce($4, senha_hash),
       papel = coalesce($5, papel),
       ativo = coalesce($6, ativo),
       token_version = token_version + CASE
         WHEN $4::text IS NOT NULL OR ($5::user_role IS NOT NULL AND $5::user_role <> papel) OR $6::boolean IS FALSE THEN 1
         ELSE 0 END,
       atualizado_em = now()
     WHERE id = $1 RETURNING ${columns}`,
    [id, input.nome ?? null, input.email ?? null, input.senhaHash ?? null, input.papel ?? null, input.ativo ?? null],
  );
  return res.rows[0];
}

export async function remove(id: number, db: Queryable = getPool()): Promise<boolean> {
  const res = await db.query('DELETE FROM users WHERE id = $1', [id]);
  return (res.rowCount ?? 0) > 0;
}

export async function setAccounts(userId: number, accountIds: number[], db: Queryable = getPool()): Promise<void> {
  await db.query('DELETE FROM user_ad_accounts WHERE user_id = $1', [userId]);
  if (accountIds.length) {
    await db.query(
      `INSERT INTO user_ad_accounts (user_id, ad_account_id) SELECT $1, unnest($2::bigint[]) ON CONFLICT DO NOTHING`,
      [userId, accountIds],
    );
  }
}

/** O usuário (cliente) pode ver esta conta? Só contas vinculadas e ativas. */
export async function hasAccountAccess(userId: number, accountId: number, db: Queryable = getPool()): Promise<boolean> {
  const res = await db.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM user_ad_accounts ua JOIN ad_accounts a ON a.id = ua.ad_account_id
        WHERE ua.user_id = $1 AND ua.ad_account_id = $2 AND a.ativo
     ) AS ok`,
    [userId, accountId],
  );
  return res.rows[0]!.ok;
}
