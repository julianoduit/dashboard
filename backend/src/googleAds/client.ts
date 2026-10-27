import { googleAdsEnv } from '../config/env.js';
import { logger } from '../logger.js';
import { createAccessTokenProvider } from './auth.js';
import { errorFromResponse, GoogleAdsApiError, networkError } from './errors.js';
import { defaultRetryOptions, withRetry, type RetryOptions } from './retry.js';

export interface GoogleAdsClientOptions {
  developerToken: string;
  loginCustomerId: string;
  apiVersion: string;
  getAccessToken: () => Promise<string>;
  fetch?: typeof fetch;
  retry?: RetryOptions;
  /** Tempo máximo de uma chamada antes de abortar (e re-tentar). */
  timeoutMs?: number;
}

const BASE_URL = 'https://googleads.googleapis.com';

/**
 * Cliente mínimo da Google Ads API via REST. Expõe apenas searchStream:
 * o sistema é somente leitura e nunca chama endpoints de mutate.
 */
export class GoogleAdsClient {
  private readonly fetchImpl: typeof fetch;
  private readonly retry: RetryOptions;
  private readonly timeoutMs: number;

  constructor(private readonly opts: GoogleAdsClientOptions) {
    this.fetchImpl = opts.fetch ?? fetch;
    this.retry = opts.retry ?? defaultRetryOptions;
    this.timeoutMs = opts.timeoutMs ?? 120_000;
  }

  /**
   * @param onAttempt chamado a cada requisição HTTP (incluindo novas tentativas): cada uma conta
   *   na cota diária de operações da Google Ads API.
   */
  async searchStream<T = Record<string, unknown>>(customerId: string, query: string, onAttempt?: () => void): Promise<T[]> {
    const cid = customerId.replace(/-/g, '');
    if (!/^\d{10}$/.test(cid)) throw new Error(`customer_id inválido: ${customerId}`);
    if (!/^\s*SELECT\s/i.test(query)) throw new Error('Somente consultas GAQL SELECT são permitidas');

    const url = `${BASE_URL}/${this.opts.apiVersion}/customers/${cid}/googleAds:searchStream`;

    return withRetry(
      async () => {
        const accessToken = await this.opts.getAccessToken();
        onAttempt?.();
        let res: Response;
        try {
          res = await this.fetchImpl(url, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${accessToken}`,
              'developer-token': this.opts.developerToken,
              'login-customer-id': this.opts.loginCustomerId,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ query }),
            signal: AbortSignal.timeout(this.timeoutMs),
          });
        } catch (err) {
          throw networkError(err);
        }

        const text = await res.text();
        let body: unknown;
        try {
          body = text ? JSON.parse(text) : [];
        } catch {
          throw new GoogleAdsApiError({
            message: `Resposta inválida da Google Ads API (HTTP ${res.status})`,
            httpStatus: res.status,
            retryable: res.status >= 500,
          });
        }

        if (!res.ok) throw errorFromResponse(res.status, body, res.headers.get('request-id'));

        // searchStream responde um array de lotes { results: [...] }. Um erro no meio do stream
        // chega como um lote com { error }, mesmo com HTTP 200.
        const batches = Array.isArray(body) ? body : [body];
        if (batches.some((b) => b && typeof b === 'object' && 'error' in b)) {
          throw errorFromResponse(res.status, batches, res.headers.get('request-id'));
        }
        return batches.flatMap((b) => ((b as { results?: T[] }).results ?? []) as T[]);
      },
      {
        ...this.retry,
        onRetry: ({ attempt, delayMs, error }) => {
          logger.warn(
            {
              customerId: cid,
              attempt,
              delayMs,
              error: error instanceof GoogleAdsApiError ? error.toSafeString() : String(error),
            },
            'Google Ads API: erro transitório, nova tentativa',
          );
        },
      },
    );
  }
}

let defaultClient: GoogleAdsClient | undefined;

/** Cliente configurado a partir das variáveis de ambiente. */
export function getGoogleAdsClient(): GoogleAdsClient {
  if (!defaultClient) {
    const e = googleAdsEnv();
    defaultClient = new GoogleAdsClient({
      developerToken: e.GOOGLE_ADS_DEVELOPER_TOKEN,
      loginCustomerId: e.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
      apiVersion: e.GOOGLE_ADS_API_VERSION,
      getAccessToken: createAccessTokenProvider({
        clientId: e.GOOGLE_ADS_CLIENT_ID,
        clientSecret: e.GOOGLE_ADS_CLIENT_SECRET,
        refreshToken: e.GOOGLE_ADS_REFRESH_TOKEN,
      }),
    });
  }
  return defaultClient;
}
