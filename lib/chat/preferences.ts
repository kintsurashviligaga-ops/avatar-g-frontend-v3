'use client';

/**
 * lib/chat/preferences.ts
 * =======================
 * SSR-safe, persisted user preferences for the `/dashboard` chat surface —
 * the client-side foundation behind the Settings modal. Matches the Tier-1
 * pattern: a single small JSON blob in localStorage, read once on mount and
 * written on every change.
 *
 *   • submitOnEnter      — Enter sends (Shift+Enter = newline) vs. Enter =
 *                          newline (⌘/Ctrl+Enter sends). Default: send on Enter.
 *   • autoplayMedia      — auto-play generated video/audio inline. Default off
 *                          (respects data + battery; mobile browsers gate it).
 *   • customInstructions — a global directive appended to the agent's system
 *                          prompt so the user can personalise behaviour.
 */

export interface ChatPreferences {
  submitOnEnter: boolean;
  autoplayMedia: boolean;
  customInstructions: string;
}

export const DEFAULT_PREFERENCES: ChatPreferences = {
  submitOnEnter: true,
  autoplayMedia: false,
  customInstructions: '',
};

/** Hard cap so a runaway instruction can't bloat every request / the store. */
export const MAX_CUSTOM_INSTRUCTIONS = 2000;

const STORAGE_KEY = 'myavatar.preferences.v1';

function hasStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

/** Coerce arbitrary parsed JSON into a complete, valid preferences object. */
export function normalizePreferences(raw: unknown): ChatPreferences {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PREFERENCES };
  const r = raw as Partial<Record<keyof ChatPreferences, unknown>>;
  return {
    submitOnEnter: typeof r.submitOnEnter === 'boolean' ? r.submitOnEnter : DEFAULT_PREFERENCES.submitOnEnter,
    autoplayMedia: typeof r.autoplayMedia === 'boolean' ? r.autoplayMedia : DEFAULT_PREFERENCES.autoplayMedia,
    customInstructions:
      typeof r.customInstructions === 'string'
        ? r.customInstructions.slice(0, MAX_CUSTOM_INSTRUCTIONS)
        : DEFAULT_PREFERENCES.customInstructions,
  };
}

export function loadPreferences(): ChatPreferences {
  if (!hasStorage()) return { ...DEFAULT_PREFERENCES };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    return normalizePreferences(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(prefs: ChatPreferences): ChatPreferences {
  const normalized = normalizePreferences(prefs);
  if (hasStorage()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      /* quota / disabled — preferences just won't persist this session */
    }
  }
  return normalized;
}
