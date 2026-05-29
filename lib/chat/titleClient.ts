'use client';

/**
 * lib/chat/titleClient.ts
 * =======================
 * Incremental conversation-title generation for the `/dashboard` sidebar — the
 * Tier-1 LLM pattern where a new chat's placeholder title is replaced, a beat
 * later, by a clean ≤4-word summary of the first prompt.
 *
 *   • `sanitizeTitle` is a PURE function (unit-tested): it scrubs raw model
 *     output — surrounding quotes, a leading "Title:" prefix, markdown noise,
 *     trailing punctuation — and clamps to ≤4 words / 48 chars. It NEVER throws
 *     and returns '' when the input is junk, so the caller can fall back to the
 *     deterministic first-prompt title (deriveTitle).
 *   • `generateConversationTitle` calls the fast-tier endpoint (Gemini Flash)
 *     and is fully defensive — any network/parse failure resolves to null so a
 *     title call can never break the chat.
 */

/** Max words in a generated title (directive: "maximum 4-word title"). */
export const MAX_TITLE_WORDS = 4;
/** Hard character cap, matching deriveTitle so the sidebar never overflows. */
export const MAX_TITLE_CHARS = 48;

/**
 * Scrub raw LLM output into a clean, short sidebar title. Pure + total: any
 * input (including empty / multi-line / quoted / markdown) yields a safe string
 * (possibly '').
 */
export function sanitizeTitle(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  // First non-empty line only — models sometimes add a second explanatory line.
  let t = raw
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0) ?? '';

  // Strip a leading "Title:" / "Тема:" / "სათაური:" style prefix.
  t = t.replace(/^\s*(title|тема|სათაური|chat)\s*[:\-–]\s*/i, '');

  // Strip surrounding quotes (straight + curly) and markdown emphasis/backticks.
  t = t.replace(/^["'“”‘’`*_#\s]+/, '').replace(/["'“”‘’`*_\s]+$/, '');

  // Collapse internal whitespace.
  t = t.replace(/\s+/g, ' ').trim();

  // Drop trailing sentence punctuation (a title isn't a sentence).
  t = t.replace(/[.,;:!?…]+$/u, '').trim();

  if (!t) return '';

  // Clamp to MAX_TITLE_WORDS words.
  const words = t.split(' ').filter(Boolean);
  if (words.length > MAX_TITLE_WORDS) t = words.slice(0, MAX_TITLE_WORDS).join(' ');

  // Hard character cap (ellipsised) as a final guard.
  if (t.length > MAX_TITLE_CHARS) t = `${t.slice(0, MAX_TITLE_CHARS).trimEnd()}…`;

  return t;
}

/**
 * Ask the fast LLM tier for a ≤4-word title. Returns the sanitized title, or
 * null on any failure (caller falls back to the deterministic title). Accepts
 * an AbortSignal so a chat-switch / new-chat can cancel an in-flight request.
 */
export async function generateConversationTitle(
  prompt: string,
  locale: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const clean = (prompt || '').trim();
  if (!clean) return null;
  try {
    const res = await fetch('/api/chat/title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal,
      body: JSON.stringify({ prompt: clean.slice(0, 2000), locale }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { title?: unknown };
    if (typeof json.title !== 'string') return null;
    const title = sanitizeTitle(json.title);
    return title || null;
  } catch {
    return null;
  }
}
