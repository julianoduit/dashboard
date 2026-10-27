import type { Totais } from '../../metrics/derived.js';
import type { Periodo } from '../../metrics/periods.js';
import { getPool, type Queryable } from '../pool.js';

// Consultas de leitura usadas pelo dashboard. NUMERIC chega como string do pg e é convertido aqui.

const totaisSql = `
  coalesce(sum(impressions), 0)::float8      AS impressoes,
  coalesce(sum(clicks), 0)::float8           AS cliques,
  coalesce(sum(cost), 0)::float8             AS investimento,
  coalesce(sum(conversions), 0)::float8      AS conversoes,
  coalesce(sum(conversions_value), 0)::float8 AS "valorConversao"`;

export async function totais(accountId: number, p: Periodo, db: Queryable = getPool()): Promise<Totais> {
  const res = await db.query<Totais>(
    `SELECT ${totaisSql} FROM campaign_daily_metrics WHERE ad_account_id = $1 AND data BETWEEN $2 AND $3`,
    [accountId, p.inicio, p.fim],
  );
  return res.rows[0]!;
}

export async function serieDiaria(
  accountId: number,
  p: Periodo,
  db: Queryable = getPool(),
): Promise<Array<Totais & { data: string }>> {
  const res = await db.query<Totais & { data: string }>(
    `SELECT data, ${totaisSql} FROM campaign_daily_metrics
      WHERE ad_account_id = $1 AND data BETWEEN $2 AND $3
      GROUP BY data ORDER BY data`,
    [accountId, p.inicio, p.fim],
  );
  return res.rows;
}

export interface CampanhaTotais extends Totais {
  campaignId: number;
  nome: string;
  status: string;
  canal: string;
}

/** Totais por campanha, com o nome/status mais recente de cada uma. */
export async function porCampanha(accountId: number, p: Periodo, db: Queryable = getPool()): Promise<CampanhaTotais[]> {
  const res = await db.query<CampanhaTotais>(
    `WITH atual AS (
       SELECT DISTINCT ON (campaign_id) campaign_id, campaign_name, campaign_status, channel_type
         FROM campaign_daily_metrics WHERE ad_account_id = $1
        ORDER BY campaign_id, data DESC
     )
     SELECT m.campaign_id AS "campaignId", a.campaign_name AS nome, a.campaign_status AS status,
            a.channel_type AS canal, ${totaisSql}
       FROM campaign_daily_metrics m JOIN atual a USING (campaign_id)
      WHERE m.ad_account_id = $1 AND m.data BETWEEN $2 AND $3
      GROUP BY m.campaign_id, a.campaign_name, a.campaign_status, a.channel_type`,
    [accountId, p.inicio, p.fim],
  );
  return res.rows;
}

export interface AcaoConversaoTotais {
  nome: string;
  categoria: string;
  conversoes: number;
  valorConversao: number;
}

/**
 * Conversões por ação. Cada ação recebe o nome mais recente (renomeações não quebram o
 * histórico) e ações com o mesmo nome são somadas, que é como o cliente as enxerga.
 */
export async function porAcaoConversao(accountId: number, p: Periodo, db: Queryable = getPool()): Promise<AcaoConversaoTotais[]> {
  const res = await db.query<AcaoConversaoTotais>(
    `WITH nomes AS (
       SELECT DISTINCT ON (conversion_action_id) conversion_action_id, conversion_action_name, conversion_action_category
         FROM conversion_action_daily_metrics WHERE ad_account_id = $1
        ORDER BY conversion_action_id, data DESC
     )
     SELECT n.conversion_action_name AS nome, max(n.conversion_action_category) AS categoria,
            coalesce(sum(m.conversions), 0)::float8 AS conversoes,
            coalesce(sum(m.conversions_value), 0)::float8 AS "valorConversao"
       FROM conversion_action_daily_metrics m JOIN nomes n USING (conversion_action_id)
      WHERE m.ad_account_id = $1 AND m.data BETWEEN $2 AND $3
      GROUP BY n.conversion_action_name`,
    [accountId, p.inicio, p.fim],
  );
  return res.rows;
}

/** A conta registra valor de conversão em algum momento do histórico? Decide se ROAS aparece. */
export async function temValorConversao(accountId: number, db: Queryable = getPool()): Promise<boolean> {
  const res = await db.query<{ tem: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM campaign_daily_metrics WHERE ad_account_id = $1 AND conversions_value > 0) AS tem`,
    [accountId],
  );
  return res.rows[0]!.tem;
}
