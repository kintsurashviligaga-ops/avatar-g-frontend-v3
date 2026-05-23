/** @jest-environment node */
jest.mock('server-only', () => ({}));

let mockRpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
let mockSelectResult: { data: unknown; error: unknown };
let mockThrow = false;

jest.mock('../supabase/server', () => ({
  createServiceRoleClient: () => {
    if (mockThrow) throw new Error('no client');
    return {
      rpc: (fn: string, args: Record<string, unknown>) => mockRpc(fn, args),
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(mockSelectResult) }) }),
      }),
    };
  },
}));

import { creditWalletGel, consumeFreeAvatarChat, setAvatarName, getOnboardingState } from './wallet-ledger';

beforeEach(() => {
  mockThrow = false;
  mockRpc = async () => ({ data: null, error: null });
  mockSelectResult = { data: null, error: null };
});

describe('creditWalletGel', () => {
  test('returns the new balance from the RPC', async () => {
    mockRpc = async (fn, args) => { expect(fn).toBe('credit_wallet_gel'); expect(args.p_ref).toBe('stripe:s1'); return { data: 15, error: null }; };
    expect(await creditWalletGel('u', 10, 'stripe:s1')).toBe(15);
  });
  test('ignores non-positive amounts (no charge)', async () => {
    expect(await creditWalletGel('u', 0, 'r')).toBeNull();
    expect(await creditWalletGel('u', -5, 'r')).toBeNull();
  });
  test('fail-open null on RPC error', async () => {
    mockRpc = async () => ({ data: null, error: { message: 'missing fn' } });
    expect(await creditWalletGel('u', 10, 'r')).toBeNull();
  });
  test('fail-open null when no client', async () => {
    mockThrow = true;
    expect(await creditWalletGel('u', 10, 'r')).toBeNull();
  });
});

describe('consumeFreeAvatarChat', () => {
  test('returns remaining (>=0) when a free slot is burned', async () => {
    mockRpc = async () => ({ data: 2, error: null });
    expect(await consumeFreeAvatarChat('u')).toBe(2);
  });
  test('returns -1 when exhausted', async () => {
    mockRpc = async () => ({ data: -1, error: null });
    expect(await consumeFreeAvatarChat('u')).toBe(-1);
  });
  test('null on error → caller keeps existing behavior', async () => {
    mockRpc = async () => ({ data: null, error: { message: 'no fn' } });
    expect(await consumeFreeAvatarChat('u')).toBeNull();
  });
});

describe('setAvatarName', () => {
  test('true on success', async () => {
    mockRpc = async (fn, args) => { expect(fn).toBe('set_avatar_name'); expect(args.p_name).toBe('ნავი'); return { data: null, error: null }; };
    expect(await setAvatarName('u', 'ნავი')).toBe(true);
  });
  test('false on error', async () => {
    mockRpc = async () => ({ data: null, error: { message: 'x' } });
    expect(await setAvatarName('u', 'x')).toBe(false);
  });
});

describe('getOnboardingState', () => {
  test('maps the profile row', async () => {
    mockSelectResult = { data: { avatar_name: 'Navi', is_avatar_named: true, free_avatar_chats_remaining: 1 }, error: null };
    expect(await getOnboardingState('u')).toEqual({ avatarName: 'Navi', isAvatarNamed: true, freeRemaining: 1 });
  });
  test('null when no row', async () => {
    mockSelectResult = { data: null, error: null };
    expect(await getOnboardingState('u')).toBeNull();
  });
  test('defaults freeRemaining to 3 when column null', async () => {
    mockSelectResult = { data: { avatar_name: null, is_avatar_named: false, free_avatar_chats_remaining: null }, error: null };
    expect(await getOnboardingState('u')).toEqual({ avatarName: null, isAvatarNamed: false, freeRemaining: 3 });
  });
});
