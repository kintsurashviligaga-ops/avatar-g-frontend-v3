/**
 * scrape_webpage — STEP 3 agent tool (the agent's "browser" leg).
 *
 * Reads a URL through lib/web/readPage — the same SSRF-safe reader the voice agent uses (every redirect hop re-checked,
 * the connection DNS-pinned to a public address, a byte cap during the download, one deadline) — so the ReAct loop can
 * build a research context before any media step. NEVER throws — returns a typed structured result. JS-heavy /
 * anti-bot sites (TikTok, IG) are unreliable to scrape; prefer official search APIs for those (the agent is told this
 * via the tool description).
 *
 * ⚠️ It used to `fetch(url, { redirect: 'follow' })` after a string check of the FIRST address only: a public page
 * that 302-redirected to 169.254.169.254 or 127.0.0.1 was read, and its text went back in the agent's step trace.
 *
 * `htmlToReadableText` stays as the pure extractor for callers that already hold the HTML.
 */
import { z } from 'zod';
import { readWebPage, type ReadPageOptions } from '@/lib/web/readPage';

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

const SCRAPE_ERROR: Record<string, string> = {
  invalid_url: 'invalid url', blocked_host: 'blocked host', too_many_redirects: 'too many redirects', not_html: 'unsupported content-type',
  too_large: 'page too large', timeout: 'timeout', fetch_failed: 'fetch failed',
};

/** Fetch + extract. Fail-soft: always resolves a ScrapeResult, never throws. `io` is for tests (fetch + DNS). */
export async function scrapeWebpage(input: ScrapeWebpageInput, io: Pick<ReadPageOptions, 'fetchImpl' | 'lookupImpl'> = {}): Promise<ScrapeResult> {
  const parsed = scrapeWebpageInput.safeParse(input);
  if (!parsed.success) return { ok: false, url: String((input as { url?: unknown })?.url ?? ''), error: 'invalid url' };
  const { url } = parsed.data;
  const maxChars = parsed.data.maxChars ?? DEFAULT_MAX_CHARS;
  try {
    const r = await readWebPage(url, { ...io, timeoutMs: FETCH_TIMEOUT_MS, maxBytes: MAX_HTML_BYTES, maxText: maxChars, maxLinks: 0 });
    if (!r.ok) return { ok: false, url, error: r.error === 'http_error' ? `HTTP ${r.status ?? 'error'}` : SCRAPE_ERROR[r.error] ?? r.error };
    const text = r.page.text.slice(0, maxChars);
    if (!text) return { ok: false, url: r.page.url, error: 'no readable text' };
    return { ok: true, url: r.page.url, ...(r.page.title ? { title: r.page.title } : {}), text, chars: text.length };
  } catch (err) {
    return { ok: false, url, error: err instanceof Error ? err.message : String(err) };
  }
}
