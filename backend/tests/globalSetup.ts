import pg from 'pg';
import { runner } from 'node-pg-migrate';
import { TEST_DATABASE_URL } from './testEnv.js';

/** Recria o schema do banco de teste do zero e aplica todas as migrations. */
export default async function setup() {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.end();

  await runner({
    databaseUrl: TEST_DATABASE_URL,
    dir: 'migrations',
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => {},
  });
}
