import * as accounts from '../db/repositories/accounts.js';
import { googleAdsEnv } from '../config/env.js';
import { isSelectableClient, mapMccClientRow, type MccClientRecord } from '../googleAds/mappers.js';
import { mccClientsQuery, type MccClientRow } from '../googleAds/queries.js';
import type { SearchClient } from './syncAccount.js';

/** Consulta as contas da MCC e grava em ad_accounts (novas entram com ativo=false). */
export async function refreshMccAccounts(client: SearchClient): Promise<MccClientRecord[]> {
  const rows = await client.searchStream<MccClientRow>(googleAdsEnv().GOOGLE_ADS_LOGIN_CUSTOMER_ID, mccClientsQuery);
  const selectable = rows.map(mapMccClientRow).filter(isSelectableClient);
  await accounts.upsertFromMcc(selectable);
  return selectable;
}
