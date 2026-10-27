/** Presets de período. As datas são calculadas no fuso da conta e terminam ontem (hoje ainda não sincronizou). */

export type PresetId = '7d' | '30d' | '90d' | 'mes' | 'mes-anterior' | 'custom';

export interface Periodo {
  inicio: string;
  fim: string;
}

export const PRESETS: Array<{ id: PresetId; rotulo: string }> = [
  { id: '7d', rotulo: 'Últimos 7 dias' },
  { id: '30d', rotulo: 'Últimos 30 dias' },
  { id: '90d', rotulo: 'Últimos 90 dias' },
  { id: 'mes', rotulo: 'Este mês' },
  { id: 'mes-anterior', rotulo: 'Mês anterior' },
  { id: 'custom', rotulo: 'Personalizado' },
];

export function hojeNoFuso(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function toUtc(d: string): Date {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, day));
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function addDias(d: string, n: number): string {
  const x = toUtc(d);
  x.setUTCDate(x.getUTCDate() + n);
  return iso(x);
}

export function diasEntre(inicio: string, fim: string): number {
  return Math.round((toUtc(fim).getTime() - toUtc(inicio).getTime()) / 86_400_000) + 1;
}

export function isIsoDate(v: string | null | undefined): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return iso(toUtc(v)) === v;
}

export function periodoDoPreset(id: Exclude<PresetId, 'custom'>, timeZone: string, now = new Date()): Periodo {
  const hoje = hojeNoFuso(timeZone, now);
  const ontem = addDias(hoje, -1);
  const [y, m] = hoje.split('-').map(Number) as [number, number];
  switch (id) {
    case '7d':
      return { inicio: addDias(ontem, -6), fim: ontem };
    case '30d':
      return { inicio: addDias(ontem, -29), fim: ontem };
    case '90d':
      return { inicio: addDias(ontem, -89), fim: ontem };
    case 'mes': {
      const inicio = iso(new Date(Date.UTC(y, m - 1, 1)));
      // No dia 1 ainda não há dia fechado no mês: mostra o próprio dia 1.
      return { inicio, fim: ontem < inicio ? inicio : ontem };
    }
    case 'mes-anterior':
      return { inicio: iso(new Date(Date.UTC(y, m - 2, 1))), fim: iso(new Date(Date.UTC(y, m - 1, 0))) };
  }
}

/** Texto curto do período de comparação, ex.: "vs. 30 dias anteriores". */
export function rotuloComparacao(p: Periodo): string {
  const dias = diasEntre(p.inicio, p.fim);
  return dias === 1 ? 'vs. dia anterior' : `vs. ${dias} dias anteriores`;
}
