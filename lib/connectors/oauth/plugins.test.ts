/** @jest-environment node */
/**
 * Notion + GitHub token connectors: closed unless fully configured; the OAuth exchange answers every branch honestly;
 * API clients map provider errors to reasons and never throw; the link routes enforce state, cookie and domain.
 */
jest.mock('../../admin/guard', () => ({ isAdminUser: (u: { admin?: boolean } | null) => !!u?.admin }));
import { randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { blockLine, notionConfig, notionCreatePage, notionReadPage, notionSearch, notionSpec, pageTitle, textToBlocks } from '@/lib/connectors/notion';
import { githubConfig, githubListIssues, githubReadFile, githubSpec, prepareIssueLink } from '@/lib/connectors/github';
import { connectorKeys, decryptToken, signState, verifyState } from '@/lib/connectors/google/crypto';
import type { ConnectorAccountRow } from '@/lib/connectors/google/store';
import { flagAccess } from './access';
import { handleCallback, handleConnect, handleDisconnect, type RouteEnv } from './routes';
import type { TokenConnectorDeps } from './types';

const KEY = randomBytes(32).toString('base64');
const NOTION_ID = '12345678-1234-1234-1234-123456789abc';
const GH_ID = 'Ov23liABCDEFGHIJKLMN';
const env = (o: Record<string, string>) => ({ CONNECTOR_TOKEN_KEY: KEY, ...o }) as unknown as NodeJS.ProcessEnv;
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  ({ ok: status >= 200 && status < 300, status, headers: new Headers(headers), json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) }) as unknown as Response;

describe('config: closed unless complete', () => {
  test('Notion needs a UUID client id, a secret and the token key', () => {
    expect(notionConfig(env({ NOTION_OAUTH_CLIENT_ID: NOTION_ID, NOTION_OAUTH_CLIENT_SECRET: 's' }))).not.toBeNull();
    expect(notionConfig(env({ NOTION_OAUTH_CLIENT_ID: 'Client ID', NOTION_OAUTH_CLIENT_SECRET: 's' }))).toBeNull();
    expect(notionConfig({ NOTION_OAUTH_CLIENT_ID: NOTION_ID, NOTION_OAUTH_CLIENT_SECRET: 's' } as never)).toBeNull();
  });
  test('GitHub: client id format, scope allowlist, read:user always included', () => {
    expect(githubConfig(env({ GITHUB_OAUTH_CLIENT_ID: GH_ID, GITHUB_OAUTH_CLIENT_SECRET: 's' }))?.scope).toBe('read:user');
    expect(githubConfig(env({ GITHUB_OAUTH_CLIENT_ID: GH_ID, GITHUB_OAUTH_CLIENT_SECRET: 's', GITHUB_CONNECTOR_SCOPE: 'repo' }))?.scope).toBe('read:user repo');
    expect(githubConfig(env({ GITHUB_OAUTH_CLIENT_ID: GH_ID, GITHUB_OAUTH_CLIENT_SECRET: 's', GITHUB_CONNECTOR_SCOPE: 'delete_repo' }))).toBeNull();
    expect(githubConfig(env({ GITHUB_OAUTH_CLIENT_ID: 'nope', GITHUB_OAUTH_CLIENT_SECRET: 's' }))).toBeNull();
  });
  test('flags: empty = off, admin/admins = admins, all = everyone', () => {
    expect(flagAccess('CONNECTORS_NOTION', {} as never)).toBe('off');
    expect(flagAccess('X', { X: 'admins' } as never)).toBe('admin');
    expect(flagAccess('X', { X: 'all' } as never)).toBe('all');
    expect(flagAccess('X', { X: 'yes please' } as never)).toBe('off');
  });
  test('a state signed for one connector never verifies for another (and Drive keeps its default)', () => {
    const keys = connectorKeys(env({}))!;
    const s = signState('u1', keys, Date.now(), notionSpec.stateDomain);
    expect(verifyState(s, 'u1', keys, Date.now(), notionSpec.stateDomain).ok).toBe(true);
    expect(verifyState(s, 'u1', keys, Date.now(), githubSpec.stateDomain).ok).toBe(false);
    expect(verifyState(s, 'u1', keys).ok).toBe(false);
    expect(verifyState(signState('u1', keys), 'u1', keys).ok).toBe(true);
  });
});

describe('exchange', () => {
  const ncfg = notionConfig(env({ NOTION_OAUTH_CLIENT_ID: NOTION_ID, NOTION_OAUTH_CLIENT_SECRET: 's' }))!;
  const gcfg = githubConfig(env({ GITHUB_OAUTH_CLIENT_ID: GH_ID, GITHUB_OAUTH_CLIENT_SECRET: 's' }))!;
  const o = { code: 'c', verifier: 'v', redirectUri: 'https://myavatar.ge/api/connectors/x/callback' };
  test('Notion: token + workspace name; invalid_grant = denied; network = failed', async () => {
    const f = jest.fn(async () => json(200, { access_token: 'ntn_x', workspace_name: 'GG space' }));
    await expect(notionSpec.exchange(ncfg, o, f as never)).resolves.toEqual({ ok: true, accessToken: 'ntn_x', scope: '', account: 'GG space' });
    expect((f.mock.calls[0] as unknown[])[1]).toMatchObject({ method: 'POST' });
    await expect(notionSpec.exchange(ncfg, o, (async () => json(400, { error: 'invalid_grant' })) as never)).resolves.toEqual({ ok: false, reason: 'denied' });
    await expect(notionSpec.exchange(ncfg, o, (async () => { throw new Error('net'); }) as never)).resolves.toEqual({ ok: false, reason: 'failed' });
  });
  test('GitHub: 200 with {error} is a failure; a token without read:user is scope_missing; login is read', async () => {
    await expect(githubSpec.exchange(gcfg, o, (async () => json(200, { error: 'bad_verification_code' })) as never)).resolves.toEqual({ ok: false, reason: 'denied' });
    await expect(githubSpec.exchange(gcfg, o, (async () => json(200, { access_token: 'gho_x', scope: '' })) as never)).resolves.toEqual({ ok: false, reason: 'scope_missing' });
    const f = jest.fn(async (url: string) => (url.endsWith('/user') ? json(200, { login: 'gg' }) : json(200, { access_token: 'gho_x', scope: 'read:user' })));
    await expect(githubSpec.exchange(gcfg, o, f as never)).resolves.toEqual({ ok: true, accessToken: 'gho_x', scope: 'read:user', account: 'gg' });
  });
  test('authorize URLs: GitHub sends PKCE S256 and the scope; Notion asks owner=user', () => {
    const g = new URL(githubSpec.authorizeUrl(gcfg, { redirectUri: o.redirectUri, state: 's', challenge: 'ch' }));
    expect(g.searchParams.get('code_challenge_method')).toBe('S256');
    expect(g.searchParams.get('scope')).toBe('read:user');
    const n = new URL(notionSpec.authorizeUrl(ncfg, { redirectUri: o.redirectUri, state: 's', challenge: 'ch' }));
    expect(n.searchParams.get('owner')).toBe('user');
  });
});

describe('API clients', () => {
  test('Notion search maps pages and errors', async () => {
    const page = { object: 'page', id: NOTION_ID, url: 'https://www.notion.so/x', last_edited_time: '2026-11-20T00:00:00Z', properties: { Name: { type: 'title', title: [{ plain_text: 'Plan' }] } } };
    await expect(notionSearch('t', 'plan', (async () => json(200, { results: [page, { object: 'database', id: 'd' }] })) as never)).resolves.toEqual({ ok: true, data: [{ id: NOTION_ID, title: 'Plan', url: 'https://www.notion.so/x', editedAt: '2026-11-20T00:00:00Z' }] });
    await expect(notionSearch('t', 'x', (async () => json(401, {})) as never)).resolves.toEqual({ ok: false, reason: 'not_connected' });
    await expect(notionSearch('t', 'x', (async () => json(429, {})) as never)).resolves.toEqual({ ok: false, reason: 'rate_limited' });
  });
  test('Notion read: blocks to text, paged, missing page = not_found', async () => {
    const f = jest.fn(async (url: string) => url.includes('/pages/')
      ? json(200, { url: 'https://www.notion.so/p', properties: { t: { type: 'title', title: [{ plain_text: 'Doc' }] } } })
      : json(200, { results: [{ type: 'heading_1', heading_1: { rich_text: [{ plain_text: 'Hi' }] } }, { type: 'to_do', to_do: { checked: true, rich_text: [{ plain_text: 'done' }] } }, { type: 'image', image: {} }], has_more: false }));
    await expect(notionReadPage('t', NOTION_ID, f as never)).resolves.toEqual({ ok: true, data: { title: 'Doc', text: '# Hi\n- [x] done', truncated: false, url: 'https://www.notion.so/p' } });
    await expect(notionReadPage('t', NOTION_ID, (async () => json(404, {})) as never)).resolves.toEqual({ ok: false, reason: 'not_found' });
    expect(blockLine({ type: 'unsupported' })).toBeNull();
    expect(pageTitle({})).toBe('Untitled');
  });
  test('Notion create: blocks capped at 2000 chars and 100 blocks; parent page; id + url back', async () => {
    const blocks = textToBlocks('# Title\n- item\n' + 'x'.repeat(4500));
    expect(blocks.map((b) => b.type)).toEqual(['heading_1', 'bulleted_list_item', 'paragraph', 'paragraph', 'paragraph']);
    expect(textToBlocks(Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n'))).toHaveLength(100);
    const f = jest.fn(async () => json(200, { id: 'new', url: 'https://www.notion.so/new' }));
    await expect(notionCreatePage('t', { parentId: NOTION_ID, title: 'T', text: 'body' }, f as never)).resolves.toEqual({ ok: true, data: { id: 'new', url: 'https://www.notion.so/new' } });
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, { body: string }])[1].body).parent).toEqual({ page_id: NOTION_ID });
  });
  test('GitHub: issues vs PRs, bad repo refused before any request, binary file refused, path traversal refused', async () => {
    const f = jest.fn(async () => json(200, [{ number: 1, title: 'Bug', state: 'open', user: { login: 'a' }, labels: [{ name: 'bug' }], html_url: 'u1' }, { number: 2, title: 'Fix', state: 'open', pull_request: {}, html_url: 'u2' }]));
    const r = await githubListIssues('t', { repo: 'o/r', kind: 'pr', state: 'open' }, f as never);
    expect(r.ok && r.data.map((x) => x.number)).toEqual([2]);
    const never = jest.fn();
    await expect(githubListIssues('t', { repo: 'o/r/../x', kind: 'all', state: 'open' }, never as never)).resolves.toEqual({ ok: false, reason: 'bad_input' });
    await expect(githubReadFile('t', { repo: 'o/r', path: '../../etc' }, never as never)).resolves.toEqual({ ok: false, reason: 'bad_input' });
    expect(never).not.toHaveBeenCalled();
    await expect(githubReadFile('t', { repo: 'o/r', path: 'a.bin' }, (async () => json(200, 'ab\0cd')) as never)).resolves.toEqual({ ok: false, reason: 'bad_input' });
    await expect(githubReadFile('t', { repo: 'o/r', path: 'README.md' }, (async () => json(200, '# hi')) as never)).resolves.toEqual({ ok: true, data: { path: 'README.md', text: '# hi', truncated: false } });
    await expect(githubReadFile('t', { repo: 'o/r', path: 'x' }, (async () => json(403, {}, { 'x-ratelimit-remaining': '0' })) as never)).resolves.toEqual({ ok: false, reason: 'rate_limited' });
  });
  test('the prepared issue is only a github.com link with the fields filled in', () => {
    const link = new URL(prepareIssueLink({ repo: 'o/r', title: 'T', body: 'B', labels: ['bug'] })!);
    expect(link.origin + link.pathname).toBe('https://github.com/o/r/issues/new');
    expect(link.searchParams.get('title')).toBe('T');
    expect(link.searchParams.get('labels')).toBe('bug');
    expect(prepareIssueLink({ repo: 'not a repo', title: 'T', body: '' })).toBeNull();
  });
});

describe('link routes', () => {
  const cfg = notionConfig(env({ NOTION_OAUTH_CLIENT_ID: NOTION_ID, NOTION_OAUTH_CLIENT_SECRET: 's' }))!;
  const user = { id: '00000000-0000-0000-0000-000000000001', email: 'u@x' } as never;
  let rows: Map<string, ConnectorAccountRow>;
  let putOk: boolean;
  const deps = (): TokenConnectorDeps => ({
    cfg, tableReady: true,
    store: { get: async (u) => rows.get(u) ?? null, put: async (r) => { if (putOk) rows.set(r.userId, r); return putOk; }, remove: async (u) => { rows.delete(u); return true; } },
  });
  const spec = { ...notionSpec, exchange: jest.fn(async () => ({ ok: true as const, accessToken: 'ntn_secret', scope: '', account: 'ws' })), revoke: jest.fn(async () => true) };
  const routeEnv = (over: Partial<RouteEnv> = {}): RouteEnv => ({ user: async () => user, deps: async () => deps(), limit: async () => null, ...over });
  beforeEach(() => { rows = new Map(); putOk = true; jest.clearAllMocks(); });
  const req = (url: string, cookie?: string) => new NextRequest(url, { headers: cookie ? { cookie } : {} });

  test('closed = 404; signed out = back with not_signed_in; table missing = unavailable', async () => {
    expect((await handleConnect(spec, routeEnv({ deps: async () => ({ cfg: null, store: null, tableReady: false }) }), req('https://m.ge/api/connectors/notion/connect'))).status).toBe(404);
    const out = await handleConnect(spec, routeEnv({ user: async () => null }), req('https://m.ge/api/connectors/notion/connect?locale=en'));
    expect(out.headers.get('location')).toBe('https://m.ge/en?notion=error&reason=not_signed_in');
    const nt = await handleConnect(spec, routeEnv({ deps: async () => ({ ...deps(), tableReady: false }) }), req('https://m.ge/api/connectors/notion/connect'));
    expect(nt.headers.get('location')).toBe('https://m.ge/ka?notion=error&reason=unavailable');
  });

  test('connect → callback stores the token SEALED; a forged or mismatched state is refused', async () => {
    const start = await handleConnect(spec, routeEnv(), req('https://m.ge/api/connectors/notion/connect?locale=ru'));
    expect(start.status).toBe(302);
    const cookie = start.headers.get('set-cookie')!;
    expect(cookie).toMatch(/notion_oauth=.*HttpOnly/i);
    expect(cookie).toMatch(/Path=\/api\/connectors\/notion/);
    const value = decodeURIComponent(/notion_oauth=([^;]+)/.exec(cookie)![1]!);
    const state = value.split('~')[1]!;
    const bad = await handleCallback(spec, routeEnv(), req(`https://m.ge/api/connectors/notion/callback?code=c&state=${encodeURIComponent(state)}x`, `notion_oauth=${encodeURIComponent(value)}`));
    expect(bad.headers.get('location')).toBe('https://m.ge/ru?notion=error&reason=state');
    const ok = await handleCallback(spec, routeEnv(), req(`https://m.ge/api/connectors/notion/callback?code=c&state=${encodeURIComponent(state)}`, `notion_oauth=${encodeURIComponent(value)}`));
    expect(ok.headers.get('location')).toBe('https://m.ge/ru?notion=linked');
    const row = rows.get(user.id)!;
    expect(row.sealedRefreshToken).not.toContain('ntn_secret');
    expect(decryptToken(row.sealedRefreshToken, user.id, cfg.keys)).toBe('ntn_secret');
  });

  test('a store failure after the exchange revokes the token at once', async () => {
    putOk = false;
    const start = await handleConnect(spec, routeEnv(), req('https://m.ge/api/connectors/notion/connect'));
    const value = decodeURIComponent(/notion_oauth=([^;]+)/.exec(start.headers.get('set-cookie')!)![1]!);
    const r = await handleCallback(spec, routeEnv(), req(`https://m.ge/api/connectors/notion/callback?code=c&state=${encodeURIComponent(value.split('~')[1]!)}`, `notion_oauth=${encodeURIComponent(value)}`));
    expect(r.headers.get('location')).toContain('reason=unavailable');
    expect(spec.revoke).toHaveBeenCalledWith(cfg, 'ntn_secret', undefined);
  });

  test('provider error = denied; disconnect revokes and deletes; signed out = 401', async () => {
    const d = await handleCallback(spec, routeEnv(), req('https://m.ge/api/connectors/notion/callback?error=access_denied', 'notion_oauth=a~b~en'));
    expect(d.headers.get('location')).toBe('https://m.ge/en?notion=error&reason=denied');
    rows.set(user.id, { userId: user.id, sealedRefreshToken: (await import('@/lib/connectors/google/crypto')).encryptToken('tok', user.id, cfg.keys), scope: '', email: null });
    const r = await handleDisconnect(spec, routeEnv(), new NextRequest('https://m.ge/api/connectors/notion/disconnect', { method: 'POST' }));
    expect(await r.json()).toEqual({ ok: true, revoked: true });
    expect(spec.revoke).toHaveBeenCalledWith(cfg, 'tok', undefined);
    expect(rows.size).toBe(0);
    expect((await handleDisconnect(spec, routeEnv({ user: async () => null }), new NextRequest('https://m.ge/x', { method: 'POST' }))).status).toBe(401);
  });
});
