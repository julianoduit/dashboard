import type { CampaignDailyRow, ConversionActionDailyRow, MccClientRow } from './queries.js';

/** cost_micros (int64 em string) -> decimal exato em string, ex.: "1234567" -> "1.234567". */
export function microsToDecimal(micros: string | number | undefined): string {
  if (micros === undefined || micros === null || micros === '') return '0';
  const value = BigInt(micros);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const intPart = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${intPart}${frac ? `.${frac}` : ''}`;
}

/** double da API -> string aceita pelo NUMERIC do Postgres. */
function decimal(n: number | undefined): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '0';
  return n.toString();
}

/** customers/123/conversionActions/456 -> 456 */
export function conversionActionIdFromResource(resourceName: string): string {
  const m = /\/conversionActions\/(\d+)$/.exec(resourceName);
  if (!m?.[1]) throw new Error(`Resource name de conversion action inesperado: ${resourceName}`);
  return m[1];
}

export interface CampaignDailyRecord {
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
  channelType: string;
  data: string;
  impressions: string;
  clicks: string;
  cost: string;
  conversions: string;
  conversionsValue: string;
}

export interface ConversionActionDailyRecord {
  campaignId: string;
  data: string;
  conversionActionId: string;
  conversionActionName: string;
  conversionActionCategory: string;
  conversions: string;
  conversionsValue: string;
}

export interface MccClientRecord {
  customerId: string;
  nome: string;
  moeda: string;
  fuso: string;
  status: string;
  manager: boolean;
}

export function mapCampaignRow(row: CampaignDailyRow): CampaignDailyRecord {
  return {
    campaignId: row.campaign.id,
    campaignName: row.campaign.name ?? '',
    campaignStatus: row.campaign.status ?? 'UNKNOWN',
    channelType: row.campaign.advertisingChannelType ?? 'UNKNOWN',
    data: row.segments.date,
    impressions: row.metrics?.impressions ?? '0',
    clicks: row.metrics?.clicks ?? '0',
    cost: microsToDecimal(row.metrics?.costMicros),
    conversions: decimal(row.metrics?.conversions),
    conversionsValue: decimal(row.metrics?.conversionsValue),
  };
}

export function mapConversionActionRow(row: ConversionActionDailyRow): ConversionActionDailyRecord {
  return {
    campaignId: row.campaign.id,
    data: row.segments.date,
    conversionActionId: conversionActionIdFromResource(row.segments.conversionAction),
    conversionActionName: row.segments.conversionActionName ?? '',
    conversionActionCategory: row.segments.conversionActionCategory ?? 'UNKNOWN',
    conversions: decimal(row.metrics?.conversions),
    conversionsValue: decimal(row.metrics?.conversionsValue),
  };
}

export function mapMccClientRow(row: MccClientRow): MccClientRecord {
  const c = row.customerClient;
  return {
    customerId: c.id,
    nome: c.descriptiveName ?? `Conta ${c.id}`,
    moeda: c.currencyCode,
    fuso: c.timeZone,
    status: c.status,
    manager: c.manager ?? false,
  };
}

/** Contas que entram na lista do admin: não-manager e não canceladas/encerradas. */
export function isSelectableClient(c: MccClientRecord): boolean {
  return !c.manager && c.status !== 'CANCELED' && c.status !== 'CLOSED';
}
