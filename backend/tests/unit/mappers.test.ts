import { describe, expect, it } from 'vitest';
import {
  conversionActionIdFromResource,
  isSelectableClient,
  mapCampaignRow,
  mapMccClientRow,
  microsToDecimal,
} from '../../src/googleAds/mappers.js';

describe('microsToDecimal', () => {
  it.each([
    ['0', '0'],
    ['1', '0.000001'],
    ['1000000', '1'],
    ['1234567', '1.234567'],
    ['150000000', '150'],
    ['98765432101234', '98765432.101234'],
    [undefined, '0'],
  ])('%s -> %s', (input, expected) => {
    expect(microsToDecimal(input)).toBe(expected);
  });
});

describe('mappers', () => {
  it('extrai o id da conversion action do resource name', () => {
    expect(conversionActionIdFromResource('customers/1234567890/conversionActions/987654')).toBe('987654');
    expect(() => conversionActionIdFromResource('lixo')).toThrow();
  });

  it('linha de campanha sem métricas (campos omitidos no JSON) vira zeros', () => {
    const r = mapCampaignRow({ segments: { date: '2026-10-01' }, campaign: { id: '5', name: 'X', status: 'PAUSED', advertisingChannelType: 'SEARCH' } });
    expect(r).toMatchObject({ impressions: '0', clicks: '0', cost: '0', conversions: '0', conversionsValue: '0' });
  });

  it('ignora contas manager e canceladas/encerradas na lista da MCC', () => {
    const base = { id: '1234567890', currencyCode: 'BRL', timeZone: 'America/Sao_Paulo' };
    const mk = (status: string, manager = false) => mapMccClientRow({ customerClient: { ...base, status, manager } });
    expect(isSelectableClient(mk('ENABLED'))).toBe(true);
    expect(isSelectableClient(mk('SUSPENDED'))).toBe(true);
    expect(isSelectableClient(mk('ENABLED', true))).toBe(false);
    expect(isSelectableClient(mk('CANCELED'))).toBe(false);
    expect(isSelectableClient(mk('CLOSED'))).toBe(false);
  });
});
