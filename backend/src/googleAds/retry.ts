import { sleep as defaultSleep } from '../lib/sleep.js';

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

export const defaultRetryOptions: RetryOptions = {
  maxAttempts: 5,
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
};

/** Erro que sabe dizer se vale tentar de novo e, opcionalmente, quanto esperar. */
export interface RetryableError {
  retryable: boolean;
  retryAfterMs?: number;
}

function isRetryableError(err: unknown): err is Error & RetryableError {
  return typeof err === 'object' && err !== null && (err as RetryableError).retryable === true;
}

/**
 * Backoff exponencial com "full jitter". Quando a API informa o tempo de espera
 * (erros de cota), ele é respeitado como mínimo.
 */
export function computeDelay(attempt: number, opts: RetryOptions, retryAfterMs?: number): number {
  const random = opts.random ?? Math.random;
  const exp = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** (attempt - 1));
  const jittered = Math.round(exp / 2 + random() * (exp / 2));
  return Math.min(opts.maxDelayMs, Math.max(jittered, retryAfterMs ?? 0));
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = defaultRetryOptions): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (!isRetryableError(err) || attempt >= opts.maxAttempts) throw err;
      const delayMs = computeDelay(attempt, opts, err.retryAfterMs);
      opts.onRetry?.({ attempt, delayMs, error: err });
      await sleep(delayMs);
    }
  }
}
