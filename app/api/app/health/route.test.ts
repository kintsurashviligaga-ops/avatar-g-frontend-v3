/** @jest-environment node */
/**
 * GET /api/app/health — operators only (lib/security/opsAccess).
 *
 * ⚠️ It was anonymous: env-key names, configured flags, our vendor credit balances, and with ?live=1 a probe fired at
 * seven providers per hit. Pinned: in production a stranger gets a 404 and NO audit (live or not) runs; an admin, or a
 * caller holding CRON_SECRET (the ops script), gets the report; local dev keeps it open for convenience.
 */
jest.mock('server-only', () => ({}));

let mockAdmin = false;
jest.mock('../../../../lib/auth/adminGuard', () => ({ isAdmin: jest.fn(async () => mockAdmin) }));
jest.mock('../../../../lib/system/provider-health', () => ({
  runProviderHealthAudit: jest.fn(async () => ({ routing: [], providers: [] })),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';
import { runProviderHealthAudit } from '../../../../lib/system/provider-health';

// Always write through the LIVE process.env (afterEach swaps the object, so a cached reference would go stale).
const setEnv = (k: string, v: string | undefined) => {
  const e = process.env as Record<string, string | undefined>;
  if (v === undefined) delete e[k];
  else e[k] = v;
};
const ENV = { ...process.env };
const get = (qs = '', headers: Record<string, string> = {}) => GET(new NextRequest(`https://myavatar.ge/api/app/health${qs}`, { headers }));

beforeEach(() => {
  jest.clearAllMocks();
  mockAdmin = false;
  setEnv('NODE_ENV', 'production');
  setEnv('CRON_SECRET', 'cron-secret-for-tests');
});
afterEach(() => { process.env = { ...ENV }; });

test('production, not an admin, no cron secret → 404, and no audit runs (not even the cheap one)', async () => {
  for (const qs of ['', '?live=1']) {
    const res = await get(qs);
    expect(res.status).toBe(404);
  }
  expect(runProviderHealthAudit).not.toHaveBeenCalled();
});

test('a wrong cron bearer is still a stranger', async () => {
  const res = await get('?live=1', { authorization: 'Bearer guessed' });
  expect(res.status).toBe(404);
  expect(runProviderHealthAudit).not.toHaveBeenCalled();
});

test('a signed-in admin gets the report', async () => {
  mockAdmin = true;
  const res = await get('?live=1');
  expect(res.status).toBe(200);
  expect(runProviderHealthAudit).toHaveBeenCalledWith({ live: true });
});

test('the ops script with CRON_SECRET gets the report', async () => {
  const res = await get('', { authorization: 'Bearer cron-secret-for-tests' });
  expect(res.status).toBe(200);
  expect(runProviderHealthAudit).toHaveBeenCalledWith({ live: false });
});

test('an UNSET CRON_SECRET opens nothing', async () => {
  setEnv('CRON_SECRET', undefined);
  const res = await get('', { authorization: 'Bearer ' });
  expect(res.status).toBe(404);
});

test('outside production (local dev) it stays open', async () => {
  setEnv('NODE_ENV', 'development');
  const res = await get();
  expect(res.status).toBe(200);
});
