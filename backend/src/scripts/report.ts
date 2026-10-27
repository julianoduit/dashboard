import { parseArgs } from 'node:util';
import * as accounts from '../db/repositories/accounts.js';
import { getPool } from '../db/pool.js';
import { addDays, isIsoDate, todayInTimeZone } from '../lib/dates.js';
import { runCli } from './cli.js';

// Totais gravados no banco, no mesmo formato do painel do Google Ads, para conferência.
//   npm run report -- --customer-id=1234567890 [--inicio=2026-09-01 --fim=2026-09-30]
const { values } = parseArgs({
  options: { 'customer-id': { type: 'string' }, inicio: { type: 'string' }, fim: { type: 'string' } },
});

await runCli(async () => {
  const customerId = values['customer-id']?.replace(/-/g, '');
  if (!customerId) throw new Error('Informe --customer-id=XXXXXXXXXX');
  const account = await accounts.findByCustomerId(customerId);
  if (!account) throw new Error(`Conta ${customerId} não encontrada em ad_accounts`);

  const fim = values.fim ?? addDays(todayInTimeZone(account.fuso), -1);
  const inicio = values.inicio ?? addDays(fim, -29);
  if (!isIsoDate(inicio) || !isIsoDate(fim)) throw new Error('Datas no formato YYYY-MM-DD');

  const db = getPool();
  const params = [account.id, inicio, fim];

  console.log(`\n${account.nome} (${account.customer_id}) | ${account.moeda} | ${account.fuso}`);
  console.log(`Período: ${inicio} a ${fim} | última sync: ${account.ultima_sync_em?.toISOString() ?? 'nunca'}\n`);

  const total = await db.query(
    `SELECT sum(impressions) AS impressoes, sum(clicks) AS cliques, round(sum(cost), 2) AS custo,
            round(sum(conversions), 2) AS conversoes, round(sum(conversions_value), 2) AS valor_conv
       FROM campaign_daily_metrics WHERE ad_account_id = $1 AND data BETWEEN $2 AND $3`,
    params,
  );
  console.log('Totais da conta');
  console.table(total.rows);

  const campanhas = await db.query(
    `SELECT campaign_id, max(campaign_name) AS campanha, max(campaign_status) AS status,
            sum(impressions) AS impressoes, sum(clicks) AS cliques, round(sum(cost), 2) AS custo,
            round(sum(conversions), 2) AS conversoes, round(sum(conversions_value), 2) AS valor_conv
       FROM campaign_daily_metrics WHERE ad_account_id = $1 AND data BETWEEN $2 AND $3
      GROUP BY campaign_id
     HAVING sum(impressions) > 0 OR sum(cost) > 0 OR sum(conversions) > 0
      ORDER BY sum(cost) DESC`,
    params,
  );
  console.log('Por campanha (com atividade no período)');
  console.table(campanhas.rows);

  const acoes = await db.query(
    `SELECT conversion_action_id,
            (array_agg(conversion_action_name ORDER BY data DESC))[1] AS acao,
            max(conversion_action_category) AS categoria,
            round(sum(conversions), 2) AS conversoes, round(sum(conversions_value), 2) AS valor_conv
       FROM conversion_action_daily_metrics WHERE ad_account_id = $1 AND data BETWEEN $2 AND $3
      GROUP BY conversion_action_id
      ORDER BY sum(conversions) DESC`,
    params,
  );
  console.log('Por ação de conversão');
  console.table(acoes.rows);

  const runs = await db.query(
    `SELECT id, tipo, status, periodo_inicio, periodo_fim, inicio, fim, linhas_gravadas, erro
       FROM sync_runs WHERE ad_account_id = $1 ORDER BY id DESC LIMIT 5`,
    [account.id],
  );
  console.log('Últimas execuções de sync');
  console.table(runs.rows);
});
