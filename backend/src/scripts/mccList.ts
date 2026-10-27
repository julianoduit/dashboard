import { getGoogleAdsClient } from '../googleAds/client.js';
import { refreshMccAccounts } from '../sync/mcc.js';
import { runCli } from './cli.js';

await runCli(async () => {
  const contas = await refreshMccAccounts(getGoogleAdsClient());
  console.table(contas.map((c) => ({ customer_id: c.customerId, nome: c.nome, moeda: c.moeda, fuso: c.fuso, status: c.status })));
  console.log(`${contas.length} contas gravadas/atualizadas em ad_accounts.`);
});
