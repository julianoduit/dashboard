import type { MccClientRecord } from '../../googleAds/mappers.js';
import { getPool, type Queryable } from '../pool.js';

export interface AdAccount {
  id: number;
  customer_id: string;
  nome: string;
  moeda: string;
  fuso: string;
  status_google: string | null;
  ativo: boolean;
  backfill_concluido: boolean;
  exibir_roas: boolean;
  na_mcc: boolean;
  ultima_sync_em: Date | null;
}

const columns = 'id, customer_id, nome, moeda, fuso, status_google, ativo, backfill_concluido, exibir_roas, na_mcc, ultima_sync_em';

/**
 * Grava/atualiza a lista de contas vinda da MCC. Não altera `ativo` de contas existentes.
 * Contas que não vieram nesta lista ficam com na_mcc = false (nada é apagado).
 */
export async function upsertFromMcc(records: MccClientRecord[], db: Queryable = getPool()): Promise<number> {
  await db.query('UPDATE ad_accounts SET na_mcc = (customer_id = ANY($1::text[])) WHERE na_mcc IS DISTINCT FROM (customer_id = ANY($1::text[]))', [
    records.map((r) => r.customerId),
  ]);
  if (!records.length) return 0;
  const res = await db.query(
    `INSERT INTO ad_accounts (customer_id, nome, moeda, fuso, status_google)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
     ON CONFLICT (customer_id) DO UPDATE SET
       nome = EXCLUDED.nome,
       moeda = EXCLUDED.moeda,
       fuso = EXCLUDED.fuso,
       status_google = EXCLUDED.status_google,
       na_mcc = TRUE,
       atualizado_em = now()`,
    [
      records.map((r) => r.customerId),
      records.map((r) => r.nome),
      records.map((r) => r.moeda),
      records.map((r) => r.fuso),
      records.map((r) => r.status),
    ],
  );
  return res.rowCount ?? 0;
}

export async function findById(id: number, db: Queryable = getPool()): Promise<AdAccount | undefined> {
  const res = await db.query<AdAccount>(`SELECT ${columns} FROM ad_accounts WHERE id = $1`, [id]);
  return res.rows[0];
}

export async function findByCustomerId(customerId: string, db: Queryable = getPool()): Promise<AdAccount | undefined> {
  const res = await db.query<AdAccount>(`SELECT ${columns} FROM ad_accounts WHERE customer_id = $1`, [customerId]);
  return res.rows[0];
}

export async function listActive(db: Queryable = getPool()): Promise<AdAccount[]> {
  const res = await db.query<AdAccount>(`SELECT ${columns} FROM ad_accounts WHERE ativo ORDER BY nome`);
  return res.rows;
}

export async function setActive(id: number, ativo: boolean, db: Queryable = getPool()): Promise<void> {
  await db.query('UPDATE ad_accounts SET ativo = $2, atualizado_em = now() WHERE id = $1', [id, ativo]);
}

export async function updateFlags(
  id: number,
  flags: Partial<{ ativo: boolean; exibirRoas: boolean }>,
  db: Queryable = getPool(),
): Promise<void> {
  await db.query(
    `UPDATE ad_accounts SET ativo = coalesce($2, ativo), exibir_roas = coalesce($3, exibir_roas), atualizado_em = now()
      WHERE id = $1`,
    [id, flags.ativo ?? null, flags.exibirRoas ?? null],
  );
}

export async function markSynced(id: number, backfillConcluido: boolean, db: Queryable = getPool()): Promise<void> {
  await db.query(
    `UPDATE ad_accounts
        SET ultima_sync_em = now(),
            backfill_concluido = backfill_concluido OR $2,
            atualizado_em = now()
      WHERE id = $1`,
    [id, backfillConcluido],
  );
}

export interface AdAccountAdminRow extends AdAccount {
  usuarios: number;
  ultima_sync_status: string | null;
  ultima_sync_erro: string | null;
}

/** Lista para o admin: todas as contas com vínculos e o resultado da última sincronização. */
export async function listForAdmin(db: Queryable = getPool()): Promise<AdAccountAdminRow[]> {
  const res = await db.query<AdAccountAdminRow>(
    `SELECT ${columns.split(', ').map((c) => `a.${c}`).join(', ')},
            (SELECT count(*) FROM user_ad_accounts ua WHERE ua.ad_account_id = a.id)::int AS usuarios,
            r.status::text AS ultima_sync_status, r.erro AS ultima_sync_erro
       FROM ad_accounts a
       LEFT JOIN LATERAL (
         SELECT status, erro FROM sync_runs s WHERE s.ad_account_id = a.id ORDER BY s.id DESC LIMIT 1
       ) r ON true
      ORDER BY a.ativo DESC, a.nome`,
  );
  return res.rows;
}

/** Contas visíveis para um usuário cliente (vinculadas e ativas). */
export async function listForUser(userId: number, db: Queryable = getPool()): Promise<AdAccount[]> {
  const res = await db.query<AdAccount>(
    `SELECT ${columns.split(', ').map((c) => `a.${c}`).join(', ')}
       FROM ad_accounts a JOIN user_ad_accounts ua ON ua.ad_account_id = a.id
      WHERE ua.user_id = $1 AND a.ativo
      ORDER BY a.nome`,
    [userId],
  );
  return res.rows;
}
