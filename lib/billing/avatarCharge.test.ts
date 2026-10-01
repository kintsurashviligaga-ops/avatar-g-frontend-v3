/** @jest-environment node */
/**
 * The avatar charge token — what lets a GET poll skip its deduct and refund a reservation. Pinned: a token only
 * verifies under the server key, for its own kind, and only for the provider job it was minted for; a forged,
 * tampered or re-pointed token reads as "no token" (the route then falls back to charging, never to free).
 */
import {
  avatarChargeRef,
  avatarChargeSigningReady,
  chargeForPolledId,
  signAvatarCharge,
  splitChargedJobId,
  verifyAvatarCharge,
  withChargeToken,
} from './avatarCharge';

const ORIGINAL = { a: process.env.AVATAR_CHARGE_SECRET, s: process.env.SUPABASE_SERVICE_ROLE_KEY };

beforeEach(() => {
  process.env.AVATAR_CHARGE_SECRET = 'test-avatar-charge-secret-0123456789';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});
afterAll(() => {
  if (ORIGINAL.a === undefined) delete process.env.AVATAR_CHARGE_SECRET; else process.env.AVATAR_CHARGE_SECRET = ORIGINAL.a;
  if (ORIGINAL.s === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL.s;
});

const REF = avatarChargeRef('lipsync', 'user-1', '00000000-0000-4000-8000-000000000001');

describe('sign / verify', () => {
  it('round-trips a lipsync charge bound to its job', () => {
    const t = signAvatarCharge({ k: 'lipsync', u: 'user-1', r: REF, j: 'heygen:abc123' });
    expect(t).toMatch(/^av1\./);
    expect(verifyAvatarCharge(t, 'lipsync')).toMatchObject({ k: 'lipsync', u: 'user-1', r: REF, j: 'heygen:abc123' });
  });

  it('refuses a token of the wrong kind (a presenter token cannot act on the lip-sync route)', () => {
    const t = signAvatarCharge({ k: 'presenter', u: 'user-1', r: REF, j: 'vid-1' });
    expect(verifyAvatarCharge(t, 'lipsync')).toBeNull();
    expect(verifyAvatarCharge(t, 'presenter')).not.toBeNull();
  });

  it('refuses a tampered payload and a token signed under another key', () => {
    const t = signAvatarCharge({ k: 'lipsync', u: 'user-1', r: REF, j: 'job-1' })!;
    const [p, payload, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ v: 1, k: 'lipsync', u: 'attacker', r: REF, j: 'job-1', iat: 1 })).toString('base64url');
    expect(verifyAvatarCharge(`${p}.${forged}.${sig}`)).toBeNull();
    expect(verifyAvatarCharge(`${p}.${payload}.${sig.slice(0, -2)}xx`)).toBeNull();
    process.env.AVATAR_CHARGE_SECRET = 'a-different-secret-entirely-9876543210';
    expect(verifyAvatarCharge(t)).toBeNull();
  });

  it('is fail-closed without a signing key', () => {
    delete process.env.AVATAR_CHARGE_SECRET;
    expect(avatarChargeSigningReady()).toBe(false);
    expect(signAvatarCharge({ k: 'lipsync', u: 'user-1', r: REF, j: 'job-1' })).toBeNull();
    expect(verifyAvatarCharge('av1.e30.abc')).toBeNull();
  });

  it('falls back to the service-role key, like the handoff token', () => {
    delete process.env.AVATAR_CHARGE_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-for-tests';
    expect(avatarChargeSigningReady()).toBe(true);
    const t = signAvatarCharge({ k: 'presenter-hold', u: 'user-1', r: REF, j: null });
    expect(verifyAvatarCharge(t, 'presenter-hold')).toMatchObject({ j: null });
  });

  it('rejects junk', () => {
    for (const junk of [undefined, null, 42, '', 'av1', 'av1..', 'nope.a.b', 'x'.repeat(5000)]) {
      expect(verifyAvatarCharge(junk)).toBeNull();
    }
  });
});

describe('composite job ids', () => {
  it('keeps the provider prefix (the client checks startsWith("heygen:")) and splits back exactly', () => {
    const t = signAvatarCharge({ k: 'lipsync', u: 'user-1', r: REF, j: 'heygen:abc' })!;
    const id = withChargeToken('heygen:abc', t);
    expect(id.startsWith('heygen:')).toBe(true);
    expect(decodeURIComponent(encodeURIComponent(id))).toBe(id);
    expect(splitChargedJobId(id)).toEqual({ jobId: 'heygen:abc', token: t });
  });

  it('leaves a bare id (and one with a stray ~) untouched', () => {
    expect(splitChargedJobId('abc123')).toEqual({ jobId: 'abc123', token: null });
    expect(splitChargedJobId('we~ird')).toEqual({ jobId: 'we~ird', token: null });
  });

  it('a token re-pointed at ANOTHER job carries no charge', () => {
    const t = signAvatarCharge({ k: 'lipsync', u: 'user-1', r: REF, j: 'job-A' })!;
    expect(chargeForPolledId(withChargeToken('job-A', t), 'lipsync').charge).not.toBeNull();
    const moved = chargeForPolledId(withChargeToken('job-B', t), 'lipsync');
    expect(moved).toEqual({ jobId: 'job-B', charge: null });
  });
});
