/** @jest-environment node */
/**
 * Which account a phone-handoff link captures into: masked so the link holder only recognises it, refused outright when
 * the phone is signed into a DIFFERENT account (biometric phishing), and fail-closed when it cannot be told.
 */
jest.mock('server-only', () => ({}));

const mockGetUserById = jest.fn();
jest.mock('../supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({ auth: { admin: { getUserById: mockGetUserById } } })),
}));

import { signHandoffToken, verifyHandoffToken, type HandoffJtiStore } from '../avatar/handoff';
import { describeHandoffLink, lookupMaskedAccount, maskEmail, maskPhone, maskedAccountLabel } from './account';

const UID = '11111111-2222-4333-8444-555555555555';
const OTHER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const saved = process.env.AVATAR_HANDOFF_SECRET;

function store(claimed: boolean | null = false): HandoffJtiStore {
  return { claim: jest.fn(), release: jest.fn(), isClaimed: jest.fn(async () => claimed) };
}

beforeEach(() => {
  process.env.AVATAR_HANDOFF_SECRET = 'test-handoff-secret';
  mockGetUserById.mockReset();
});
afterEach(() => {
  if (saved === undefined) delete process.env.AVATAR_HANDOFF_SECRET;
  else process.env.AVATAR_HANDOFF_SECRET = saved;
});

describe('masking', () => {
  test('an email keeps enough to recognise, never the whole address', () => {
    expect(maskEmail('Kintsurashviligaga@Gmail.com')).toBe('ki•••a@gmail.com');
    expect(maskEmail('giorgi@myavatar.ge')).toBe('gi•••i@myavatar.ge');
    expect(maskEmail('abc@x.ge')).toBe('a•••@x.ge');
    for (const bad of ['', 'no-at-sign', '@x.ge', 'a@', null, 42]) expect(maskEmail(bad)).toBeNull();
  });

  test('a phone keeps only its last two digits', () => {
    expect(maskPhone('+995 555 12 34 56')).toBe('+•••56');
    expect(maskPhone('123')).toBeNull();
  });

  test('email first, then phone; neither → null', () => {
    expect(maskedAccountLabel({ email: 'giorgi@gmail.com', phone: '+995555123456' })).toBe('gi•••i@gmail.com');
    expect(maskedAccountLabel({ email: null, phone: '+995555123456' })).toBe('+•••56');
    expect(maskedAccountLabel({})).toBeNull();
  });

  test('lookup reads the account through the service role; an auth error THROWS (never "no account")', async () => {
    mockGetUserById.mockResolvedValueOnce({ data: { user: { email: 'giorgi@gmail.com' } }, error: null });
    await expect(lookupMaskedAccount(UID)).resolves.toBe('gi•••i@gmail.com');
    expect(mockGetUserById).toHaveBeenCalledWith(UID);
    mockGetUserById.mockResolvedValueOnce({ data: { user: null }, error: { message: 'down' } });
    await expect(lookupMaskedAccount(UID)).rejects.toThrow();
  });
});

describe('describeHandoffLink — what the phone may show before any capture', () => {
  const lookup = jest.fn(async () => 'gi•••i@gmail.com');

  test('a valid unused link on a signed-out phone → the masked account it saves to', async () => {
    await expect(describeHandoffLink(signHandoffToken(UID)!, { sessionUserId: null, store: () => store(), lookup })).resolves.toEqual({
      ok: true,
      account: 'gi•••i@gmail.com',
    });
    expect(lookup).toHaveBeenCalledWith(UID);
  });

  test('a phone signed into the SAME account is fine', async () => {
    await expect(describeHandoffLink(signHandoffToken(UID)!, { sessionUserId: UID, store: () => store(), lookup })).resolves.toMatchObject({ ok: true });
  });

  test('⚠️ a phone signed into ANOTHER account → account_mismatch, and the link’s account is never even looked up', async () => {
    lookup.mockClear();
    await expect(describeHandoffLink(signHandoffToken(UID)!, { sessionUserId: OTHER, store: () => store(), lookup })).resolves.toEqual({
      ok: false,
      reason: 'account_mismatch',
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  test('invalid / expired / used links say so', async () => {
    await expect(describeHandoffLink('forged.token', { sessionUserId: null, store: () => store(), lookup })).resolves.toEqual({ ok: false, reason: 'invalid' });
    await expect(describeHandoffLink(signHandoffToken(UID, -1)!, { sessionUserId: null, store: () => store(), lookup })).resolves.toEqual({ ok: false, reason: 'invalid' });
    const token = signHandoffToken(UID)!;
    expect(verifyHandoffToken(token)).not.toBeNull();
    await expect(describeHandoffLink(token, { sessionUserId: null, store: () => store(true), lookup })).resolves.toEqual({ ok: false, reason: 'used' });
  });

  test('fail closed: a store or lookup that cannot answer, or an account with nothing to show → unavailable (no capture)', async () => {
    const token = signHandoffToken(UID)!;
    await expect(describeHandoffLink(token, { sessionUserId: null, store: () => store(null), lookup })).resolves.toEqual({ ok: false, reason: 'unavailable' });
    await expect(
      describeHandoffLink(token, { sessionUserId: null, store: () => { throw new Error('unconfigured'); }, lookup }),
    ).resolves.toEqual({ ok: false, reason: 'unavailable' });
    await expect(
      describeHandoffLink(token, { sessionUserId: null, store: () => store(), lookup: async () => { throw new Error('auth down'); } }),
    ).resolves.toEqual({ ok: false, reason: 'unavailable' });
    await expect(describeHandoffLink(token, { sessionUserId: null, store: () => store(), lookup: async () => null })).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });
});
