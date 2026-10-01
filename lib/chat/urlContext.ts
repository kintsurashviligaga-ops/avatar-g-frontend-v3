/**
 * lib/chat/urlContext.ts — when a chat turn gets Gemini's native URL reading (the `url_context` tool).
 *
 * The route asks `wantsUrlContext(latestUserText)`; true sets `GeminiChatConfig.urlContext`, and chatStream adds
 * `google.tools.urlContext({})` beside google_search. Gemini then fetches the pages the user linked (Google's
 * fetcher, not our server — so no SSRF surface here) and reads them as context.
 *
 * ⚠️ DEFAULT OFF: `GEMINI_CHAT_URL_CONTEXT=1` turns it on. google_search + url_context together on the chat's primary
 * model (gemini-3.8-flash) has not been verified live. If Google answers that combination with a 400, chatStream
 * classifies it `bad_request`, which deliberately does NOT rotate to the next model — the whole turn would fail for
 * every message that contains a link. So it stays dark until someone has seen it answer.
 *
 * ⚠️ ONLY A TURN THAT CARRIES A LINK. The tool is per request, and the latest USER message decides — not the history:
 * a link pasted ten turns ago must not keep re-enabling a tool whose fetched pages are billed as input tokens.
 *
 * ⚠️ NO `\b` IN THE PATTERN. ASCII `\b` is about [A-Za-z0-9_] only (it never fires at the end of a Georgian or
 * Cyrillic word), and before the scheme it would only miss a link glued to a Latin letter or digit ("see1https://…").
 * The scheme is matched anywhere; each candidate is then parsed by `URL`, which is the real check.
 */

/** Only the head of a message is scanned: a link is not hiding at character 50 000, and the regex stays cheap. */
const SCAN_CHARS = 32_000;
const MAX_CANDIDATES = 20;
// Bounded quantifier (every quantifier bounded — a pasted megabyte must not backtrack).
// eslint-disable-next-line no-control-regex
const URL_CANDIDATE_RE = /https?:\/\/[^\s<>"'`\u0000-\u001f\u007f]{1,2048}/gi;
/** A public-looking host: a dotted name with an alphabetic (or IDN `xn--`) TLD, or an IPv4 literal. */
const PUBLIC_HOST_RE = /\.(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$|^\d{1,3}(?:\.\d{1,3}){3}$/;

/** True when `text` contains at least one http(s) URL with a real-looking host. */
export function containsHttpUrl(text: unknown): boolean {
  if (typeof text !== 'string' || !text) return false;
  const head = text.slice(0, SCAN_CHARS);
  URL_CANDIDATE_RE.lastIndex = 0;
  let seen = 0;
  for (let m = URL_CANDIDATE_RE.exec(head); m && seen < MAX_CANDIDATES; m = URL_CANDIDATE_RE.exec(head), seen++) {
    // Trailing sentence punctuation is not part of a pasted link ("see https://x.ge/a.").
    const candidate = m[0].replace(/[.,;:!?)\]}»”]+$/u, '');
    try {
      const url = new URL(candidate);
      if ((url.protocol === 'http:' || url.protocol === 'https:') && PUBLIC_HOST_RE.test(url.hostname)) return true;
    } catch {
      /* not a URL — keep looking */
    }
  }
  return false;
}

/** `GEMINI_CHAT_URL_CONTEXT` is exactly `1` (read per call, so a Vercel env flip needs no code change). */
export function urlContextEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.GEMINI_CHAT_URL_CONTEXT ?? '').trim() === '1';
}

/** The route's one question: should THIS turn carry the url_context tool? */
export function wantsUrlContext(latestUserText: unknown, env: Record<string, string | undefined> = process.env): boolean {
  return urlContextEnabled(env) && containsHttpUrl(latestUserText);
}
