/** @jest-environment node */
import { isAppSessionKey, keysToClear, PRESERVED_KEYS, APP_STORAGE_PREFIXES } from './sessionCleanup';

describe('what a sign-out must delete', () => {
  it('clears the chat history that used to survive sign-out — the actual bug', () => {
    expect(isAppSessionKey('myavatar-omni-conversations')).toBe(true);
    expect(isAppSessionKey('myavatar-omni-current')).toBe(true);
    expect(isAppSessionKey('myavatar-chat:index')).toBe(true);
    expect(isAppSessionKey('myavatar-chat:abc123')).toBe(true);
    expect(isAppSessionKey('myavatar.conversations.v1')).toBe(true);
  });

  it('clears the persona, so the next person does not inherit one', () => {
    expect(isAppSessionKey('myavatar:persona')).toBe(true);
    expect(isAppSessionKey('myavatar:personas:custom')).toBe(true);
  });

  it("clears Supabase's own namespace as a backstop for a signOut that failed", () => {
    expect(isAppSessionKey('sb-abcdefgh-auth-token')).toBe(true);
    expect(isAppSessionKey('sb-refresh-token')).toBe(true);
  });

  it('clears the other app namespaces', () => {
    expect(isAppSessionKey('omni-draft')).toBe(true);
    expect(isAppSessionKey('avatar-g-agent-premium')).toBe(true);
    expect(isAppSessionKey('myavatar-recent-services')).toBe(true);
    expect(isAppSessionKey('myavatar-media')).toBe(true);
  });

  it('is case-insensitive — a key cased differently is still ours', () => {
    expect(isAppSessionKey('MyAvatar-Omni-Conversations')).toBe(true);
    expect(isAppSessionKey('SB-Auth-Token')).toBe(true);
  });
});

describe('what a sign-out must NOT delete', () => {
  it('keeps the cookie-consent record — it is a per-device legal record, not user data', () => {
    expect(isAppSessionKey('myavatar-cookie-consent')).toBe(false);
  });

  it('keeps the theme — resetting someone dark mode on logout is a bug, not privacy', () => {
    expect(isAppSessionKey('myavatar-theme')).toBe(false);
  });

  it('leaves other origins/libraries alone', () => {
    expect(isAppSessionKey('ph_posthog_something')).toBe(false);
    expect(isAppSessionKey('i18nextLng')).toBe(false);
    expect(isAppSessionKey('')).toBe(false);
    // A key that merely CONTAINS a prefix is not ours — only a prefix match counts.
    expect(isAppSessionKey('third-party-myavatar-cache')).toBe(false);
  });

  it('every preserved key is genuinely excluded, not just documented', () => {
    for (const k of PRESERVED_KEYS) expect(isAppSessionKey(k)).toBe(false);
  });
});

describe('keysToClear', () => {
  it('partitions a real-looking storage snapshot correctly', () => {
    const all = [
      'myavatar-omni-conversations', 'myavatar-chat:abc', 'myavatar:persona',
      'sb-xyz-auth-token', 'avatar-g-agent-premium',
      'myavatar-cookie-consent', 'myavatar-theme', 'ph_posthog_flags', 'unrelated',
    ];
    expect(keysToClear(all).sort()).toEqual([
      'avatar-g-agent-premium', 'myavatar-chat:abc', 'myavatar-omni-conversations',
      'myavatar:persona', 'sb-xyz-auth-token',
    ]);
  });

  it('is total on an empty or junk list', () => {
    expect(keysToClear([])).toEqual([]);
    expect(keysToClear([''])).toEqual([]);
  });

  it('every declared prefix actually matches something', () => {
    for (const p of APP_STORAGE_PREFIXES) expect(isAppSessionKey(`${p}-probe`)).toBe(true);
  });
});
