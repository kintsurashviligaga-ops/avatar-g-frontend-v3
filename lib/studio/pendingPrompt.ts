/**
 * lib/studio/pendingPrompt.ts — the request a guest typed before the studio sent them to sign in, kept across the
 * sign-in so they come back to it (certification §O "return to the workflow after login").
 *
 * ⚠️ GOOGLE SIGN-IN RELOADS THE PAGE. The studio stops a guest's paid request before anything is sent and says "the
 * composer keeps its text" — true for the in-page email code, false for Google: the OAuth round trip is a full
 * navigation, so the prompt and the tool were gone when the person came back signed in. The text and the tool now ride
 * in sessionStorage (this tab only, gone with it), are put back into an EMPTY composer once, and expire after 30 min.
 * Nothing is sent on return: the person presses Generate again, so the price on the button still decides.
 * Attachments are not kept (files do not belong in sessionStorage).
 */
import { isToolId, type ToolId } from '@/lib/studio/tools';

const KEY = 'myavatar:pending-prompt';
export const PENDING_PROMPT_MAX_AGE_MS = 30 * 60_000;
const MAX_CHARS = 4000;

export interface PendingPrompt {
  text: string;
  tool: ToolId;
  at: number;
}

function store(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** Keep what a guest typed (and the tool it was for) before sending them to sign in. Empty text keeps nothing. */
export function stashPendingPrompt(text: string, tool: ToolId, now: number = Date.now()): void {
  const t = text.trim().slice(0, MAX_CHARS);
  if (!t) return;
  try { store()?.setItem(KEY, JSON.stringify({ text: t, tool, at: now })); } catch { /* full or blocked: nothing kept */ }
}

/** Forget it (the person sent something signed in, so the old request is done or replaced). */
export function clearPendingPrompt(): void {
  try { store()?.removeItem(KEY); } catch { /* ignore */ }
}

/** The kept request, ONCE: reading removes it. Null when there is none, it is malformed or older than 30 min. */
export function takePendingPrompt(now: number = Date.now()): PendingPrompt | null {
  const s = store();
  if (!s) return null;
  let raw: string | null = null;
  try { raw = s.getItem(KEY); s.removeItem(KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<PendingPrompt>;
    const text = typeof p.text === 'string' ? p.text.trim().slice(0, MAX_CHARS) : '';
    const at = typeof p.at === 'number' ? p.at : NaN;
    if (!text || !isToolId(p.tool) || !(now - at >= 0 && now - at <= PENDING_PROMPT_MAX_AGE_MS)) return null;
    return { text, tool: p.tool, at };
  } catch {
    return null;
  }
}
