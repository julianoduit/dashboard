import { describe, expect, it } from 'vitest';
import { derive, safeDiv, totaisZerados, variacao, variacoes } from '../../src/metrics/derived.js';
import { diasDoPeriodo, periodoAnterior } from '../../src/metrics/periods.js';

describe('métricas derivadas', () => {
  const t = { impressoes: 1000, cliques: 50, investimento: 200, conversoes: 8, valorConversao: 1000 };

  it('calcula sobre os totais', () => {
    const k = derive(t, { temValorConversao: true });
    expect(k.ctr).toBeCloseTo(0.05);
    expect(k.cpcMedio).toBeCloseTo(4);
    expect(k.custoPorConversao).toBeCloseTo(25);
    expect(k.taxaConversao).toBeCloseTo(0.16);
    expect(k.roas).toBeCloseTo(5);
  });

  it('não é média de médias', () => {
    // Dia 1: 1 clique/10 impr (CTR 10%). Dia 2: 99 cliques/990 impr... soma dá 100/1000 = 10%,
    // mas com dias de pesos diferentes a média simples das taxas daria outro valor.
    const dia1 = { impressoes: 10, cliques: 5 }; // 50%
    const dia2 = { impressoes: 990, cliques: 45 }; // ~4,5%
    const total = derive({ ...totaisZerados, impressoes: dia1.impressoes + dia2.impressoes, cliques: dia1.cliques + dia2.cliques }, { temValorConversao: false });
    expect(total.ctr).toBeCloseTo(0.05);
  });

  it('divisão por zero vira null em todas as métricas', () => {
    const k = derive(totaisZerados, { temValorConversao: true });
    expect(k).toMatchObject({ ctr: null, cpcMedio: null, custoPorConversao: null, taxaConversao: null, roas: null });
  });

  it('gasto sem conversão: custo por conversão null, demais calculadas', () => {
    const k = derive({ ...t, conversoes: 0 }, { temValorConversao: false });
    expect(k.custoPorConversao).toBeNull();
    expect(k.cpcMedio).toBeCloseTo(4);
  });

  it('ROAS só aparece quando a conta tem valor de conversão', () => {
    expect(derive(t, { temValorConversao: false }).roas).toBeNull();
    expect(derive({ ...t, investimento: 0 }, { temValorConversao: true }).roas).toBeNull();
  });

  it('safeDiv trata NaN/Infinity', () => {
    expect(safeDiv(1, 0)).toBeNull();
    expect(safeDiv(Number.NaN, 1)).toBeNull();
    expect(safeDiv(1, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('variação %', () => {
  it.each([
    [150, 100, 0.5],
    [50, 100, -0.5],
    [0, 0, 0],
    [10, 0, null],
    [null, 10, null],
    [10, null, null],
  ])('%s vs %s = %s', (a, b, esperado) => {
    expect(variacao(a, b)).toBe(esperado);
  });

  it('variacoes cobre todas as chaves', () => {
    const a = derive({ ...totaisZerados, investimento: 10 }, { temValorConversao: false });
    const b = derive({ ...totaisZerados, investimento: 5 }, { temValorConversao: false });
    const v = variacoes(a, b);
    expect(v.investimento).toBe(1);
    expect(v.cpcMedio).toBeNull();
    expect(Object.keys(v).sort()).toEqual(Object.keys(a).sort());
  });
});

describe('período anterior', () => {
  it('mesmo tamanho imediatamente antes', () => {
    expect(periodoAnterior({ inicio: '2026-10-01', fim: '2026-10-31' })).toEqual({ inicio: '2026-08-31', fim: '2026-09-30' });
    expect(periodoAnterior({ inicio: '2026-10-20', fim: '2026-10-26' })).toEqual({ inicio: '2026-10-13', fim: '2026-10-19' });
    expect(periodoAnterior({ inicio: '2026-03-01', fim: '2026-03-01' })).toEqual({ inicio: '2026-02-28', fim: '2026-02-28' });
  });
  it('lista os dias do período', () => {
    expect(diasDoPeriodo({ inicio: '2026-02-27', fim: '2026-03-02' })).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  });
});
