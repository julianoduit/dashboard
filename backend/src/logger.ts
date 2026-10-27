import { pino } from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  // Defesa em profundidade: mesmo que algum objeto com credenciais chegue ao log, os campos saem mascarados.
  redact: {
    paths: [
      'authorization',
      '*.authorization',
      'headers.authorization',
      '*.headers.authorization',
      'headers["developer-token"]',
      '*.headers["developer-token"]',
      'developerToken',
      '*.developerToken',
      'refreshToken',
      '*.refreshToken',
      'refresh_token',
      '*.refresh_token',
      'access_token',
      '*.access_token',
      'clientSecret',
      '*.clientSecret',
      'client_secret',
      '*.client_secret',
      'senha',
      '*.senha',
      'password',
      '*.password',
    ],
    censor: '[redacted]',
  },
});
