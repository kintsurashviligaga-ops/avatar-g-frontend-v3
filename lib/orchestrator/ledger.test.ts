/** @jest-environment node */
jest.mock('server-only', () => ({}));
// Cut the Supabase import chain (ESM in node_modules) — the pure classifier
// under test does not need a live client.
jest.mock('../supabase/server', () => ({ createServiceRoleClient: () => { throw new Error('no client in test'); } }));

import { classifyLedgerError } from './ledger';

describe('ledger error classification', () => {
  test('insufficient balance → fail-fast', () => {
    expect(classifyLedgerError('Insufficient credits for user')).toBe('insufficient');
  });

  test('missing RPC (42883 / does not exist) → skipped (degrade)', () => {
    expect(classifyLedgerError('function deduct_credits does not exist')).toBe('skipped');
    expect(classifyLedgerError('ERROR 42883: undefined function')).toBe('skipped');
    expect(classifyLedgerError('Could not find the function in schema cache')).toBe('skipped');
  });

  test('genuine connection/db failure → error (fail-fast)', () => {
    expect(classifyLedgerError('fetch failed: ECONNREFUSED')).toBe('error');
    expect(classifyLedgerError('timeout')).toBe('error');
    expect(classifyLedgerError('')).toBe('error');
  });
});
