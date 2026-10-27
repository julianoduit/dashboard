import { describe, expect, it } from 'vitest';
import { periodoDoPreset, rotuloComparacao } from '../periods';
import { conversoes, dataHora, moeda, percentual, roas } from '../format';

// 27/10/2026 09:00 em São Paulo.
const now = new Date('2026-10-27T12:00:00Z');
const tz = 'America/Sao_Paulo';

describe('presets de período', () => {
  it('terminam ontem, no fuso da conta', () => {
    expect(periodoDoPreset('7d', tz, now)).toEqual({ inicio: '2026-10-20', fim: '2026-10-26' });
    expect(periodoDoPreset('30d', tz, now)).toEqual({ inicio: '2026-09-27', fim: '2026-10-26' });
    expect(periodoDoPreset('90d', tz, now)).toEqual({ inicio: '2026-07-29', fim: '2026-10-26' });
    expect(periodoDoPreset('mes', tz, now)).toEqual({ inicio: '2026-10-01', fim: '2026-10-26' });
    expect(periodoDoPreset('mes-anterior', tz, now)).toEqual({ inicio: '2026-09-01', fim: '2026-09-30' });
  });

  it('mês anterior em janeiro volta para dezembro do ano anterior', () => {
    expect(periodoDoPreset('mes-anterior', tz, new Date('2027-01-10T12:00:00Z'))).toEqual({ inicio: '2026-12-01', fim: '2026-12-31' });
  });

  it('"este mês" no dia 1 não gera período invertido', () => {
    const p = periodoDoPreset('mes', tz, new Date('2026-11-01T12:00:00Z'));
    expect(p.inicio <= p.fim).toBe(true);
  });

  it('rótulo de comparação', () => {
    expect(rotuloComparacao({ inicio: '2026-10-20', fim: '2026-10-26' })).toBe('vs. 7 dias anteriores');
  });
});

describe('formatação pt-BR', () => {
  it('moeda, percentual, ROAS e conversões', () => {
    expect(moeda(1499.04)).toBe('R$ 1.499,04');
    expect(moeda(null)).toBe('–');
    expect(percentual(0.4346)).toBe('43,5%');
    expect(roas(3.391)).toBe('3,39x');
    expect(conversoes(415)).toBe('415');
    expect(conversoes(12.5)).toBe('12,5');
    expect(conversoes(3.0000001)).toBe('3');
  });
  it('data e hora no fuso da conta', () => {
    expect(dataHora('2026-10-27T17:51:24Z', tz)).toBe('27/10/2026 às 14:51');
  });
});
