/** Consultas GAQL usadas pelo sistema. Todas são SELECT: nenhuma operação de escrita. */

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(d: string): string {
  if (!isoDate.test(d)) throw new Error(`Data inválida para GAQL: ${d}`);
  return d;
}

/**
 * Sem filtro de nível: a MCC da Dúit tem sub-MCCs (até o nível 3) e `level <= 1` deixava de fora
 * as contas abaixo delas. Managers e contas canceladas são filtrados em isSelectableClient.
 */
export const mccClientsQuery = `
  SELECT
    customer_client.id,
    customer_client.descriptive_name,
    customer_client.currency_code,
    customer_client.time_zone,
    customer_client.manager,
    customer_client.status,
    customer_client.level
  FROM customer_client`;

export function campaignDailyQuery(inicio: string, fim: string): string {
  return `
  SELECT
    segments.date,
    campaign.id,
    campaign.name,
    campaign.status,
    campaign.advertising_channel_type,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros,
    metrics.conversions,
    metrics.conversions_value
  FROM campaign
  WHERE segments.date BETWEEN '${assertDate(inicio)}' AND '${assertDate(fim)}'`;
}

/**
 * Consulta separada: segmentos de ação de conversão não são compatíveis com
 * impressões, cliques e custo. segments.conversion_action traz o ID estável da ação.
 */
export function conversionActionDailyQuery(inicio: string, fim: string): string {
  return `
  SELECT
    segments.date,
    campaign.id,
    segments.conversion_action,
    segments.conversion_action_name,
    segments.conversion_action_category,
    metrics.conversions,
    metrics.conversions_value
  FROM campaign
  WHERE segments.date BETWEEN '${assertDate(inicio)}' AND '${assertDate(fim)}'`;
}

// Formato das linhas na resposta REST (JSON em camelCase; campos com valor padrão podem vir omitidos,
// e int64 vem como string).

export interface MccClientRow {
  customerClient: {
    id: string;
    descriptiveName?: string;
    currencyCode: string;
    timeZone: string;
    manager?: boolean;
    status: string;
    level?: string;
  };
}

export interface CampaignDailyRow {
  segments: { date: string };
  campaign: { id: string; name?: string; status?: string; advertisingChannelType?: string };
  metrics?: {
    impressions?: string;
    clicks?: string;
    costMicros?: string;
    conversions?: number;
    conversionsValue?: number;
  };
}

export interface ConversionActionDailyRow {
  segments: {
    date: string;
    conversionAction: string;
    conversionActionName?: string;
    conversionActionCategory?: string;
  };
  campaign: { id: string };
  metrics?: { conversions?: number; conversionsValue?: number };
}
