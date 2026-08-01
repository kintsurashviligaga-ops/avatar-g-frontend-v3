/**
 * The rules that decide whether a signed-in user still has their history tomorrow.
 *
 * These are asserted rather than reasoned about because the two bugs they encode were both invisible:
 * a global storage key that two accounts silently shared, and a sign-out wipe that deleted the only
 * copy of every conversation. Neither threw, neither logged, and both looked exactly like working code.
 */
import { isAppSessionKey, ARCHIVE_PREFIX } from '@/lib/auth/sessionCleanup';
import { conversationsKey, adoptLegacyArchive, LEGACY_CONVERSATIONS_KEY } from './historyKeys';

describe('the archive survives sign-out', () => {
  it('does not treat a uid-scoped archive as session state', () => {
    expect(isAppSessionKey(conversationsKey('user-abc'))).toBe(false);
    expect(isAppSessionKey(conversationsKey(null))).toBe(false);
  });

  it('still wipes real session state — the privacy property must not regress', () => {
    // These are the machine's, not the user's, and must go on sign-out.
    expect(isAppSessionKey('sb-access-token')).toBe(true);
    expect(isAppSessionKey('myavatar:chat-session')).toBe(true);
    expect(isAppSessionKey('myavatar-omni-current')).toBe(true);
    // The pre-uid global slot has no known owner, so it is correctly still cleared.
    expect(isAppSessionKey(LEGACY_CONVERSATIONS_KEY)).toBe(true);
  });

  it('keeps the consent record and theme, which were never session state', () => {
    expect(isAppSessionKey('myavatar-cookie-consent')).toBe(false);
    expect(isAppSessionKey('myavatar-theme')).toBe(false);
  });
});

describe('the archive is per-user', () => {
  it('gives two accounts on one browser different slots', () => {
    expect(conversationsKey('user-a')).not.toBe(conversationsKey('user-b'));
  });

  it('namespaces under the prefix sign-out preserves', () => {
    expect(conversationsKey('user-a').startsWith(ARCHIVE_PREFIX)).toBe(true);
  });

  it('gives a signed-out visitor a slot rather than dropping their work', () => {
    expect(conversationsKey(null)).toBe(conversationsKey(undefined));
    expect(conversationsKey(null)).toContain('anon');
  });
});

describe('adopting the pre-uid archive', () => {
  const store: Record<string, string> = {};
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; },
      },
    });
  });

  it('moves an existing global archive into the user slot', () => {
    store[LEGACY_CONVERSATIONS_KEY] = '[{"id":"c1","title":"t","messages":[],"updatedAt":1}]';
    adoptLegacyArchive('user-a');
    expect(store[conversationsKey('user-a')]).toBe(store[LEGACY_CONVERSATIONS_KEY]);
  });

  // ⚠️ Without this the fix would itself lose history exactly once, for everyone — the failure it exists
  // to prevent, shipped as the cure.
  it('never overwrites an archive the user already has', () => {
    store[conversationsKey('user-a')] = '[{"id":"real","title":"mine","messages":[],"updatedAt":9}]';
    store[LEGACY_CONVERSATIONS_KEY] = '[{"id":"old","title":"stale","messages":[],"updatedAt":1}]';
    adoptLegacyArchive('user-a');
    expect(store[conversationsKey('user-a')]).toContain('real');
  });

  it('leaves the legacy slot in place — its owner is genuinely unknown on a shared browser', () => {
    store[LEGACY_CONVERSATIONS_KEY] = '[{"id":"c1","title":"t","messages":[],"updatedAt":1}]';
    adoptLegacyArchive('user-a');
    expect(store[LEGACY_CONVERSATIONS_KEY]).toBeTruthy();
  });

  it('is a no-op when there is nothing to adopt', () => {
    adoptLegacyArchive('user-a');
    expect(store[conversationsKey('user-a')]).toBeUndefined();
    store[LEGACY_CONVERSATIONS_KEY] = '[]';
    adoptLegacyArchive('user-a');
    expect(store[conversationsKey('user-a')]).toBeUndefined();
  });
});
