/**
 * scrape_webpage — STEP 3 agent tool (the agent's "browser" leg).
 *
 * Fetches a URL and extracts readable text (readability-style: drop script/style/nav/svg,
 * collapse tags to text) so the ReAct loop can build a research context before any media
 * step. Bounded (timeout + byte cap + output cap), robots-aware, and NEVER throws — returns
 * a typed structured result. JS-heavy / anti-bot sites (TikTok, IG) are unreliable to scrape;
 * prefer official search APIs for those (the agent is told this via the tool description).
 *
 * The extraction (`htmlToReadableText`) is a pure function → unit-testable with no network.
 */
import { z } from 'zod';
import { isPublicHttpUrl } from '@/lib/security/allowlistedAudioFetch';

export const scrapeWebpageInput = z.object({
  url: z.string().url(),
  maxChars: z.number().int().positive().max(20000).optional(),
});
export type ScrapeWebpageInput = z.infer<typeof scrapeWebpageInput>;

export interface ScrapeResult {
  ok: boolean;
  url: string;
  title?: string;
  text?: string;
  chars?: number;
  error?: string;
}

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 3 * 1024 * 1024; // don't ingest multi-MB pages
const DEFAULT_MAX_CHARS = 8000;

/** Strip a document down to readable text. Pure — safe to unit-test. */
export function htmlToReadableText(html: string, maxChars = DEFAULT_MAX_CHARS): { title?: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.replace(/\s+/g, ' ').trim();
  const text = html
    // remove non-content elements entirely (including their contents)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // block elements → newlines so paragraphs survive
    .replace(/<\/(p|div|section|article|li|h[1-6]|br|tr)>/gi, '\n')
    // drop remaining tags
    .replace(/<[^>]+>/g, ' ')
    // decode the few entities that matter for readability
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    // collapse whitespace, keep paragraph breaks
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .replace(/^\s+|\s+$/g, '');
  return { ...(title ? { title } : {}), text: text.slice(0, maxChars) };
}

/** Fetch + extract. Fail-soft: always resolves a ScrapeResult, never throws. */
export async function scrapeWebpage(input: ScrapeWebpageInput): Promise<ScrapeResult> {
  const parsed = scrapeWebpageInput.safeParse(input);
  if (!parsed.success) return { ok: false, url: String((input as { url?: unknown })?.url ?? ''), error: 'invalid url' };
  const { url } = parsed.data;
  // SSRF: reject internal-network hosts before the fetch. (redirect:'follow' below still trusts resolved
  // hops — a redirect-safe walk is the stricter GATED fix; this blocks the direct-private/metadata case.)
  if (!isPublicHttpUrl(url)) return { ok: false, url, error: 'blocked host' };
  const maxChars = parsed.data.maxChars ?? DEFAULT_MAX_CHARS;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'MyAvatarBot/1.0 (+https://myavatar.ge)' }, redirect: 'follow' });
    if (!res.ok) return { ok: false, url, error: `HTTP ${res.status}` };
    const ctype = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(ctype)) return { ok: false, url, error: `unsupported content-type: ${ctype.split(';')[0] || 'unknown'}` };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_HTML_BYTES) return { ok: false, url, error: 'page too large' };
    const { title, text } = htmlToReadableText(buf.toString('utf-8'), maxChars);
    if (!text) return { ok: false, url, error: 'no readable text' };
    return { ok: true, url, ...(title ? { title } : {}), text, chars: text.length };
  } catch (err) {
    const aborted = ac.signal.aborted;
    return { ok: false, url, error: aborted ? 'timeout' : err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
