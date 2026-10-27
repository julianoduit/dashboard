import type { CampaignDailyRow, ConversionActionDailyRow } from '../../src/googleAds/queries.js';
import type { SearchClient } from '../../src/sync/syncAccount.js';

/**
 * Simula a Google Ads API: devolve as linhas cujo segments.date cai no BETWEEN da consulta,
 * como a API real faria.
 */
export class FakeGoogleAds implements SearchClient {
  campaignRows: CampaignDailyRow[] = [];
  conversionRows: ConversionActionDailyRow[] = [];
  failFor = new Set<string>();
  queries: Array<{ customerId: string; query: string }> = [];

  async searchStream<T>(customerId: string, query: string): Promise<T[]> {
    this.queries.push({ customerId, query });
    if (this.failFor.has(customerId)) throw new Error(`falha simulada na conta ${customerId}`);
    const m = /BETWEEN '(\d{4}-\d{2}-\d{2})' AND '(\d{4}-\d{2}-\d{2})'/.exec(query);
    if (!m) throw new Error('consulta sem período');
    const [, inicio, fim] = m as unknown as [string, string, string];
    const inRange = (d: string) => d >= inicio && d <= fim;
    const source = query.includes('segments.conversion_action') ? this.conversionRows : this.campaignRows;
    return source.filter((r) => inRange(r.segments.date)) as T[];
  }
}

export function campaignRow(
  date: string,
  campaignId: string,
  m: Partial<{ impressions: number; clicks: number; costMicros: number; conversions: number; value: number; name: string }> = {},
): CampaignDailyRow {
  return {
    segments: { date },
    campaign: { id: campaignId, name: m.name ?? `Campanha ${campaignId}`, status: 'ENABLED', advertisingChannelType: 'SEARCH' },
    metrics: {
      impressions: String(m.impressions ?? 100),
      clicks: String(m.clicks ?? 10),
      costMicros: String(m.costMicros ?? 5_000_000),
      conversions: m.conversions ?? 1,
      conversionsValue: m.value ?? 0,
    },
  };
}

export function conversionRow(
  date: string,
  campaignId: string,
  actionId: string,
  m: Partial<{ conversions: number; value: number; name: string; category: string }> = {},
): ConversionActionDailyRow {
  return {
    segments: {
      date,
      conversionAction: `customers/1234567890/conversionActions/${actionId}`,
      conversionActionName: m.name ?? `Ação ${actionId}`,
      conversionActionCategory: m.category ?? 'CONTACT',
    },
    campaign: { id: campaignId },
    metrics: { conversions: m.conversions ?? 1, conversionsValue: m.value ?? 0 },
  };
}
