/** @jest-environment node */
/**
 * resolveSmmOwnerContext — a client-sent demo flag never stands in for a session in production.
 *
 * ⚠️ `x-demo-mode: 1` or `?demo=1` turned ANY anonymous request into the shared 'demo' owner, and every SMM route then
 * wrote through the service-role client on its behalf. Pinned: in production the flag is ignored (no session → null);
 * outside production it still opens the local demo; a real session always wins.
 */
jest.mock('server-only', () => ({}));
let mockUser: { id: string } | null = null;
jest.mock('../supabase/auth', () => ({ getAuthenticatedUser: jest.fn(async () => mockUser) }));

import { NextRequest } from 'next/server';
import { resolveSmmOwnerContext } from './server';

const setEnv = (k: string, v: string | undefined) => {
  const e = process.env as Record<string, string | undefined>;
  if (v === undefined) delete e[k];
  else e[k] = v;
};
const ENV = { ...process.env };
afterEach(() => { process.env = { ...ENV }; mockUser = null; });

const req = (url = 'https://myavatar.ge/api/smm/projects', headers: Record<string, string> = {}) => new NextRequest(url, { headers });

test('production: the demo header and the ?demo=1 query are ignored — no session means no owner', async () => {
  setEnv('NODE_ENV', 'production');
  expect(await resolveSmmOwnerContext(req(undefined, { 'x-demo-mode': '1' }))).toBeNull();
  expect(await resolveSmmOwnerContext(req('https://myavatar.ge/api/smm/projects?demo=1'))).toBeNull();
});

test('outside production the local demo still works', async () => {
  setEnv('NODE_ENV', 'development');
  expect(await resolveSmmOwnerContext(req(undefined, { 'x-demo-mode': '1' }))).toEqual({ ownerId: 'demo', isDemo: true, userId: null });
});

test('a verified session is the owner, whatever the flags say', async () => {
  setEnv('NODE_ENV', 'production');
  mockUser = { id: 'user-1' };
  expect(await resolveSmmOwnerContext(req(undefined, { 'x-demo-mode': '1' }))).toEqual({ ownerId: 'user-1', isDemo: false, userId: 'user-1' });
});
