/** @jest-environment node */
jest.mock('server-only', () => ({}));

type HandoffModule = typeof import('./handoff');
const UID = '11111111-2222-4333-8444-555555555555';
const SERVICE_KEY = 'service-role-key-value-that-must-never-be-logged';

const saved = { secret: process.env.AVATAR_HANDOFF_SECRET, service: process.env.SUPABASE_SERVICE_ROLE_KEY };
function setEnv(secret: string | undefined, service: string | undefined) {
  if (secret === undefined) delete process.env.AVATAR_HANDOFF_SECRET;
  else process.env.AVATAR_HANDOFF_SECRET = secret;
  if (service === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = service;
}
/** A fresh module per test — the "warned once" flag is per instance, like a cold start. */
function fresh(): HandoffModule {
  let mod!: HandoffModule;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('./handoff') as HandoffModule;
  });
  return mod;
}

let errSpy: jest.SpyInstance;
beforeEach(() => {
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  errSpy.mockRestore();
  setEnv(saved.secret, saved.service);
});

describe('handoff signing key — a missing AVATAR_HANDOFF_SECRET is loud, never silent', () => {
  test('dedicated secret set → signs, verifies, and logs nothing', () => {
    setEnv('dedicated-handoff-secret', SERVICE_KEY);
    const h = fresh();
    const t = h.signHandoffToken(UID);
    expect(t).toBeTruthy();
    expect(h.verifyHandoffToken(t!)).toMatchObject({ userId: UID });
    expect(errSpy).not.toHaveBeenCalled();
  });

  test('secret unset → still works on the service-role fallback, but says so ONCE, by name, without the value', () => {
    setEnv(undefined, SERVICE_KEY);
    const h = fresh();
    const t = h.signHandoffToken(UID);
    expect(h.verifyHandoffToken(t!)).toMatchObject({ userId: UID });
    h.signHandoffToken(UID);
    expect(errSpy).toHaveBeenCalledTimes(1);
    const msg = String(errSpy.mock.calls[0]![0]);
    expect(msg).toMatch(/AVATAR_HANDOFF_SECRET is UNSET/);
    expect(msg).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(msg).not.toContain(SERVICE_KEY);
  });

  test('neither key → fail-closed (no token) and the log says handoff is disabled', () => {
    setEnv(undefined, undefined);
    const h = fresh();
    expect(h.signHandoffToken(UID)).toBeNull();
    expect(h.verifyHandoffToken('abc.def')).toBeNull();
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(String(errSpy.mock.calls[0]![0])).toMatch(/DISABLED/);
  });

  test('a token signed under the fallback does not verify once a dedicated secret is set', () => {
    setEnv(undefined, SERVICE_KEY);
    const t = fresh().signHandoffToken(UID)!;
    setEnv('dedicated-handoff-secret', SERVICE_KEY);
    expect(fresh().verifyHandoffToken(t)).toBeNull();
  });
});

describe('single use (jti) — a handoff link completes exactly once', () => {
  /** An atomic in-memory store, the contract lib/twin/store.ts twinHandoffJtiStore implements on storage. */
  function memoryStore() {
    const used = new Set<string>();
    return {
      used,
      claim: jest.fn(async (jti: string) => (used.has(jti) ? 'used' : (used.add(jti), 'claimed')) as 'claimed' | 'used'),
      release: jest.fn(async (jti: string) => { used.delete(jti); }),
      isClaimed: jest.fn(async (jti: string) => used.has(jti)),
    };
  }

  beforeEach(() => setEnv('dedicated-handoff-secret', SERVICE_KEY));

  test('every token carries its own random id, and verify returns it with the expiry', () => {
    const h = fresh();
    const a = h.verifyHandoffToken(h.signHandoffToken(UID)!)!;
    const b = h.verifyHandoffToken(h.signHandoffToken(UID)!)!;
    expect(a.jti).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a.jti).not.toBe(b.jti);
    expect(a.exp).toBeGreaterThan(Date.now());
  });

  test('consume: the first use wins, a replay is "used" — even though the signature is still valid', async () => {
    const h = fresh();
    const store = memoryStore();
    const token = h.signHandoffToken(UID)!;
    await expect(h.consumeHandoffToken(token, store)).resolves.toMatchObject({ ok: true, claims: { userId: UID } });
    await expect(h.consumeHandoffToken(token, store)).resolves.toEqual({ ok: false, reason: 'used' });
    expect(h.verifyHandoffToken(token)).not.toBeNull(); // verifying alone never spends it
  });

  test('two different links of the same user are independent', async () => {
    const h = fresh();
    const store = memoryStore();
    await expect(h.consumeHandoffToken(h.signHandoffToken(UID)!, store)).resolves.toMatchObject({ ok: true });
    await expect(h.consumeHandoffToken(h.signHandoffToken(UID)!, store)).resolves.toMatchObject({ ok: true });
  });

  test('an invalid or expired token never reaches the store', async () => {
    const h = fresh();
    const store = memoryStore();
    await expect(h.consumeHandoffToken('nope.nope', store)).resolves.toEqual({ ok: false, reason: 'invalid' });
    await expect(h.consumeHandoffToken(h.signHandoffToken(UID, -1)!, store)).resolves.toEqual({ ok: false, reason: 'invalid' });
    expect(store.claim).not.toHaveBeenCalled();
  });

  test('a store that cannot answer fails closed as "unavailable" (and nothing was claimed)', async () => {
    const h = fresh();
    const store = { ...memoryStore(), claim: jest.fn(async () => { throw new Error('storage down'); }) };
    await expect(h.consumeHandoffToken(h.signHandoffToken(UID)!, store)).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  test('a pre-jti token (userId.exp, correctly signed) is refused — it could never be single-use', () => {
    const h = fresh();
    const { createHmac } = jest.requireActual('crypto') as typeof import('crypto');
    const payload = `${UID}.${Date.now() + 60_000}`;
    const legacy = `${Buffer.from(payload).toString('base64url')}.${createHmac('sha256', 'dedicated-handoff-secret').update(payload).digest('base64url')}`;
    expect(h.verifyHandoffToken(legacy)).toBeNull();
  });
});
