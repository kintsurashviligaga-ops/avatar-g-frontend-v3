/** @jest-environment node */
/**
 * Phase 8.18 flag isolation for #392: with AGENT_PLUGINS, CONNECTORS_NOTION and CONNECTORS_GITHUB unset (the default),
 * every new route is a plain 404, signed in or not, and never reaches the database, the provider or the rate limiter.
 * With `admin`, a signed-out caller and a non-admin get the same 404.
 */
jest.mock('server-only', () => ({}));
let mockUser: { id: string; email?: string } | null = null;
const mockDb = jest.fn();
jest.mock('../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ user: mockUser })),
  createServiceRoleClient: () => { mockDb(); throw new Error('the database must not be reached'); },
}));
const mockLimit = jest.fn(async () => null);
jest.mock('../../lib/api/rate-limit', () => ({ checkRateLimit: (...a: unknown[]) => mockLimit(...(a as [])), RATE_LIMITS: { READ: {} } }));
jest.mock('../../lib/admin/guard', () => ({ isAdminUser: (u: { email?: string } | null) => u?.email === 'admin@example.com' }));

import { NextRequest } from 'next/server';
import * as notionConnect from '../../app/api/connectors/notion/connect/route';
import * as notionCallback from '../../app/api/connectors/notion/callback/route';
import * as notionDisconnect from '../../app/api/connectors/notion/disconnect/route';
import * as notionPages from '../../app/api/connectors/notion/pages/route';
import * as githubConnect from '../../app/api/connectors/github/connect/route';
import * as githubCallback from '../../app/api/connectors/github/callback/route';
import * as githubDisconnect from '../../app/api/connectors/github/disconnect/route';
import * as plugins from '../../app/api/agent/plugins/route';

type H = (req: NextRequest) => Promise<Response>;
const ROUTES: Array<[string, 'GET' | 'POST', H]> = [
  ['/api/connectors/notion/connect?locale=ka', 'GET', notionConnect.GET],
  ['/api/connectors/notion/callback?code=c&state=s', 'GET', notionCallback.GET],
  ['/api/connectors/notion/disconnect', 'POST', notionDisconnect.POST],
  ['/api/connectors/notion/pages', 'POST', notionPages.POST],
  ['/api/connectors/github/connect?locale=en', 'GET', githubConnect.GET],
  ['/api/connectors/github/callback?code=c&state=s', 'GET', githubCallback.GET],
  ['/api/connectors/github/disconnect', 'POST', githubDisconnect.POST],
  ['/api/agent/plugins', 'GET', plugins.GET],
];
const call = (path: string, method: 'GET' | 'POST', h: H) =>
  h(new NextRequest(`https://myavatar.ge${path}`, method === 'POST'
    ? { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ parentId: '0'.repeat(32), title: 't', text: 'x' }) }
    : { method }));

const ENV = { ...process.env };
const FLAGS = ['AGENT_PLUGINS', 'CONNECTORS_NOTION', 'CONNECTORS_GITHUB', 'NOTION_CLIENT_ID', 'NOTION_CLIENT_SECRET', 'GITHUB_CONNECTOR_CLIENT_ID', 'GITHUB_CONNECTOR_CLIENT_SECRET'];
beforeEach(() => {
  process.env = { ...ENV };
  for (const f of FLAGS) delete process.env[f];
  mockDb.mockClear();
  mockLimit.mockClear();
});
afterAll(() => { process.env = ENV; });

describe('flags off (the default)', () => {
  for (const who of ['signed out', 'a user', 'an admin'] as const) {
    it.each(ROUTES)(`${who}: %s is a plain 404`, async (path, method, h) => {
      mockUser = who === 'signed out' ? null : { id: 'u1', email: who === 'an admin' ? 'admin@example.com' : 'a@b.ge' };
      const r = await call(path, method, h);
      expect(r.status).toBe(404);
      expect(r.headers.get('location')).toBeNull();
      expect(mockDb).not.toHaveBeenCalled();
    });
  }

  it('the connector routes answer before the rate limiter is touched', async () => {
    mockUser = null;
    for (const [path, method, h] of ROUTES.slice(0, 7)) await call(path, method, h);
    expect(mockLimit).not.toHaveBeenCalled();
  });
});

describe('flags = admin', () => {
  beforeEach(() => {
    process.env.AGENT_PLUGINS = 'admin';
    process.env.CONNECTORS_NOTION = 'admin';
    process.env.CONNECTORS_GITHUB = 'admin';
  });
  it.each(ROUTES)('signed out: %s is the same 404 (no redirect, no 401)', async (path, method, h) => {
    mockUser = null;
    const r = await call(path, method, h);
    expect(r.status).toBe(404);
    expect(r.headers.get('location')).toBeNull();
  });
  it.each(ROUTES)('a non-admin: %s is the same 404', async (path, method, h) => {
    mockUser = { id: 'u1', email: 'a@b.ge' };
    expect((await call(path, method, h)).status).toBe(404);
    expect(mockDb).not.toHaveBeenCalled();
  });
});
