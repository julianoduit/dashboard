import { getPool } from '../../src/db/pool.js';

export async function resetDb(): Promise<void> {
  await getPool().query(
    'TRUNCATE users, ad_accounts, user_ad_accounts, sync_runs, campaign_daily_metrics, conversion_action_daily_metrics RESTART IDENTITY CASCADE',
  );
}

export async function createAccount(
  overrides: Partial<{ customerId: string; nome: string; fuso: string; ativo: boolean; backfillConcluido: boolean }> = {},
): Promise<number> {
  const res = await getPool().query<{ id: number }>(
    `INSERT INTO ad_accounts (customer_id, nome, moeda, fuso, status_google, ativo, backfill_concluido)
     VALUES ($1, $2, 'BRL', $3, 'ENABLED', $4, $5) RETURNING id`,
    [
      overrides.customerId ?? '1234567890',
      overrides.nome ?? 'Conta Teste',
      overrides.fuso ?? 'America/Sao_Paulo',
      overrides.ativo ?? true,
      overrides.backfillConcluido ?? true,
    ],
  );
  return res.rows[0]!.id;
}
