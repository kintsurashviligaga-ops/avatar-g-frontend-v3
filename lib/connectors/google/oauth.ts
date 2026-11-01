/**
 * lib/connectors/google/oauth.ts — Google's OAuth 2.0 web flow for the Drive connector, scope `drive.file` only
 * (GG 2026-11-01: Agent G sees only the files the user picks). `fetch` is injected so every branch is tested offline.
 *
 * ⚠️ CLOSED UNLESS CONFIGURED: driveOAuthConfig() is null without GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and a
 * valid CONNECTOR_TOKEN_KEY, and then the connector stays 'soon'. No access token is ever stored: each request trades the
 * (encrypted) refresh token for a fresh one.
 */
import { connectorKeys, type ConnectorKeys } from './crypto';

export const DRIVE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/drive.file'] as const;
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export interface DriveOAuthConfig {
  clientId: string;
  clientSecret: string;
  keys: ConnectorKeys;
  /** Public browser key for the Google Picker (restricted to the Picker API and myavatar.ge). */
  pickerApiKey: string | null;
  /** The Cloud project number: the Picker's appId, which grants drive.file access to the picked files. */
  projectNumber: string | null;
}

export function driveOAuthConfig(env: NodeJS.ProcessEnv = process.env): DriveOAuthConfig | null {
  const clientId = (env.GOOGLE_OAUTH_CLIENT_ID ?? '').trim();
  const clientSecret = (env.GOOGLE_OAUTH_CLIENT_SECRET ?? '').trim();
  const keys = connectorKeys(env);
  if (!clientId || !clientSecret || !keys) return null;
  return {
    clientId,
    clientSecret,
    keys,
    pickerApiKey: (env.GOOGLE_PICKER_API_KEY ?? '').trim() || null,
    projectNumber: (env.GOOGLE_CLOUD_PROJECT_NUMBER ?? '').trim() || null,
  };
}

export function authorizationUrl(cfg: DriveOAuthConfig, o: { redirectUri: string; state: string; challenge: string; loginHint?: string }): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: o.redirectUri,
    response_type: 'code',
    scope: DRIVE_SCOPES.join(' '),
    state: o.state,
    code_challenge: o.challenge,
    code_challenge_method: 'S256',
    // offline + consent: Google returns a refresh token even on a second link.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
  });
  if (o.loginHint) q.set('login_hint', o.loginHint);
  return `${AUTH_URL}?${q.toString()}`;
}

type Fetch = typeof fetch;

export type ExchangeResult =
  | { ok: true; refreshToken: string; accessToken: string; scope: string; email: string | null }
  | { ok: false; reason: 'denied' | 'no_refresh_token' | 'scope_missing' | 'failed' };

/** Reads `email` from the id_token Google returns with the code (it came straight from Google over TLS). */
export function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null;
  const part = idToken.split('.')[1];
  if (!part) return null;
  try {
    const claims = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { email?: unknown };
    return typeof claims.email === 'string' ? claims.email.slice(0, 254) : null;
  } catch {
    return null;
  }
}

export async function exchangeCode(cfg: DriveOAuthConfig, o: { code: string; verifier: string; redirectUri: string }, f: Fetch = fetch): Promise<ExchangeResult> {
  let res: Response;
  try {
    res = await f(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: o.code,
        code_verifier: o.verifier,
        redirect_uri: o.redirectUri,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      }).toString(),
    });
  } catch {
    return { ok: false, reason: 'failed' };
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !body) return { ok: false, reason: body?.error === 'invalid_grant' ? 'denied' : 'failed' };
  const scope = typeof body.scope === 'string' ? body.scope : '';
  if (!scope.split(' ').includes(DRIVE_SCOPE)) return { ok: false, reason: 'scope_missing' };
  if (typeof body.refresh_token !== 'string' || !body.refresh_token) return { ok: false, reason: 'no_refresh_token' };
  if (typeof body.access_token !== 'string') return { ok: false, reason: 'failed' };
  return { ok: true, refreshToken: body.refresh_token, accessToken: body.access_token, scope, email: emailFromIdToken(body.id_token) };
}

export type RefreshResult =
  | { ok: true; accessToken: string; expiresIn: number }
  /** revoked: the user removed access at Google (invalid_grant). The stored row is dead and must be deleted. */
  | { ok: false; reason: 'revoked' | 'failed' };

export async function refreshAccessToken(cfg: DriveOAuthConfig, refreshToken: string, f: Fetch = fetch): Promise<RefreshResult> {
  let res: Response;
  try {
    res = await f(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      }).toString(),
    });
  } catch {
    return { ok: false, reason: 'failed' };
  }
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) return { ok: false, reason: body?.error === 'invalid_grant' ? 'revoked' : 'failed' };
  if (!body || typeof body.access_token !== 'string') return { ok: false, reason: 'failed' };
  return { ok: true, accessToken: body.access_token, expiresIn: typeof body.expires_in === 'number' ? body.expires_in : 3600 };
}

/** true when Google confirmed, or the token was already dead (400). Never throws. */
export async function revokeToken(token: string, f: Fetch = fetch): Promise<boolean> {
  try {
    const res = await f(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
    });
    return res.ok || res.status === 400;
  } catch {
    return false;
  }
}
