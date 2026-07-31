/**
 * lib/auth/sessionCleanup.ts — wipe every trace of a session on sign-out.
 *
 * WHY THIS EXISTS: sign-out was `supabase.auth.signOut()` and nothing else, in EIGHT separate places.
 * That clears the auth cookies and leaves everything the app actually keeps about a person untouched —
 * chat history (`myavatar-omni-conversations`, `myavatar-chat:*`), the selected persona, drafts, job
 * state, library caches. Signing back in — or worse, a DIFFERENT person signing in on the same device —
 * landed in the previous user's conversations.
 *
 * The key-selection half is PURE and exported so the preserve/remove decision is unit-tested rather than
 * asserted. Getting it wrong in either direction is bad: too little and data leaks between accounts, too
 * much and we wipe a legally meaningful cookie-consent record.
 */

/**
 * Prefixes owned by this app. Anything matching is session/user data and goes.
 * `sb-` is Supabase's own cookie/storage namespace — signOut() normally clears it, but a failed or
 * offline signOut must not leave a stale token behind.
 */
export const APP_STORAGE_PREFIXES = ['myavatar', 'omni', 'avatar-g', 'avatar_g', 'sb-'] as const;

/**
 * Deliberately SURVIVES sign-out. Neither is user data:
 *  · cookie consent is a per-DEVICE legal record — clearing it silently re-prompts and, worse, discards
 *    proof that consent was given.
 *  · theme is a per-device display preference; resetting someone's dark mode because they logged out is
 *    not privacy, it is a bug.
 */
export const PRESERVED_KEYS = ['myavatar-cookie-consent', 'myavatar-theme'] as const;

/** Does this storage key belong to the app's session data? Pure. */
export function isAppSessionKey(key: string): boolean {
  if (!key) return false;
  if ((PRESERVED_KEYS as readonly string[]).includes(key)) return false;
  const lower = key.toLowerCase();
  return APP_STORAGE_PREFIXES.some((p) => lower.startsWith(p));
}

/**
 * Given every key present in a storage area, return the ones to delete. Pure — the caller does the I/O.
 * Exported for tests; the whole point is that this decision is verifiable without a browser.
 */
export function keysToClear(allKeys: readonly string[]): string[] {
  return allKeys.filter(isAppSessionKey);
}

/** Remove every app key from one Storage area. Never throws (private mode, quota, disabled storage). */
function clearStorage(store: Storage | undefined): number {
  if (!store) return 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const k = store.key(i);
      if (k) keys.push(k);
    }
    const doomed = keysToClear(keys);
    for (const k of doomed) {
      try { store.removeItem(k); } catch { /* keep going; one failure must not abort the wipe */ }
    }
    return doomed.length;
  } catch {
    return 0;
  }
}

/**
 * Expire every cookie this document can see.
 *
 * NOTE THE LIMIT, because it matters: httpOnly cookies — which is what Supabase's auth cookies are —
 * are invisible to `document.cookie` and CANNOT be removed here. Those are cleared by `signOut()` and,
 * as a backstop, by the server route below. This pass exists for the non-httpOnly leftovers.
 */
function clearCookies(): number {
  if (typeof document === 'undefined') return 0;
  let n = 0;
  try {
    for (const chunk of document.cookie.split(';')) {
      const name = chunk.split('=')[0]?.trim();
      if (!name || !isAppSessionKey(name)) continue;
      // Expire on every plausible path/domain scope — a cookie set on `.myavatar.ge` is not removed by
      // expiring it on the bare host.
      const host = window.location.hostname;
      for (const domain of ['', `; domain=${host}`, `; domain=.${host}`]) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`;
      }
      n += 1;
    }
  } catch { /* cookies disabled */ }
  return n;
}

export interface CleanupResult {
  localKeys: number;
  sessionKeys: number;
  cookies: number;
}

/**
 * Wipe local session state. Safe to call before OR after `signOut()`, and safe on the server (no-op).
 */
export function clearLocalSessionState(): CleanupResult {
  if (typeof window === 'undefined') return { localKeys: 0, sessionKeys: 0, cookies: 0 };
  return {
    localKeys: clearStorage(window.localStorage),
    sessionKeys: clearStorage(window.sessionStorage),
    cookies: clearCookies(),
  };
}

/** Minimal shape we need — avoids importing the Supabase types into a module that is otherwise pure. */
interface SignOutable {
  auth: { signOut: () => Promise<unknown> };
}

/**
 * THE sign-out path. Every button must call this rather than `supabase.auth.signOut()` directly.
 *
 * ORDER MATTERS: the local wipe runs in a `finally`, so a signOut that throws (offline, expired token,
 * unconfigured Supabase) still leaves the device clean. The opposite order would let a network failure
 * strand the previous user's chat history on a shared machine.
 */
export async function signOutAndClear(client: SignOutable | null | undefined): Promise<CleanupResult> {
  try {
    await client?.auth?.signOut();
  } catch {
    // Best-effort: the local wipe below is the part that actually protects the next person.
  } finally {
    // Tell any mounted surface to drop its in-memory copy — several components hold conversations in
    // React state, which no amount of storage clearing would reset on its own.
    try {
      window.dispatchEvent(new Event('myavatar:session-cleared'));
    } catch { /* ignore */ }
  }
  return clearLocalSessionState();
}
