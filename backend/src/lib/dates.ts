/** Datas de calendário como strings 'YYYY-MM-DD', sem horário nem fuso embutido. */

export type IsoDate = string;

/** Data de hoje no fuso informado (ex.: fuso da conta no Google Ads). */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): IsoDate {
  // en-CA formata como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function toUtc(d: IsoDate): Date {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, day));
}

function fromUtc(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: IsoDate, days: number): IsoDate {
  const date = toUtc(d);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
}

/** Soma meses mantendo o dia, limitado ao último dia do mês de destino. */
export function addMonths(d: IsoDate, months: number): IsoDate {
  const date = toUtc(d);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return fromUtc(date);
}

/** Número de dias do intervalo, inclusivo nas duas pontas. */
export function daysBetweenInclusive(inicio: IsoDate, fim: IsoDate): number {
  return Math.round((toUtc(fim).getTime() - toUtc(inicio).getTime()) / 86_400_000) + 1;
}

export function isIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return fromUtc(toUtc(v)) === v;
}

/** Quebra [inicio, fim] em blocos por mês de calendário. */
export function splitByMonth(inicio: IsoDate, fim: IsoDate): Array<{ inicio: IsoDate; fim: IsoDate }> {
  const chunks: Array<{ inicio: IsoDate; fim: IsoDate }> = [];
  let cursor = inicio;
  while (cursor <= fim) {
    const c = toUtc(cursor);
    const endOfMonth = fromUtc(new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 0)));
    const chunkEnd = endOfMonth < fim ? endOfMonth : fim;
    chunks.push({ inicio: cursor, fim: chunkEnd });
    cursor = addDays(chunkEnd, 1);
  }
  return chunks;
}
