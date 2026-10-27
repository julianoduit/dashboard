import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, qs } from './client';
import type { Campaigns, Conta, ConversionActions, Daily, Periodo, Summary } from './types';

function metricQuery<T>(name: string, accountId: number | undefined, p: Periodo | undefined) {
  return {
    queryKey: [name, accountId, p?.inicio, p?.fim],
    queryFn: () => api<T>(`/accounts/${accountId}/${name}${qs({ inicio: p!.inicio, fim: p!.fim })}`),
    enabled: accountId !== undefined && p !== undefined,
    // Ao trocar de período, mantém o gráfico anterior (esmaecido) até chegar o novo.
    placeholderData: keepPreviousData,
  };
}

export const useMinhasContas = () => useQuery({ queryKey: ['accounts'], queryFn: () => api<Conta[]>('/accounts') });

export const useSummary = (id?: number, p?: Periodo) => useQuery(metricQuery<Summary>('summary', id, p));
export const useDaily = (id?: number, p?: Periodo) => useQuery(metricQuery<Daily>('daily', id, p));
export const useConversionActions = (id?: number, p?: Periodo) =>
  useQuery(metricQuery<ConversionActions>('conversion-actions', id, p));
export const useCampaigns = (id?: number, p?: Periodo) => useQuery(metricQuery<Campaigns>('campaigns', id, p));
