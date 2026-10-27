import { OAuth2Client } from 'google-auth-library';
import { GoogleAdsApiError } from './errors.js';

/**
 * Gera access tokens a partir do refresh token. O google-auth-library mantém o
 * token em cache e só renova quando está perto de expirar.
 */
export function createAccessTokenProvider(opts: { clientId: string; clientSecret: string; refreshToken: string }) {
  const client = new OAuth2Client({ clientId: opts.clientId, clientSecret: opts.clientSecret });
  client.setCredentials({ refresh_token: opts.refreshToken });

  return async function getAccessToken(): Promise<string> {
    try {
      const { token } = await client.getAccessToken();
      if (!token) throw new Error('resposta sem access token');
      return token;
    } catch (err) {
      // O erro original do gaxios carrega a configuração da requisição (com o refresh token).
      // Repassa só o código OAuth, ex.: invalid_grant.
      const data = (err as { response?: { data?: { error?: string; error_description?: string }; status?: number } })
        .response;
      const oauthError = data?.data?.error;
      const httpStatus = data?.status;
      const transient = !oauthError && (httpStatus === undefined || httpStatus >= 500);
      throw new GoogleAdsApiError({
        message: oauthError
          ? `Falha ao renovar o access token OAuth: ${oauthError}${data?.data?.error_description ? ` (${data.data.error_description})` : ''}`
          : 'Falha ao renovar o access token OAuth',
        ...(httpStatus !== undefined && { httpStatus }),
        retryable: transient,
      });
    }
  };
}
