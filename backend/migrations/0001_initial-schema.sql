-- Up Migration

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE user_role AS ENUM ('admin', 'cliente');
CREATE TYPE sync_run_status AS ENUM ('executando', 'sucesso', 'erro');
CREATE TYPE sync_run_type AS ENUM ('diario', 'manual', 'backfill');

CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  nome          TEXT NOT NULL,
  email         CITEXT NOT NULL UNIQUE,
  senha_hash    TEXT NOT NULL,
  papel         user_role NOT NULL DEFAULT 'cliente',
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  -- Incrementado ao trocar senha ou desativar; invalida JWTs emitidos antes.
  token_version INTEGER NOT NULL DEFAULT 0,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ad_accounts (
  id                 BIGSERIAL PRIMARY KEY,
  customer_id        TEXT NOT NULL UNIQUE CHECK (customer_id ~ '^[0-9]{10}$'),
  nome               TEXT NOT NULL,
  moeda              TEXT NOT NULL,
  fuso               TEXT NOT NULL,
  status_google      TEXT,
  -- Só contas ativas entram no sync e ficam visíveis para clientes.
  ativo              BOOLEAN NOT NULL DEFAULT FALSE,
  backfill_concluido BOOLEAN NOT NULL DEFAULT FALSE,
  ultima_sync_em     TIMESTAMPTZ,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_ad_accounts (
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ad_account_id BIGINT NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ad_account_id)
);
CREATE INDEX user_ad_accounts_ad_account_idx ON user_ad_accounts (ad_account_id);

CREATE TABLE sync_runs (
  id              BIGSERIAL PRIMARY KEY,
  ad_account_id   BIGINT NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  tipo            sync_run_type NOT NULL,
  periodo_inicio  DATE NOT NULL,
  periodo_fim     DATE NOT NULL,
  inicio          TIMESTAMPTZ NOT NULL DEFAULT now(),
  fim             TIMESTAMPTZ,
  status          sync_run_status NOT NULL DEFAULT 'executando',
  erro            TEXT,
  linhas_gravadas INTEGER NOT NULL DEFAULT 0,
  disparado_por   BIGINT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX sync_runs_account_inicio_idx ON sync_runs (ad_account_id, inicio DESC);

CREATE TABLE campaign_daily_metrics (
  ad_account_id     BIGINT NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  campaign_id       BIGINT NOT NULL,
  campaign_name     TEXT NOT NULL,
  campaign_status   TEXT NOT NULL,
  channel_type      TEXT NOT NULL,
  data              DATE NOT NULL,
  impressions       BIGINT NOT NULL DEFAULT 0,
  clicks            BIGINT NOT NULL DEFAULT 0,
  cost              NUMERIC(18, 6) NOT NULL DEFAULT 0,
  conversions       NUMERIC(18, 6) NOT NULL DEFAULT 0,
  conversions_value NUMERIC(18, 6) NOT NULL DEFAULT 0,
  sync_run_id       BIGINT REFERENCES sync_runs(id) ON DELETE SET NULL,
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ad_account_id, campaign_id, data)
);
CREATE INDEX campaign_daily_metrics_account_data_idx ON campaign_daily_metrics (ad_account_id, data);

CREATE TABLE conversion_action_daily_metrics (
  ad_account_id              BIGINT NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  campaign_id                BIGINT NOT NULL,
  data                       DATE NOT NULL,
  -- Chave pelo ID da ação: renomear a ação no Google Ads não pode gerar linhas duplicadas.
  conversion_action_id       BIGINT NOT NULL,
  conversion_action_name     TEXT NOT NULL,
  conversion_action_category TEXT NOT NULL,
  conversions                NUMERIC(18, 6) NOT NULL DEFAULT 0,
  conversions_value          NUMERIC(18, 6) NOT NULL DEFAULT 0,
  sync_run_id                BIGINT REFERENCES sync_runs(id) ON DELETE SET NULL,
  atualizado_em              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ad_account_id, campaign_id, data, conversion_action_id)
);
CREATE INDEX conversion_action_daily_metrics_account_data_idx ON conversion_action_daily_metrics (ad_account_id, data);

-- Down Migration

DROP TABLE conversion_action_daily_metrics;
DROP TABLE campaign_daily_metrics;
DROP TABLE sync_runs;
DROP TABLE user_ad_accounts;
DROP TABLE ad_accounts;
DROP TABLE users;
DROP TYPE sync_run_type;
DROP TYPE sync_run_status;
DROP TYPE user_role;
