/** Totais somados no período. Métricas derivadas são sempre calculadas a partir deles. */
export interface Totais {
  impressoes: number;
  cliques: number;
  investimento: number;
  conversoes: number;
  valorConversao: number;
}

export interface Kpis extends Totais {
  ctr: number | null;
  cpcMedio: number | null;
  custoPorConversao: number | null;
  taxaConversao: number | null;
  roas: number | null;
}

export const totaisZerados: Totais = { impressoes: 0, cliques: 0, investimento: 0, conversoes: 0, valorConversao: 0 };

/** Divisão que devolve null quando não há denominador (ex.: CPC sem cliques). */
export function safeDiv(numerador: number, denominador: number): number | null {
  if (!Number.isFinite(numerador) || !Number.isFinite(denominador) || denominador === 0) return null;
  return numerador / denominador;
}

/**
 * Calcula as métricas derivadas sobre os totais do período (nunca média de médias).
 * ROAS só é calculado quando a conta registra valor de conversão.
 */
export function derive(t: Totais, opts: { temValorConversao: boolean }): Kpis {
  return {
    ...t,
    ctr: safeDiv(t.cliques, t.impressoes),
    cpcMedio: safeDiv(t.investimento, t.cliques),
    custoPorConversao: safeDiv(t.investimento, t.conversoes),
    taxaConversao: safeDiv(t.conversoes, t.cliques),
    roas: opts.temValorConversao ? safeDiv(t.valorConversao, t.investimento) : null,
  };
}

/** Variação relativa (0.25 = +25%). null quando não há base de comparação. */
export function variacao(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null) return null;
  if (anterior === 0) return atual === 0 ? 0 : null;
  return (atual - anterior) / anterior;
}

export function variacoes(atual: Kpis, anterior: Kpis): Record<keyof Kpis, number | null> {
  const keys = Object.keys(atual) as Array<keyof Kpis>;
  return Object.fromEntries(keys.map((k) => [k, variacao(atual[k], anterior[k])])) as Record<keyof Kpis, number | null>;
}
