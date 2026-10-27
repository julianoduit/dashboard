import { describe, expect, it } from 'vitest';
import { addMonths, daysBetweenInclusive, isIsoDate, splitByMonth, todayInTimeZone } from '../../src/lib/dates.js';
import { alvoHistorico, janelaRecente, proximoBlocoHistorico } from '../../src/sync/syncAccount.js';

describe('datas', () => {
  it('hoje respeita o fuso da conta', () => {
    const now = new Date('2026-10-27T02:00:00Z'); // 23:00 do dia 26 em São Paulo
    expect(todayInTimeZone('America/Sao_Paulo', now)).toBe('2026-10-26');
    expect(todayInTimeZone('Europe/Lisbon', now)).toBe('2026-10-27');
  });

  it('addMonths limita ao último dia do mês', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-10-26', -13)).toBe('2025-09-26');
  });

  it('splitByMonth cobre o intervalo sem buracos', () => {
    expect(splitByMonth('2026-01-15', '2026-03-10')).toEqual([
      { inicio: '2026-01-15', fim: '2026-01-31' },
      { inicio: '2026-02-01', fim: '2026-02-28' },
      { inicio: '2026-03-01', fim: '2026-03-10' },
    ]);
  });

  it('valida datas ISO', () => {
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(daysBetweenInclusive('2026-10-01', '2026-10-30')).toBe(30);
  });
});

describe('janela e carga histórica', () => {
  const now = new Date('2026-10-27T12:00:00Z');
  it('janela diária: 30 dias terminando ontem, no fuso da conta', () => {
    expect(janelaRecente('America/Sao_Paulo', now, 30)).toEqual({ inicio: '2026-09-27', fim: '2026-10-26' });
  });
  it('alvo do histórico: 13 meses terminando ontem', () => {
    expect(alvoHistorico('2026-10-26', 13)).toBe('2025-09-27');
  });
  it('próximo bloco é o mês anterior, sem passar do alvo', () => {
    expect(proximoBlocoHistorico('2026-09-27', '2025-09-27')).toEqual({ inicio: '2026-09-01', fim: '2026-09-26' });
    expect(proximoBlocoHistorico('2026-09-01', '2025-09-27')).toEqual({ inicio: '2026-08-01', fim: '2026-08-31' });
    expect(proximoBlocoHistorico('2025-10-01', '2025-09-27')).toEqual({ inicio: '2025-09-27', fim: '2025-09-30' });
    expect(proximoBlocoHistorico('2025-09-27', '2025-09-27')).toBeNull();
  });
});
