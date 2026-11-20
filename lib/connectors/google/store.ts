/**
 * lib/connectors/google/store.ts — the connector_accounts table (migration 20261101a): one row per user and provider,
 * written by service_role only. It stores the refresh token SEALED (crypto.ts encryptToken); this file never sees a key.
 */
export interface ConnectorAccountRow {
  userId: string;
  sealedRefreshToken: string;
  scope: string;
  email: string | null;
}

export interface ConnectorAccountStore {
  get(userId: string): Promise<ConnectorAccountRow | null>;
  put(row: ConnectorAccountRow): Promise<boolean>;
  remove(userId: string): Promise<boolean>;
}

const TABLE = 'connector_accounts';
/** The providers a row may carry. Only google_drive is allowed by the APPLIED migration; notion and github need 20261120a. */
export type ConnectorAccountProvider = 'google_drive' | 'notion' | 'github';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

/**
 * One provider's rows. Drive calls it without the second argument, exactly as before. For Notion and GitHub the sealed
 * value in `enc_refresh_token` is their long-lived access token (those providers issue no refresh token by default).
 */
export function createConnectorAccountStore(sb: Sb, PROVIDER: ConnectorAccountProvider = 'google_drive'): ConnectorAccountStore {
  return {
    async get(userId) {
      const { data, error } = await sb.from(TABLE).select('enc_refresh_token, scope, account_email').eq('user_id', userId).eq('provider', PROVIDER).maybeSingle();
      if (error) throw new Error(`${TABLE} get: ${error.message}`);
      if (!data) return null;
      return { userId, sealedRefreshToken: String(data.enc_refresh_token), scope: String(data.scope ?? ''), email: data.account_email ?? null };
    },
    async put(row) {
      const { error } = await sb.from(TABLE).upsert(
        { user_id: row.userId, provider: PROVIDER, enc_refresh_token: row.sealedRefreshToken, scope: row.scope, account_email: row.email, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,provider' },
      );
      return !error;
    },
    async remove(userId) {
      const { error } = await sb.from(TABLE).delete().eq('user_id', userId).eq('provider', PROVIDER);
      return !error;
    },
  };
}
