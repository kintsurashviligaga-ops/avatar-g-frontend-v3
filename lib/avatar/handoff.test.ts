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
    expect(h.verifyHandoffToken(t!)).toEqual({ userId: UID });
    expect(errSpy).not.toHaveBeenCalled();
  });

  test('secret unset → still works on the service-role fallback, but says so ONCE, by name, without the value', () => {
    setEnv(undefined, SERVICE_KEY);
    const h = fresh();
    const t = h.signHandoffToken(UID);
    expect(h.verifyHandoffToken(t!)).toEqual({ userId: UID });
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
