-- Up Migration

-- Orçamento diário de operações na Google Ads API (cota dividida com o KiipitADS).
ALTER TABLE sync_runs ADD COLUMN operacoes INTEGER NOT NULL DEFAULT 0;
-- Nota não-erro sobre a execução (ex.: histórico parou na cota do dia e continua amanhã).
ALTER TABLE sync_runs ADD COLUMN observacao TEXT;
-- Execução que não rodou (ou parou antes da janela) porque a cota do dia acabou.
ALTER TYPE sync_run_status ADD VALUE IF NOT EXISTS 'adiado';

-- Carga histórica gradual: data mais antiga já carregada (null = nada carregado ainda).
ALTER TABLE ad_accounts ADD COLUMN historico_ate DATE;
UPDATE ad_accounts a
   SET historico_ate = coalesce(
         (SELECT min(m.data) FROM campaign_daily_metrics m WHERE m.ad_account_id = a.id),
         ((now() AT TIME ZONE 'America/Sao_Paulo')::date - INTERVAL '13 months')::date)
 WHERE a.backfill_concluido;
ALTER TABLE ad_accounts DROP COLUMN backfill_concluido;

-- Login único vindo do KiipitADS: só o hash do token é guardado; uso único e validade curta.
CREATE TABLE sso_tokens (
  token_hash TEXT PRIMARY KEY,
  destino    TEXT NOT NULL,
  expira_em  TIMESTAMPTZ NOT NULL,
  usado_em   TIMESTAMPTZ,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sso_tokens_expira_idx ON sso_tokens (expira_em);

-- Down Migration

DROP TABLE sso_tokens;
ALTER TABLE ad_accounts ADD COLUMN backfill_concluido BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE ad_accounts SET backfill_concluido = historico_ate IS NOT NULL;
ALTER TABLE ad_accounts DROP COLUMN historico_ate;
ALTER TABLE sync_runs DROP COLUMN observacao;
ALTER TABLE sync_runs DROP COLUMN operacoes;
-- O valor 'adiado' do enum não é removido (Postgres não permite remover valor de enum).
