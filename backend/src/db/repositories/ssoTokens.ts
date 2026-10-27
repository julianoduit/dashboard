import { createHash, randomBytes } from 'node:crypto';
import { getPool, type Queryable } from '../pool.js';

const VALIDADE_SEGUNDOS = 60;

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** Cria um token de uso único. Só o hash fica no banco. */
export async function create(destino: string, db: Queryable = getPool()): Promise<{ token: string; expiraEm: Date }> {
  const token = randomBytes(32).toString('base64url');
  const res = await db.query<{ expira_em: Date }>(
    `INSERT INTO sso_tokens (token_hash, destino, expira_em) VALUES ($1, $2, now() + make_interval(secs => $3))
     RETURNING expira_em`,
    [hash(token), destino, VALIDADE_SEGUNDOS],
  );
  // Limpeza oportunista: tokens com mais de um dia não servem para nada.
  await db.query(`DELETE FROM sso_tokens WHERE criado_em < now() - interval '1 day'`);
  return { token, expiraEm: res.rows[0]!.expira_em };
}

/** Consome o token (uma vez só, dentro da validade). Devolve o destino ou undefined. */
export async function consume(token: string, db: Queryable = getPool()): Promise<string | undefined> {
  const res = await db.query<{ destino: string }>(
    `UPDATE sso_tokens SET usado_em = now()
      WHERE token_hash = $1 AND usado_em IS NULL AND expira_em > now()
      RETURNING destino`,
    [hash(token)],
  );
  return res.rows[0]?.destino;
}
