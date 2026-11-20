/**
 * lib/connectors/oauth/types.ts — a connector that links with OAuth and keeps ONE long-lived access token (Notion,
 * GitHub). The token is sealed with CONNECTOR_TOKEN_KEY (AES-256-GCM, the user id as associated data) in
 * connector_accounts; the plain token lives only in memory for the one request that uses it. Disconnect revokes it at
 * the provider and deletes the row. Google Drive keeps its own refresh-token flow (lib/connectors/google).
 */
import type { ConnectorKeys } from '@/lib/connectors/google/crypto';
import type { ConnectorAccountProvider, ConnectorAccountStore } from '@/lib/connectors/google/store';

export interface TokenConnectorConfig {
  clientId: string;
  clientSecret: string;
  keys: ConnectorKeys;
  /** Space-separated scopes the authorize URL asks for (GitHub); Notion has none (access is per page, chosen by the user). */
  scope: string;
}

export interface TokenConnectorDeps {
  cfg: TokenConnectorConfig | null;
  store: ConnectorAccountStore | null;
  tableReady: boolean;
}

export type TokenExchange =
  | { ok: true; accessToken: string; scope: string; account: string | null }
  | { ok: false; reason: 'denied' | 'scope_missing' | 'failed' };

/** What a provider adds to the shared connect → callback → disconnect routes (lib/connectors/oauth/routes). */
export interface TokenConnectorSpec {
  id: Extract<ConnectorAccountProvider, 'notion' | 'github'>;
  /** The flag that opens it (CONNECTORS_NOTION / CONNECTORS_GITHUB). */
  flag: string;
  /** HMAC domain of the OAuth state: never shared with another connector's flow. */
  stateDomain: string;
  config(env?: NodeJS.ProcessEnv): TokenConnectorConfig | null;
  authorizeUrl(cfg: TokenConnectorConfig, o: { redirectUri: string; state: string; challenge: string }): string;
  exchange(cfg: TokenConnectorConfig, o: { code: string; verifier: string; redirectUri: string }, f?: typeof fetch): Promise<TokenExchange>;
  revoke(cfg: TokenConnectorConfig, token: string, f?: typeof fetch): Promise<boolean>;
}

/** What an API call through a linked token answers: never throws, never returns the token. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'not_connected' | 'not_found' | 'forbidden' | 'rate_limited' | 'bad_input' | 'failed' };
