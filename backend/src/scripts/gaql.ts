import { parseArgs } from 'node:util';
import { getGoogleAdsClient } from '../googleAds/client.js';
import { runCli } from './cli.js';

// Executa uma consulta GAQL avulsa (somente SELECT) para validação.
//   npm run gaql -- --customer-id=1234567890 "SELECT customer.id FROM customer"
const { values, positionals } = parseArgs({ options: { 'customer-id': { type: 'string' } }, allowPositionals: true });

await runCli(async () => {
  const customerId = values['customer-id']?.replace(/-/g, '');
  const query = positionals.join(' ');
  if (!customerId || !query) throw new Error('Uso: npm run gaql -- --customer-id=XXXXXXXXXX "SELECT ..."');
  const rows = await getGoogleAdsClient().searchStream(customerId, query);
  console.log(JSON.stringify(rows.slice(0, 20), null, 2));
  console.log(`${rows.length} linhas`);
});
