/** Chamadas ao backend. O cookie de sessão é httpOnly e vai automaticamente (mesmo origin). */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      ...rest,
      headers: { accept: 'application/json', ...(json !== undefined && { 'content-type': 'application/json' }), ...headers },
      ...(json !== undefined && { body: JSON.stringify(json) }),
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor. Verifique sua internet e tente de novo.');
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as { erro?: string };
  if (!res.ok) throw new ApiError(res.status, body.erro ?? 'Algo deu errado. Tente de novo em instantes.');
  return body as T;
}

export const qs = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
};
