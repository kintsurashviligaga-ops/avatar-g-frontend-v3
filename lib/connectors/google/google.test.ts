/** @jest-environment node */
/**
 * Google Drive connector (Phase 4, scope drive.file): sealed tokens, signed state, PKCE, the OAuth calls, and the
 * provider's reads — all offline, with an injected fetch.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../admin/guard', () => ({ isAdminUser: (u: { email?: string }) => u.email === 'admin@x.ge' }));

import { randomBytes } from 'node:crypto';
import { connectorKeys, decryptToken, encryptToken, pkceChallenge, pkcePair, signState, STATE_TTL_MS, verifyState } from './crypto';
import { authorizationUrl, DRIVE_SCOPE, driveOAuthConfig, emailFromIdToken, exchangeCode, refreshAccessToken, revokeToken } from './oauth';
import { capText, driveAccessToken, driveProvider, readDriveFile, type DriveDeps } from './drive';
import type { ConnectorAccountRow, ConnectorAccountStore } from './store';
import { driveAccess, driveOpenTo } from './access';
import { connectorRegistry, connectorStates } from '../registry';
import { RESEARCH_FILE_MAX_CHARS } from '@/lib/research/context';

const KEY = randomBytes(32).toString('base64');
const env = { CONNECTOR_TOKEN_KEY: KEY, GOOGLE_OAUTH_CLIENT_ID: 'cid', GOOGLE_OAUTH_CLIENT_SECRET: 'sec', GOOGLE_PICKER_API_KEY: 'pk', GOOGLE_CLOUD_PROJECT_NUMBER: '467145118875' } as unknown as NodeJS.ProcessEnv;
const keys = connectorKeys(env)!;
const cfg = driveOAuthConfig(env)!;
const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';

const res = (status: number, body: unknown, text?: string) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => text ?? JSON.stringify(body), arrayBuffer: async () => Buffer.from(text ?? '') }) as unknown as Response;

function memStore(rows: ConnectorAccountRow[] = []): ConnectorAccountStore & { rows: ConnectorAccountRow[] } {
  return {
    rows,
    async get(u) { return rows.find((r) => r.userId === u) ?? null; },
    async put(r) { const i = rows.findIndex((x) => x.userId === r.userId); if (i >= 0) rows[i] = r; else rows.push(r); return true; },
    async remove(u) { const i = rows.findIndex((x) => x.userId === u); if (i >= 0) rows.splice(i, 1); return true; },
  };
}

describe('keys', () => {
  test('missing or wrong-length key = no keys (fail closed)', () => {
    expect(connectorKeys({} as NodeJS.ProcessEnv)).toBeNull();
    expect(connectorKeys({ CONNECTOR_TOKEN_KEY: randomBytes(16).toString('base64') } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(driveOAuthConfig({ ...env, GOOGLE_OAUTH_CLIENT_SECRET: '' } as NodeJS.ProcessEnv)).toBeNull();
    expect(driveOAuthConfig({ ...env, CONNECTOR_TOKEN_KEY: '' } as NodeJS.ProcessEnv)).toBeNull();
  });
});

describe('sealed refresh token', () => {
  test('round-trips for the same user only; tampering fails', () => {
    const s = encryptToken('1//refresh', U1, keys);
    expect(s.startsWith('v1.')).toBe(true);
    expect(s).not.toContain('refresh');
    expect(decryptToken(s, U1, keys)).toBe('1//refresh');
    expect(decryptToken(s, U2, keys)).toBeNull();
    const parts = s.split('.');
    parts[3] = Buffer.from('x' + Buffer.from(parts[3]!, 'base64url').toString('latin1')).toString('base64url');
    expect(decryptToken(parts.join('.'), U1, keys)).toBeNull();
    expect(decryptToken('garbage', U1, keys)).toBeNull();
    expect(decryptToken(s, U1, connectorKeys({ CONNECTOR_TOKEN_KEY: randomBytes(32).toString('base64') } as unknown as NodeJS.ProcessEnv)!)).toBeNull();
  });
  test('two seals of one token differ (random IV)', () => {
    expect(encryptToken('t', U1, keys)).not.toBe(encryptToken('t', U1, keys));
  });
});

describe('state + PKCE', () => {
  test('valid for its user until it expires', () => {
    const now = 1_000_000;
    const st = signState(U1, keys, now);
    expect(verifyState(st, U1, keys, now + 1000)).toEqual({ ok: true });
    expect(verifyState(st, U2, keys, now)).toEqual({ ok: false, reason: 'other_user' });
    expect(verifyState(st, U1, keys, now + STATE_TTL_MS + 1)).toEqual({ ok: false, reason: 'expired' });
    expect(verifyState(st.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), U1, keys, now)).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyState('a.b.c', U1, keys, now)).toEqual({ ok: false, reason: 'invalid' });
  });
  test('S256 challenge (RFC 7636 test vector)', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    const p = pkcePair();
    expect(p.verifier).toHaveLength(43);
    expect(pkceChallenge(p.verifier)).toBe(p.challenge);
  });
});

describe('OAuth calls', () => {
  test('authorization URL asks for drive.file only, offline, PKCE S256', () => {
    const u = new URL(authorizationUrl(cfg, { redirectUri: 'https://myavatar.ge/api/connectors/google_drive/callback', state: 's', challenge: 'c' }));
    expect(u.searchParams.get('scope')).toBe(`openid email ${DRIVE_SCOPE}`);
    expect(u.searchParams.get('scope')).not.toContain('drive.readonly');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('client_id')).toBe('cid');
  });

  test('code exchange: refresh token + email; missing scope or refresh token refused', async () => {
    const idt = `x.${Buffer.from(JSON.stringify({ email: 'gg@x.ge' })).toString('base64url')}.y`;
    const f = jest.fn(async () => res(200, { access_token: 'at', refresh_token: 'rt', scope: `openid ${DRIVE_SCOPE}`, id_token: idt }));
    const ok = await exchangeCode(cfg, { code: 'c', verifier: 'v', redirectUri: 'r' }, f as unknown as typeof fetch);
    expect(ok).toEqual({ ok: true, refreshToken: 'rt', accessToken: 'at', scope: `openid ${DRIVE_SCOPE}`, email: 'gg@x.ge' });
    const sent = new URLSearchParams(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent.get('code_verifier')).toBe('v');
    expect(sent.get('client_secret')).toBe('sec');
    expect(await exchangeCode(cfg, { code: 'c', verifier: 'v', redirectUri: 'r' }, (async () => res(200, { access_token: 'a', refresh_token: 'r', scope: 'openid' })) as unknown as typeof fetch)).toEqual({ ok: false, reason: 'scope_missing' });
    expect(await exchangeCode(cfg, { code: 'c', verifier: 'v', redirectUri: 'r' }, (async () => res(200, { access_token: 'a', scope: DRIVE_SCOPE })) as unknown as typeof fetch)).toEqual({ ok: false, reason: 'no_refresh_token' });
    expect(await exchangeCode(cfg, { code: 'c', verifier: 'v', redirectUri: 'r' }, (async () => res(400, { error: 'invalid_grant' })) as unknown as typeof fetch)).toEqual({ ok: false, reason: 'denied' });
    expect(await exchangeCode(cfg, { code: 'c', verifier: 'v', redirectUri: 'r' }, (async () => { throw new Error('net'); }) as unknown as typeof fetch)).toEqual({ ok: false, reason: 'failed' });
  });

  test('refresh: invalid_grant = revoked; revoke tolerates an already-dead token', async () => {
    expect(await refreshAccessToken(cfg, 'rt', (async () => res(200, { access_token: 'at', expires_in: 3599 })) as unknown as typeof fetch)).toEqual({ ok: true, accessToken: 'at', expiresIn: 3599 });
    expect(await refreshAccessToken(cfg, 'rt', (async () => res(400, { error: 'invalid_grant' })) as unknown as typeof fetch)).toEqual({ ok: false, reason: 'revoked' });
    expect(await refreshAccessToken(cfg, 'rt', (async () => res(500, {})) as unknown as typeof fetch)).toEqual({ ok: false, reason: 'failed' });
    expect(await revokeToken('t', (async () => res(400, {})) as unknown as typeof fetch)).toBe(true);
    expect(await revokeToken('t', (async () => { throw new Error('x'); }) as unknown as typeof fetch)).toBe(false);
  });

  test('id_token without email', () => {
    expect(emailFromIdToken('nope')).toBeNull();
    expect(emailFromIdToken(undefined)).toBeNull();
  });
});

describe('Drive provider', () => {
  const linked = () => memStore([{ userId: U1, sealedRefreshToken: encryptToken('rt', U1, keys), scope: DRIVE_SCOPE, email: 'gg@x.ge' }]);

  test('status: soon without config, unavailable without table, connectable when ready', () => {
    expect(driveProvider({ cfg: null, store: null, tableReady: false }).status()).toBe('soon');
    expect(driveProvider({ cfg, store: memStore(), tableReady: false }).status()).toBe('unavailable');
    expect(driveProvider({ cfg, store: memStore(), tableReady: true }).status()).toBe('connectable');
  });

  test('not linked → not_connected; a revoked grant deletes the row', async () => {
    expect(await driveAccessToken({ cfg, store: memStore(), tableReady: true }, U1)).toEqual({ ok: false, reason: 'not_connected' });
    const store = linked();
    const deps: DriveDeps = { cfg, store, tableReady: true, fetch: (async () => res(400, { error: 'invalid_grant' })) as unknown as typeof fetch };
    expect(await driveAccessToken(deps, U1)).toEqual({ ok: false, reason: 'not_connected' });
    expect(store.rows).toHaveLength(0);
  });

  test('lists only supported types with safe ids', async () => {
    const f = jest.fn(async (url: string) => (String(url).includes('oauth2') ? res(200, { access_token: 'at' }) : res(200, { files: [
      { id: 'doc_1234567890', name: 'Plan', mimeType: 'application/vnd.google-apps.document' },
      { id: 'img_1234567890', name: 'Pic', mimeType: 'image/png' },
      { id: 'bad id!', name: 'X', mimeType: 'application/pdf' },
    ] })));
    const r = await driveProvider({ cfg, store: linked(), tableReady: true, fetch: f as unknown as typeof fetch }).listFiles(U1);
    expect(r.ok && r.files.map((x) => x.id)).toEqual(['doc_1234567890']);
    const listUrl = String((f.mock.calls[1] as unknown as [string])[0]);
    expect(listUrl).toContain('trashed+%3D+false');
    expect((f.mock.calls[1] as unknown as [string, RequestInit])[1].headers).toEqual({ Authorization: 'Bearer at' });
  });

  test('reads a Google Doc by export, a PDF by download + extractor, caps text', async () => {
    const f = jest.fn(async (url: string) => {
      if (url.includes('/export')) return res(200, null, 'Hello\r\n\r\n\r\nDoc');
      if (url.endsWith('alt=media')) return res(200, null, '%PDF-bytes');
      if (url.includes('doc_1234567890')) return res(200, { id: 'doc_1234567890', name: 'Plan', mimeType: 'application/vnd.google-apps.document' });
      return res(200, { id: 'pdf_1234567890', name: 'R.pdf', mimeType: 'application/pdf', size: '20' });
    });
    expect(await readDriveFile('at', 'doc_1234567890', { fetch: f as unknown as typeof fetch })).toEqual({ ok: true, name: 'Plan', text: 'Hello\n\nDoc' });
    const extract = jest.fn(async () => 'pdf text');
    expect(await readDriveFile('at', 'pdf_1234567890', { fetch: f as unknown as typeof fetch, extract })).toEqual({ ok: true, name: 'R.pdf', text: 'pdf text' });
    expect(extract).toHaveBeenCalledWith(expect.any(Buffer), 'application/pdf');
    expect(await readDriveFile('at', '../etc', { fetch: f as unknown as typeof fetch })).toEqual({ ok: false, reason: 'not_found' });
    const capped = capText('x'.repeat(RESEARCH_FILE_MAX_CHARS + 10));
    expect(capped.truncated).toBe(true);
    expect(capped.text.length).toBe(RESEARCH_FILE_MAX_CHARS);
  });

  test('a file the app was not given (403/404) is not_found; an oversize download is refused', async () => {
    expect(await readDriveFile('at', 'zzz_1234567890', { fetch: (async () => res(404, {})) as unknown as typeof fetch })).toEqual({ ok: false, reason: 'not_found' });
    const big = (async () => res(200, { id: 'pdf_1234567890', name: 'B.pdf', mimeType: 'application/pdf', size: String(20 * 1024 * 1024) })) as unknown as typeof fetch;
    expect(await readDriveFile('at', 'pdf_1234567890', { fetch: big })).toEqual({ ok: false, reason: 'failed' });
  });

  test('registry: Drive is soon without deps; connectable + linked per user with them', async () => {
    const base = { localFiles: null, filesTableReady: false };
    const plain = await connectorStates(U1, connectorRegistry(base));
    expect(plain.find((s) => s.id === 'google_drive')).toEqual({ id: 'google_drive', label: 'Google Drive', status: 'soon' });
    const wired = connectorRegistry({ ...base, drive: { cfg, store: linked(), tableReady: true } });
    expect((await connectorStates(U1, wired)).find((s) => s.id === 'google_drive')).toMatchObject({ status: 'connectable', linked: true });
    expect((await connectorStates(U2, wired)).find((s) => s.id === 'google_drive')).toMatchObject({ status: 'connectable', linked: false });
  });
});

describe('CONNECTORS_DRIVE flag', () => {
  test('admin / all / off', () => {
    const e = (v: string) => ({ CONNECTORS_DRIVE: v }) as unknown as NodeJS.ProcessEnv;
    expect(driveAccess(e('admin'))).toBe('admin');
    expect(driveAccess(e('1'))).toBe('all');
    expect(driveAccess(e(''))).toBe('off');
    const admin = { email: 'admin@x.ge' } as never;
    const user = { email: 'u@x.ge' } as never;
    expect(driveOpenTo(admin, e('admin'))).toBe(true);
    expect(driveOpenTo(user, e('admin'))).toBe(false);
    expect(driveOpenTo(user, e('all'))).toBe(true);
    expect(driveOpenTo(null, e('all'))).toBe(false);
  });
});
