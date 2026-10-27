-- Up Migration

-- Liga/desliga "Valor de conversão" e ROAS no dashboard do cliente. Útil em contas de lead
-- em que as ações usam o valor padrão (ex.: R$ 1 por conversão) e o ROAS não significa nada.
ALTER TABLE ad_accounts ADD COLUMN exibir_roas BOOLEAN NOT NULL DEFAULT TRUE;

-- false quando a conta não veio na última atualização da lista da MCC (saiu da MCC ou foi
-- movida para uma sub-MCC). A conta e o histórico são mantidos; o admin decide o que fazer.
ALTER TABLE ad_accounts ADD COLUMN na_mcc BOOLEAN NOT NULL DEFAULT TRUE;

-- Down Migration

ALTER TABLE ad_accounts DROP COLUMN na_mcc;
ALTER TABLE ad_accounts DROP COLUMN exibir_roas;
