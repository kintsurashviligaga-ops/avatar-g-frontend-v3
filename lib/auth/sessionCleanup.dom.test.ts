/**
 * @jest-environment jsdom
 *
 * Exercises the SHIPPED cleanup against a real Storage implementation, not just the pure predicate.
 * The predicate tests prove which keys are chosen; this proves the function actually removes them —
 * the browser click cannot be driven locally without a live Supabase project.
 */
import { clearLocalSessionState, signOutAndClear } from './sessionCleanup';

const seed = () => {
  localStorage.clear();
  sessionStorage.clear();
  // What a signed-in device actually holds.
  localStorage.setItem('myavatar-omni-conversations', '[{"id":"c1"}]');
  localStorage.setItem('myavatar-omni-current', 'c1');
  localStorage.setItem('myavatar-omni-resume', 'c1');
  localStorage.setItem('myavatar-chat:abc', '{}');
  localStorage.setItem('myavatar:persona', 'analyst');
  localStorage.setItem('myavatar:personas:custom', '[]');
  localStorage.setItem('sb-proj-auth-token', 'tok');
  localStorage.setItem('avatar-g-agent-premium', '1');
  sessionStorage.setItem('myavatar-draft', 'hello');
  // Must survive.
  localStorage.setItem('myavatar-theme', 'dark');
  localStorage.setItem('myavatar-cookie-consent', 'essential');
  // Not ours.
  localStorage.setItem('ph_posthog_flags', '{}');
};

describe('clearLocalSessionState', () => {
  beforeEach(seed);

  it('removes the chat history, persona and stale auth token', () => {
    clearLocalSessionState();
    expect(localStorage.getItem('myavatar-omni-conversations')).toBeNull();
    expect(localStorage.getItem('myavatar-omni-current')).toBeNull();
    expect(localStorage.getItem('myavatar-omni-resume')).toBeNull();
    expect(localStorage.getItem('myavatar-chat:abc')).toBeNull();
    expect(localStorage.getItem('myavatar:persona')).toBeNull();
    expect(localStorage.getItem('myavatar:personas:custom')).toBeNull();
    expect(localStorage.getItem('sb-proj-auth-token')).toBeNull();
    expect(localStorage.getItem('avatar-g-agent-premium')).toBeNull();
  });

  it('clears sessionStorage too, not only localStorage', () => {
    const r = clearLocalSessionState();
    expect(sessionStorage.getItem('myavatar-draft')).toBeNull();
    expect(r.sessionKeys).toBe(1);
  });

  it('KEEPS the consent record, the theme, and other libraries data', () => {
    clearLocalSessionState();
    expect(localStorage.getItem('myavatar-theme')).toBe('dark');
    expect(localStorage.getItem('myavatar-cookie-consent')).toBe('essential');
    expect(localStorage.getItem('ph_posthog_flags')).toBe('{}');
  });

  it('reports what it removed', () => {
    const r = clearLocalSessionState();
    expect(r.localKeys).toBe(8);
  });
});

describe('signOutAndClear', () => {
  beforeEach(seed);

  it('wipes local state even when signOut() REJECTS — the offline case', async () => {
    const client = { auth: { signOut: () => Promise.reject(new Error('network')) } };
    await expect(signOutAndClear(client)).resolves.toBeDefined();
    expect(localStorage.getItem('myavatar-omni-conversations')).toBeNull();
    expect(localStorage.getItem('myavatar-theme')).toBe('dark');
  });

  it('wipes local state when there is no client at all', async () => {
    await signOutAndClear(null);
    expect(localStorage.getItem('myavatar:persona')).toBeNull();
  });

  it('calls signOut when it can, and still clears', async () => {
    let called = false;
    await signOutAndClear({ auth: { signOut: async () => { called = true; } } });
    expect(called).toBe(true);
    expect(localStorage.getItem('myavatar-omni-current')).toBeNull();
  });

  it('notifies mounted surfaces so in-memory conversation state resets too', async () => {
    let heard = false;
    window.addEventListener('myavatar:session-cleared', () => { heard = true; });
    await signOutAndClear(null);
    expect(heard).toBe(true);
  });
});
