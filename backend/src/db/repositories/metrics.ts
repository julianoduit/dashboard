import type { CampaignDailyRecord, ConversionActionDailyRecord } from '../../googleAds/mappers.js';
import type { Queryable } from '../pool.js';

const BATCH_SIZE = 5_000;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Upsert por (conta, campanha, data). O GROUP BY protege contra chaves repetidas no mesmo lote,
 * que o ON CONFLICT não aceita.
 */
export async function upsertCampaignDaily(
  db: Queryable,
  adAccountId: number,
  syncRunId: number,
  rows: CampaignDailyRecord[],
): Promise<number> {
  let total = 0;
  for (const batch of chunks(rows, BATCH_SIZE)) {
    const res = await db.query(
      `INSERT INTO campaign_daily_metrics AS t (
         ad_account_id, campaign_id, data, campaign_name, campaign_status, channel_type,
         impressions, clicks, cost, conversions, conversions_value, sync_run_id, atualizado_em)
       SELECT $1, campaign_id, data, max(campaign_name), max(campaign_status), max(channel_type),
              sum(impressions), sum(clicks), sum(cost), sum(conversions), sum(conversions_value), $2, now()
         FROM unnest($3::bigint[], $4::date[], $5::text[], $6::text[], $7::text[],
                     $8::bigint[], $9::bigint[], $10::numeric[], $11::numeric[], $12::numeric[])
           AS u(campaign_id, data, campaign_name, campaign_status, channel_type,
                impressions, clicks, cost, conversions, conversions_value)
        GROUP BY campaign_id, data
       ON CONFLICT (ad_account_id, campaign_id, data) DO UPDATE SET
         campaign_name = EXCLUDED.campaign_name,
         campaign_status = EXCLUDED.campaign_status,
         channel_type = EXCLUDED.channel_type,
         impressions = EXCLUDED.impressions,
         clicks = EXCLUDED.clicks,
         cost = EXCLUDED.cost,
         conversions = EXCLUDED.conversions,
         conversions_value = EXCLUDED.conversions_value,
         sync_run_id = EXCLUDED.sync_run_id,
         atualizado_em = EXCLUDED.atualizado_em`,
      [
        adAccountId,
        syncRunId,
        batch.map((r) => r.campaignId),
        batch.map((r) => r.data),
        batch.map((r) => r.campaignName),
        batch.map((r) => r.campaignStatus),
        batch.map((r) => r.channelType),
        batch.map((r) => r.impressions),
        batch.map((r) => r.clicks),
        batch.map((r) => r.cost),
        batch.map((r) => r.conversions),
        batch.map((r) => r.conversionsValue),
      ],
    );
    total += res.rowCount ?? 0;
  }
  return total;
}

export async function upsertConversionActionDaily(
  db: Queryable,
  adAccountId: number,
  syncRunId: number,
  rows: ConversionActionDailyRecord[],
): Promise<number> {
  let total = 0;
  for (const batch of chunks(rows, BATCH_SIZE)) {
    const res = await db.query(
      `INSERT INTO conversion_action_daily_metrics AS t (
         ad_account_id, campaign_id, data, conversion_action_id, conversion_action_name,
         conversion_action_category, conversions, conversions_value, sync_run_id, atualizado_em)
       SELECT $1, campaign_id, data, conversion_action_id, max(conversion_action_name),
              max(conversion_action_category), sum(conversions), sum(conversions_value), $2, now()
         FROM unnest($3::bigint[], $4::date[], $5::bigint[], $6::text[], $7::text[], $8::numeric[], $9::numeric[])
           AS u(campaign_id, data, conversion_action_id, conversion_action_name,
                conversion_action_category, conversions, conversions_value)
        GROUP BY campaign_id, data, conversion_action_id
       ON CONFLICT (ad_account_id, campaign_id, data, conversion_action_id) DO UPDATE SET
         conversion_action_name = EXCLUDED.conversion_action_name,
         conversion_action_category = EXCLUDED.conversion_action_category,
         conversions = EXCLUDED.conversions,
         conversions_value = EXCLUDED.conversions_value,
         sync_run_id = EXCLUDED.sync_run_id,
         atualizado_em = EXCLUDED.atualizado_em`,
      [
        adAccountId,
        syncRunId,
        batch.map((r) => r.campaignId),
        batch.map((r) => r.data),
        batch.map((r) => r.conversionActionId),
        batch.map((r) => r.conversionActionName),
        batch.map((r) => r.conversionActionCategory),
        batch.map((r) => r.conversions),
        batch.map((r) => r.conversionsValue),
      ],
    );
    total += res.rowCount ?? 0;
  }
  return total;
}

/**
 * Remove linhas do intervalo reprocessado que não vieram na execução atual. A API não devolve
 * linhas zeradas de ação de conversão, então sem isso uma conversão retirada pelo Google
 * continuaria contando no dashboard.
 */
export async function deleteStaleInRange(
  db: Queryable,
  adAccountId: number,
  syncRunId: number,
  inicio: string,
  fim: string,
): Promise<{ campanhas: number; acoes: number }> {
  const params = [adAccountId, syncRunId, inicio, fim];
  const where = `ad_account_id = $1 AND data BETWEEN $3 AND $4 AND sync_run_id IS DISTINCT FROM $2`;
  const c = await db.query(`DELETE FROM campaign_daily_metrics WHERE ${where}`, params);
  const a = await db.query(`DELETE FROM conversion_action_daily_metrics WHERE ${where}`, params);
  return { campanhas: c.rowCount ?? 0, acoes: a.rowCount ?? 0 };
}
