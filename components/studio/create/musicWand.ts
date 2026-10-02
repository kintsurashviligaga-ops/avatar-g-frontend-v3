/**
 * components/studio/create/musicWand.ts — the two round wand buttons of the Create screen, as plain functions.
 *
 *   · Lyrics wand → POST /api/ai/lyrics   { theme, language, style }   → lyrics for the song
 *   · Styles wand → POST /api/ai/magic-wand { prompt, kind: 'music' }   → a better description of how it should sound
 *
 * Both routes are signed-in only, rate-limited per IP and per account, and budget-gated. The old Lyrics button swallowed
 * every failure, so a guest or a rate-limited account pressed it and NOTHING happened. Here each outcome is a named
 * reason the screen can say in words: `auth` (sign in), `rate` (429 — wait a minute), `busy` (the platform budget is
 * spent or the helper is down — 503), `fail` (anything else, including an answer that changed nothing).
 *
 * `fetch` is a parameter so the whole table is unit-tested without a network.
 */

export type WandFailure = 'auth' | 'rate' | 'busy' | 'fail';
export type WandResult = { ok: true; text: string } | { ok: false; reason: WandFailure };

type FetchLike = typeof fetch;

function failureOf(status: number): WandFailure {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate';
  if (status === 503) return 'busy';
  return 'fail';
}

async function post(url: string, body: unknown, f: FetchLike, signal?: AbortSignal): Promise<{ res: Response; json: Record<string, unknown> } | null> {
  try {
    const res = await f(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { res, json: json && typeof json === 'object' ? json : {} };
  } catch {
    return null;
  }
}

/** Write lyrics about `theme` in the UI language, in the given style. */
export async function writeLyricsFor(
  o: { theme: string; locale: string; style: string; signal?: AbortSignal },
  f: FetchLike = fetch,
): Promise<WandResult> {
  const r = await post('/api/ai/lyrics', { theme: o.theme.slice(0, 500), language: o.locale, style: o.style.slice(0, 60) }, f, o.signal);
  if (!r) return { ok: false, reason: 'fail' };
  if (!r.res.ok) return { ok: false, reason: failureOf(r.res.status) };
  const lyrics = typeof r.json.lyrics === 'string' ? r.json.lyrics.trim() : '';
  return r.json.success === true && lyrics ? { ok: true, text: lyrics } : { ok: false, reason: 'fail' };
}

/**
 * Rewrite a style description. The route fails SOFT — on any miss it returns the original text — so "the answer is what I
 * sent" is reported as a failure here: the button must never claim to have improved something it did not touch.
 */
export async function enhanceStyleFor(
  o: { text: string; signal?: AbortSignal },
  f: FetchLike = fetch,
): Promise<WandResult> {
  const original = o.text.trim();
  const r = await post('/api/ai/magic-wand', { prompt: original.slice(0, 2000), kind: 'music' }, f, o.signal);
  if (!r) return { ok: false, reason: 'fail' };
  if (!r.res.ok) return { ok: false, reason: failureOf(r.res.status) };
  if (r.json.reason === 'budget_exhausted') return { ok: false, reason: 'busy' };
  const enhanced = typeof r.json.enhanced === 'string' ? r.json.enhanced.trim() : '';
  return enhanced && enhanced !== original ? { ok: true, text: enhanced } : { ok: false, reason: 'fail' };
}
