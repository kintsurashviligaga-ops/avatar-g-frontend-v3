/** @jest-environment node */
jest.mock('server-only', () => ({}));
// No Supabase client: every debit reports 'skipped', which is the state under test.
jest.mock('../supabase/server', () => ({ createServiceRoleClient: () => { throw new Error('no client in test'); } }));
jest.mock('../env/previewIsolation', () => ({ paidWritesBlockedOnPreview: () => false }));

import { deductCredits, deductCreditsOnce, ledgerFailClosed } from './ledger';

const env = process.env as Record<string, string | undefined>;
const saved = { flag: env.LEDGER_FAIL_CLOSED, node: env.NODE_ENV };
afterEach(() => { env.LEDGER_FAIL_CLOSED = saved.flag; env.NODE_ENV = saved.node; });

describe('LEDGER_FAIL_CLOSED (Phase 8.20)', () => {
  test('flag off: a skipped debit stays skipped (today, unchanged)', async () => {
    delete env.LEDGER_FAIL_CLOSED; env.NODE_ENV = 'production';
    expect(ledgerFailClosed()).toBe(false);
    expect(await deductCredits('u', 5, 'r')).toEqual({ ok: false, reason: 'skipped' });
    expect(await deductCreditsOnce('u', 5, 'r')).toEqual({ ok: false, reason: 'skipped' });
  });

  test('flag on in production: skipped becomes error, so no route renders for free', async () => {
    env.LEDGER_FAIL_CLOSED = '1'; env.NODE_ENV = 'production';
    expect(ledgerFailClosed()).toBe(true);
    expect(await deductCredits('u', 5, 'r')).toEqual({ ok: false, reason: 'error' });
    expect(await deductCreditsOnce('u', 5, 'r')).toEqual({ ok: false, reason: 'error' });
  });

  test('flag on outside production: dev without the RPC still works', async () => {
    env.LEDGER_FAIL_CLOSED = '1'; env.NODE_ENV = 'test';
    expect(await deductCredits('u', 5, 'r')).toEqual({ ok: false, reason: 'skipped' });
  });
});
