import { z } from 'zod';

const customerId = z
  .string()
  .transform((v) => v.replace(/-/g, '').trim())
  .pipe(z.string().regex(/^\d{10}$/, 'deve ter 10 dígitos'));

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  SYNC_CRON: z.string().default('0 5 * * *'),
  SYNC_TZ: z.string().default('America/Sao_Paulo'),
  SYNC_WINDOW_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  SYNC_BACKFILL_MONTHS: z.coerce.number().int().min(1).max(36).default(13),
  SYNC_SCHEDULER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

const googleAdsSchema = z.object({
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().min(1),
  GOOGLE_ADS_CLIENT_ID: z.string().min(1),
  GOOGLE_ADS_CLIENT_SECRET: z.string().min(1),
  GOOGLE_ADS_REFRESH_TOKEN: z.string().min(1),
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: customerId,
  GOOGLE_ADS_API_VERSION: z.string().regex(/^v\d+$/).default('v26'),
});

const authSchema = z.object({
  // Assina os JWTs de sessão. Gere com: openssl rand -base64 48
  JWT_SECRET: z.string().min(32, 'mínimo de 32 caracteres'),
  SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  // Atrás do Caddy o IP real vem em X-Forwarded-For; 1 = confiar no primeiro proxy.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  // Padrão: cookie Secure em produção. Pode ser forçado para testes locais em http.
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
});

export type AuthEnv = z.infer<typeof authSchema>;
export type BaseEnv = z.infer<typeof baseSchema>;
export type GoogleAdsEnv = z.infer<typeof googleAdsSchema>;

function parse<T extends z.ZodType>(schema: T, name: string): z.infer<T> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    // Lista apenas os nomes das variáveis com problema, nunca os valores.
    const fields = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuração inválida (${name}): ${fields}`);
  }
  return result.data;
}

let baseCache: BaseEnv | undefined;
let authCache: AuthEnv | undefined;
let googleAdsCache: GoogleAdsEnv | undefined;

export function env(): BaseEnv {
  baseCache ??= parse(baseSchema, 'geral');
  return baseCache;
}

export function authEnv(): AuthEnv {
  authCache ??= parse(authSchema, 'autenticação');
  return authCache;
}

export function googleAdsEnv(): GoogleAdsEnv {
  googleAdsCache ??= parse(googleAdsSchema, 'Google Ads');
  return googleAdsCache;
}

export { customerId as customerIdSchema };
