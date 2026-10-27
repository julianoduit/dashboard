import { describe, expect, it, vi } from 'vitest';
import { GoogleAdsClient } from '../../src/googleAds/client.js';
import { GoogleAdsApiError } from '../../src/googleAds/errors.js';
import { computeDelay } from '../../src/googleAds/retry.js';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const quotaError = {
  error: {
    code: 429,
    status: 'RESOURCE_EXHAUSTED',
    message: 'quota',
    details: [
      {
        '@type': 'type.googleapis.com/google.ads.googleads.v26.errors.GoogleAdsFailure',
        errors: [{ errorCode: { quotaError: 'RESOURCE_EXHAUSTED' }, message: 'Too many requests', details: { quotaErrorDetails: { retryDelay: '3s' } } }],
        requestId: 'req-quota',
      },
    ],
  },
};

const queryError = [
  {
    error: {
      code: 400,
      status: 'INVALID_ARGUMENT',
      details: [
        {
          errors: [{ errorCode: { queryError: 'PROHIBITED_FIELD_COMBINATION_IN_SELECT_CLAUSE' }, message: 'campos incompatíveis' }],
          requestId: 'req-400',
        },
      ],
    },
  },
];

function makeClient(fetchMock: typeof fetch, sleeps: number[] = []) {
  return new GoogleAdsClient({
    developerToken: 'dev-token',
    loginCustomerId: '1112223333',
    apiVersion: 'v26',
    getAccessToken: async () => 'access-token',
    fetch: fetchMock,
    retry: { maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 10_000, random: () => 0.5, sleep: async (ms) => void sleeps.push(ms) },
  });
}

describe('GoogleAdsClient.searchStream', () => {
  it('envia login-customer-id da MCC, developer token e usa a versão configurada', async () => {
    const fetchMock = vi.fn(async () => json(200, [{ results: [{ a: 1 }] }, { results: [{ a: 2 }] }]));
    const rows = await makeClient(fetchMock as unknown as typeof fetch).searchStream('123-456-7890', 'SELECT campaign.id FROM campaign');

    expect(rows).toEqual([{ a: 1 }, { a: 2 }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://googleads.googleapis.com/v26/customers/1234567890/googleAds:searchStream');
    expect(init.headers).toMatchObject({
      'login-customer-id': '1112223333',
      'developer-token': 'dev-token',
      authorization: 'Bearer access-token',
    });
  });

  it('recusa qualquer coisa que não seja SELECT', async () => {
    const fetchMock = vi.fn();
    await expect(makeClient(fetchMock as unknown as typeof fetch).searchStream('1234567890', 'mutate campaigns')).rejects.toThrow(/SELECT/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('re-tenta erro de cota respeitando o retryDelay e depois funciona', async () => {
    const sleeps: number[] = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(429, quotaError))
      .mockResolvedValueOnce(json(503, { error: { code: 503, status: 'UNAVAILABLE', message: 'down' } }))
      .mockResolvedValueOnce(json(200, [{ results: [{ ok: true }] }]));

    const rows = await makeClient(fetchMock as unknown as typeof fetch, sleeps).searchStream('1234567890', 'SELECT x FROM y');
    expect(rows).toEqual([{ ok: true }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleeps[0]).toBe(3000); // retryDelay de 3s informado pela API
    expect(sleeps[1]).toBe(150); // 2ª tentativa: 200ms com jitter de 0.5 => 150ms
  });

  it('re-tenta falha de rede', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(json(200, []));
    await expect(makeClient(fetchMock as unknown as typeof fetch).searchStream('1234567890', 'SELECT x FROM y')).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('não re-tenta erro de consulta e expõe código e request-id', async () => {
    const fetchMock = vi.fn(async () => json(400, queryError));
    const err = await makeClient(fetchMock as unknown as typeof fetch)
      .searchStream('1234567890', 'SELECT x FROM y')
      .catch((e: unknown) => e);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(GoogleAdsApiError);
    const e = err as GoogleAdsApiError;
    expect(e.retryable).toBe(false);
    expect(e.errorCodes).toEqual(['queryError:PROHIBITED_FIELD_COMBINATION_IN_SELECT_CLAUSE']);
    expect(e.toSafeString()).toContain('req-400');
    expect(e.toSafeString()).not.toContain('dev-token');
    expect(e.toSafeString()).not.toContain('access-token');
  });

  it('erro no meio do stream (HTTP 200) também vira exceção', async () => {
    const fetchMock = vi.fn(async () => json(200, [{ results: [{ a: 1 }] }, ...queryError]));
    await expect(makeClient(fetchMock as unknown as typeof fetch).searchStream('1234567890', 'SELECT x FROM y')).rejects.toBeInstanceOf(
      GoogleAdsApiError,
    );
  });

  it('desiste depois do número máximo de tentativas', async () => {
    const fetchMock = vi.fn(async () => json(503, { error: { code: 503, status: 'UNAVAILABLE' } }));
    await expect(makeClient(fetchMock as unknown as typeof fetch).searchStream('1234567890', 'SELECT x FROM y')).rejects.toMatchObject({
      retryable: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe('computeDelay', () => {
  it('cresce exponencialmente e respeita o teto', () => {
    const o = { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 5000, random: () => 1 };
    expect([1, 2, 3, 4].map((a) => computeDelay(a, o))).toEqual([1000, 2000, 4000, 5000]);
  });
});
