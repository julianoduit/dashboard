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
  ultima_sync_em: Date | null;
}

const columns = 'id, customer_id, nome, moeda, fuso, status_google, ativo, backfill_concluido, ultima_sync_em';

/** Grava/atualiza a lista de contas vinda da MCC. Não altera o campo `ativo` de contas existentes. */
export async function upsertFromMcc(records: MccClientRecord[], db: Queryable = getPool()): Promise<number> {
  if (!records.length) return 0;
  const res = await db.query(
    `INSERT INTO ad_accounts (customer_id, nome, moeda, fuso, status_google)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
     ON CONFLICT (customer_id) DO UPDATE SET
       nome = EXCLUDED.nome,
       moeda = EXCLUDED.moeda,
       fuso = EXCLUDED.fuso,
       status_google = EXCLUDED.status_google,
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
