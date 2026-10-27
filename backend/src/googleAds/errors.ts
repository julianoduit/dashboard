import type { RetryableError } from './retry.js';

/** Status gRPC que indicam falha transitória do lado do Google. */
const TRANSIENT_STATUSES = new Set(['UNAVAILABLE', 'INTERNAL', 'DEADLINE_EXCEEDED', 'ABORTED', 'RESOURCE_EXHAUSTED']);
const TRANSIENT_HTTP = new Set([429, 500, 502, 503, 504]);
/** Códigos de erro do Google Ads (campo errorCode) que valem nova tentativa. */
const TRANSIENT_ERROR_CODES = new Set([
  'quotaError:RESOURCE_EXHAUSTED',
  'quotaError:RESOURCE_TEMPORARILY_EXHAUSTED',
  'internalError:INTERNAL_ERROR',
  'internalError:TRANSIENT_ERROR',
  'internalError:DEADLINE_EXCEEDED',
]);

export class GoogleAdsApiError extends Error implements RetryableError {
  readonly httpStatus: number | undefined;
  readonly status: string | undefined;
  readonly errorCodes: string[];
  readonly requestId: string | undefined;
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;

  constructor(init: {
    message: string;
    httpStatus?: number;
    status?: string;
    errorCodes?: string[];
    requestId?: string;
    retryable: boolean;
    retryAfterMs?: number;
  }) {
    super(init.message);
    this.name = 'GoogleAdsApiError';
    this.httpStatus = init.httpStatus;
    this.status = init.status;
    this.errorCodes = init.errorCodes ?? [];
    this.requestId = init.requestId;
    this.retryable = init.retryable;
    this.retryAfterMs = init.retryAfterMs;
  }

  /** Representação segura para log e para gravar em sync_runs.erro. */
  toSafeString(): string {
    const parts = [this.message];
    if (this.errorCodes.length) parts.push(`códigos: ${this.errorCodes.join(', ')}`);
    if (this.httpStatus) parts.push(`HTTP ${this.httpStatus}`);
    if (this.requestId) parts.push(`request-id: ${this.requestId}`);
    return parts.join(' | ');
  }
}

interface GoogleAdsFailureDetail {
  '@type'?: string;
  errors?: Array<{
    errorCode?: Record<string, string>;
    message?: string;
    details?: { quotaErrorDetails?: { retryDelay?: string } };
  }>;
  requestId?: string;
  retryDelay?: string;
}

interface GoogleErrorBody {
  error?: { code?: number; message?: string; status?: string; details?: GoogleAdsFailureDetail[] };
}

/** "30s" / "1.5s" -> ms. */
export function parseDuration(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(value.trim());
  return m ? Math.round(Number(m[1]) * 1000) : undefined;
}

/** Converte a resposta de erro da API REST em GoogleAdsApiError, sem incluir nada da requisição. */
export function errorFromResponse(httpStatus: number, body: unknown, headerRequestId?: string | null): GoogleAdsApiError {
  // searchStream devolve erros como array de mensagens; search devolve um objeto.
  const first = (Array.isArray(body) ? body.find((b) => b && typeof b === 'object' && 'error' in b) : body) as
    | GoogleErrorBody
    | undefined;
  const error = first?.error;
  const details = error?.details ?? [];

  const errorCodes: string[] = [];
  const messages: string[] = [];
  let retryAfterMs: number | undefined;
  let requestId = headerRequestId ?? undefined;

  for (const detail of details) {
    if (detail.requestId) requestId = detail.requestId;
    retryAfterMs ??= parseDuration(detail.retryDelay);
    for (const e of detail.errors ?? []) {
      for (const [kind, code] of Object.entries(e.errorCode ?? {})) errorCodes.push(`${kind}:${code}`);
      if (e.message) messages.push(e.message);
      retryAfterMs ??= parseDuration(e.details?.quotaErrorDetails?.retryDelay);
    }
  }

  const status = error?.status;
  const retryable =
    TRANSIENT_HTTP.has(httpStatus) ||
    (status !== undefined && TRANSIENT_STATUSES.has(status)) ||
    errorCodes.some((c) => TRANSIENT_ERROR_CODES.has(c));

  const message = messages.length ? messages.join(' / ') : (error?.message ?? `Google Ads API respondeu HTTP ${httpStatus}`);

  return new GoogleAdsApiError({
    message,
    httpStatus,
    ...(status !== undefined && { status }),
    errorCodes,
    ...(requestId !== undefined && { requestId }),
    retryable,
    ...(retryAfterMs !== undefined && { retryAfterMs }),
  });
}

/** Falhas de rede (DNS, conexão recusada, reset, timeout) são transitórias. */
export function networkError(err: unknown): GoogleAdsApiError {
  const cause = err instanceof Error ? (err.cause instanceof Error ? err.cause.message : err.message) : String(err);
  return new GoogleAdsApiError({ message: `Falha de rede ao chamar a Google Ads API: ${cause}`, retryable: true });
}
