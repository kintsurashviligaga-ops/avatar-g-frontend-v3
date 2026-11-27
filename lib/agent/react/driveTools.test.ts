/** @jest-environment node */
/**
 * Phase 8.13 — Agent G's Drive tools when the connection is missing, dies mid-task, or holds no picked files. Every
 * Google call is mocked (the injected fetch on DriveDeps): no network, no spend. The model must get a plain reason and
 * a next step (reconnect / pick files through Connectors beside „+"), never an empty list it could fill with guesses.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../ai/llmText', () => ({ llmText: jest.fn() }));
jest.mock('../tools/googleSearch', () => ({ groundedWebSearch: jest.fn() }));
jest.mock('../../logger', () => ({ structuredLog: jest.fn() }));
jest.mock('../../api/rate-limit', () => ({ checkRateLimitByKey: jest.fn(async () => null), RATE_LIMITS: { ANALYZE_USER: { maxRequests: 1, windowMs: 1, keyPrefix: 'x' } } }));

import { randomBytes } from 'node:crypto';
import { buildLiveToolRegistry, DRIVE_NEXT_PICK, DRIVE_NEXT_RECONNECT, driveToolMessage, driveToolNext } from './bindLiveAgent';
import { connectorKeys, encryptToken } from '@/lib/connectors/google/crypto';
import { driveOAuthConfig } from '@/lib/connectors/google/oauth';
import type { DriveDeps } from '@/lib/connectors/google/drive';
import type { ConnectorAccountRow, ConnectorAccountStore } from '@/lib/connectors/google/store';

const env = {
  CONNECTOR_TOKEN_KEY: randomBytes(32).toString('base64'),
  GOOGLE_OAUTH_CLIENT_ID: '467145118875-example.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'sec',
} as unknown as NodeJS.ProcessEnv;
const cfg = driveOAuthConfig(env)!;
const keys = connectorKeys(env)!;
const U = '11111111-2222-4333-8444-555555555555';

const res = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => Buffer.from('') }) as unknown as Response;

function store(linked: boolean): ConnectorAccountStore & { rows: ConnectorAccountRow[] } {
  const rows: ConnectorAccountRow[] = linked ? [{ userId: U, sealedRefreshToken: encryptToken('rt', U, keys), scope: 'drive.file', email: null }] : [];
  return {
    rows,
    async get(u) { return rows.find((r) => r.userId === u) ?? null; },
    async put() { return true; },
    async remove(u) { const i = rows.findIndex((r) => r.userId === u); if (i >= 0) rows.splice(i, 1); return true; },
  };
}

const run = async (name: string, deps: DriveDeps, args: unknown = {}) => {
  const t = buildLiveToolRegistry({ userId: U, driveDeps: deps } as never).find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t.run(args) as Promise<Record<string, unknown>>;
};

let fetchSpy: jest.SpyInstance;
beforeEach(() => { fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('no network in this test'); }); });
afterEach(() => fetchSpy.mockRestore());

describe('Agent G Drive tools (Phase 8.13)', () => {
  test('never linked → not_connected with a reconnect next step', async () => {
    const out = await run('drive_list_files', { cfg, store: store(false), tableReady: true, fetch: jest.fn() as never });
    expect(out).toEqual({ error: 'not_connected', message: driveToolMessage('not_connected'), next: DRIVE_NEXT_RECONNECT });
    expect(String(out.next)).toMatch(/Connectors button next to "\+"/);
  });

  test('token revoked mid-task: the row is deleted and the model is told to ask for a reconnect', async () => {
    const s = store(true);
    const f = jest.fn(async () => res(400, { error: 'invalid_grant' }));
    const out = await run('drive_read_file', { cfg, store: s, tableReady: true, fetch: f as never }, { id: 'doc_1234567890' });
    expect(out.error).toBe('not_connected');
    expect(out.next).toBe(DRIVE_NEXT_RECONNECT);
    expect(s.rows).toHaveLength(0);
  });

  test('Google down (refresh 500) → failed, no guessing', async () => {
    const out = await run('drive_list_files', { cfg, store: store(true), tableReady: true, fetch: (async () => res(500, {})) as never });
    expect(out.error).toBe('failed');
    expect(String(out.next)).toMatch(/Do not guess/);
  });

  test('linked but nothing picked → empty list with a pick-files next step', async () => {
    const f = jest.fn(async (url: string) => (String(url).includes('oauth2') ? res(200, { access_token: 'at' }) : res(200, { files: [] })));
    const out = await run('drive_list_files', { cfg, store: store(true), tableReady: true, fetch: f as never });
    expect(out).toEqual({ files: [], next: DRIVE_NEXT_PICK });
  });

  test('a file that was not picked → not_found with a list-first next step', async () => {
    const f = jest.fn(async (url: string) => (String(url).includes('oauth2') ? res(200, { access_token: 'at' }) : res(404, {})));
    const out = await run('drive_read_file', { cfg, store: store(true), tableReady: true, fetch: f as never }, { id: 'doc_1234567890' });
    expect(out.error).toBe('not_found');
    expect(out.next).toBe(driveToolNext('not_found'));
  });

  test('picked files are listed as id, name, type only', async () => {
    const f = jest.fn(async (url: string) => (String(url).includes('oauth2') ? res(200, { access_token: 'at' }) : res(200, { files: [
      { id: 'doc_1234567890', name: 'Plan', mimeType: 'application/vnd.google-apps.document', size: '10' },
    ] })));
    const out = await run('drive_list_files', { cfg, store: store(true), tableReady: true, fetch: f as never });
    expect(out).toEqual({ files: [{ id: 'doc_1234567890', name: 'Plan', mimeType: 'application/vnd.google-apps.document' }] });
  });
});
