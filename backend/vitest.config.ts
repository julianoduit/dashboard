import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL } from './tests/testEnv.js';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/globalSetup.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: TEST_DATABASE_URL,
      GOOGLE_ADS_DEVELOPER_TOKEN: 'test-dev-token',
      GOOGLE_ADS_CLIENT_ID: 'test-client-id',
      GOOGLE_ADS_CLIENT_SECRET: 'test-client-secret',
      GOOGLE_ADS_REFRESH_TOKEN: 'test-refresh-token',
      GOOGLE_ADS_LOGIN_CUSTOMER_ID: '1112223333',
      JWT_SECRET: 'test-secret-test-secret-test-secret-123',
      SYNC_SCHEDULER_ENABLED: 'false',
    },
    // Os testes de integração compartilham o mesmo banco de teste.
    fileParallelism: false,
  },
});
