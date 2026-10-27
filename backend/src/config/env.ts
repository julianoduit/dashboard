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
  // Operações/dia que o dashboard pode gastar na Google Ads API. O projeto do Google Cloud é
  // dividido com o KiipitADS (Explorer = 2.880/dia; KiipitADS usa até 2.450 por execução).
  SYNC_DAILY_OPS_BUDGET: z.coerce.number().int().min(10).default(350),
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

const integracaoSchema = z
  .object({
    // Token da API interna usada pelo KiipitADS. Vazio = API interna e login único desligados.
    INTERNAL_API_TOKEN: z.string().min(32, 'mínimo de 32 caracteres').optional().or(z.literal('').transform(() => undefined)),
    // Endereço público do dashboard (para montar o link de login único).
    PUBLIC_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
    // Endereço do KiipitADS (link "voltar" no admin).
    KIIPITADS_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
    // Login de admin por senha. Padrão: desligado quando o login único do KiipitADS está configurado.
    ADMIN_PASSWORD_LOGIN: z.enum(['true', 'false']).optional().or(z.literal('').transform(() => undefined)),
  })
  .refine((v) => !v.INTERNAL_API_TOKEN || v.PUBLIC_URL, { message: 'PUBLIC_URL é obrigatório com INTERNAL_API_TOKEN', path: ['PUBLIC_URL'] });

export type IntegracaoEnv = z.infer<typeof integracaoSchema> & { adminPasswordLogin: boolean };

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
let integracaoCache: IntegracaoEnv | undefined;
let googleAdsCache: GoogleAdsEnv | undefined;

export function env(): BaseEnv {
  baseCache ??= parse(baseSchema, 'geral');
  return baseCache;
}

export function authEnv(): AuthEnv {
  authCache ??= parse(authSchema, 'autenticação');
  return authCache;
}

export function integracaoEnv(): IntegracaoEnv {
  if (!integracaoCache) {
    const v = parse(integracaoSchema, 'integração KiipitADS');
    const adminPasswordLogin = v.ADMIN_PASSWORD_LOGIN ? v.ADMIN_PASSWORD_LOGIN === 'true' : !v.INTERNAL_API_TOKEN;
    integracaoCache = { ...v, adminPasswordLogin };
  }
  return integracaoCache;
}

/** Só para testes: força nova leitura das variáveis. */
export function resetEnvCache(): void {
  baseCache = undefined;
  authCache = undefined;
  integracaoCache = undefined;
  googleAdsCache = undefined;
}

export function googleAdsEnv(): GoogleAdsEnv {
  googleAdsCache ??= parse(googleAdsSchema, 'Google Ads');
  return googleAdsCache;
}

export { customerId as customerIdSchema };
