import { addDays, daysBetweenInclusive, type IsoDate } from '../lib/dates.js';

export interface Periodo {
  inicio: IsoDate;
  fim: IsoDate;
}

/** Período de mesmo tamanho imediatamente anterior (mesma regra do painel do Google Ads). */
export function periodoAnterior(p: Periodo): Periodo {
  const dias = daysBetweenInclusive(p.inicio, p.fim);
  const fim = addDays(p.inicio, -1);
  return { inicio: addDays(fim, -(dias - 1)), fim };
}

/** Lista de datas do período, para preencher dias sem dados na série diária. */
export function diasDoPeriodo(p: Periodo): IsoDate[] {
  const dias: IsoDate[] = [];
  for (let d = p.inicio; d <= p.fim; d = addDays(d, 1)) dias.push(d);
  return dias;
}
