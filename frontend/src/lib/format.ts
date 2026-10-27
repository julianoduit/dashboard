/** Formatação pt-BR. Valores ausentes (null) aparecem como travessão curto "–". */

const cache = new Map<string, Intl.NumberFormat>();
function nf(key: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('pt-BR', opts);
    cache.set(key, f);
  }
  return f;
}

export const VAZIO = '–';

export function moeda(v: number | null | undefined, currency = 'BRL'): string {
  if (v === null || v === undefined) return VAZIO;
  return nf(`m-${currency}`, { style: 'currency', currency }).format(v);
}

/** Moeda compacta para eixos: R$ 1,2 mil. */
export function moedaCompacta(v: number, currency = 'BRL'): string {
  return nf(`mc-${currency}`, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

export function numero(v: number | null | undefined, casas = 0): string {
  if (v === null || v === undefined) return VAZIO;
  return nf(`n-${casas}`, { maximumFractionDigits: casas }).format(v);
}

/** Conversões podem ser fracionadas (atribuição data-driven): 1 casa só quando houver fração. */
export function conversoes(v: number | null | undefined): string {
  if (v === null || v === undefined) return VAZIO;
  return numero(v, Math.abs(v - Math.round(v)) < 0.05 ? 0 : 1);
}

export function numeroCompacto(v: number): string {
  return nf('nc', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

export function percentual(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined) return VAZIO;
  return nf(`p-${casas}`, { style: 'percent', minimumFractionDigits: casas, maximumFractionDigits: casas }).format(v);
}

export function roas(v: number | null | undefined): string {
  if (v === null || v === undefined) return VAZIO;
  return `${nf('roas', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}x`;
}

const [y0, m0, d0] = [0, 1, 2];
function parts(iso: string): [number, number, number] {
  const p = iso.split('-').map(Number);
  return [p[y0]!, p[m0]!, p[d0]!];
}

/** 2026-10-27 -> 27/10 */
export function diaMes(iso: string): string {
  const [, m, d] = parts(iso);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/** 2026-10-27 -> 27/10/2026 */
export function dataCurta(iso: string): string {
  const [y, m, d] = parts(iso);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

/** 2026-10-27 -> ter., 27 de out. */
export function dataExtenso(iso: string): string {
  const [y, m, d] = parts(iso);
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** Timestamp -> "27/10/2026 às 14:51" no fuso informado. */
export function dataHora(ts: string | null | undefined, timeZone = 'America/Sao_Paulo'): string {
  if (!ts) return VAZIO;
  const d = new Date(ts);
  const data = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone }).format(d);
  const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone }).format(d);
  return `${data} às ${hora}`;
}

/** 3552962784 -> 355-296-2784 (formato do painel do Google Ads). */
export function customerId(id: string): string {
  return id.length === 10 ? `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}` : id;
}

/** Tempo relativo curto: "há 5 min", "há 3 h", "há 2 dias". */
export function tempoRelativo(ts: string | null | undefined, now = Date.now()): string {
  if (!ts) return VAZIO;
  const s = Math.max(0, Math.round((now - new Date(ts).getTime()) / 1000));
  if (s < 60) return 'agora há pouco';
  const min = Math.round(s / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

/** Duração entre dois timestamps: "8 s", "2 min 5 s". */
export function duracao(inicio: string, fim: string | null): string {
  if (!fim) return VAZIO;
  const s = Math.max(0, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 1000));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${s % 60} s`;
}
