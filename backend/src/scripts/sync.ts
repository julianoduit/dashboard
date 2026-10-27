import { parseArgs } from 'node:util';
import * as accounts from '../db/repositories/accounts.js';
import { getGoogleAdsClient } from '../googleAds/client.js';
import { refreshMccAccounts } from '../sync/mcc.js';
import { syncAccount } from '../sync/syncAccount.js';
import { syncAllActive } from '../sync/syncAll.js';
import { runCli } from './cli.js';

// Uso:
//   npm run sync -- --customer-id=1234567890   ativa a conta (se preciso) e sincroniza
//   npm run sync -- --all                      sincroniza todas as contas ativas
const { values } = parseArgs({ options: { 'customer-id': { type: 'string' }, all: { type: 'boolean' } } });

await runCli(async () => {
  const client = getGoogleAdsClient();

  if (values.all) {
    const results = await syncAllActive(client);
    console.table(
      results.map((r) => ({
        conta: r.accountId,
        etapa: r.etapa,
        status: r.result?.status ?? 'erro',
        linhas: r.result?.linhas ?? 0,
        operacoes: r.result?.operacoes ?? 0,
        nota: r.erro ?? r.result?.erro ?? r.result?.observacao ?? '',
      })),
    );
    return;
  }

  const customerId = values['customer-id']?.replace(/-/g, '');
  if (!customerId) throw new Error('Informe --customer-id=XXXXXXXXXX ou --all');

  let account = await accounts.findByCustomerId(customerId);
  if (!account) {
    console.log('Conta ainda não está em ad_accounts; atualizando lista da MCC...');
    await refreshMccAccounts(client);
    account = await accounts.findByCustomerId(customerId);
    if (!account) throw new Error(`A conta ${customerId} não aparece na MCC (ou é manager/cancelada).`);
  }
  if (!account.ativo) await accounts.setActive(account.id, true);

  const result = await syncAccount(account.id, { client, tipo: 'manual' });
  console.log(result);
  if (result.status === 'erro') process.exitCode = 1;
});
