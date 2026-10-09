/**
 * lib/web/readPage.ts — read ONE public web page for the voice agent (read_webpage): its title, description, readable
 * text and links. Server-side, because a browser cannot read another site's page (CORS) — and therefore a fetch of a
 * caller-chosen address, so every rule of an SSRF-safe fetch applies:
 *
 *   • the address must pass validateLiveUrl (http/https, no credentials, no localhost / local names / private or
 *     loopback IPv4 literals, no IPv6 literals) — the same rule open_url uses;
 *   • its host must RESOLVE only to public addresses (a public name pointed at 127.0.0.1 or 169.254.169.254 — DNS
 *     rebinding — is refused);
 *   • redirects are followed by hand (redirect: 'manual'), each hop re-checked the same way, at most `maxHops`;
 *   • the connection is pinned: the default fetch connects through a DNS lookup that refuses a private answer
 *     (lib/web/publicFetch.ts — the same walk every caller-chosen fetch uses);
 *   • the body is read under a hard byte cap (readBodyWithCap aborts mid-stream), within a timeout;
 *   • only HTML / XHTML / plain text is read; nothing is executed, nothing is rendered.
 *
 * It never sends cookies or credentials of ours. Pure apart from the injected fetch / DNS, so it is unit-tested offline.
 */
import { readBodyWithCap } from '@/lib/security/allowlistedAudioFetch';
import { fetchPublic, isPrivateAddress } from './publicFetch';

export interface PageLink { text: string; url: string }
export interface ReadPage {
  /** The final address, after redirects. */
  url: string;
  title: string;
  description: string;
  text: string;
  links: PageLink[];
  /** The text was cut at maxText. */
  truncated: boolean;
}
export type ReadPageError = 'invalid_url' | 'blocked_host' | 'too_many_redirects' | 'http_error' | 'not_html' | 'too_large' | 'timeout' | 'fetch_failed';
export type ReadPageResult = { ok: true; page: ReadPage } | { ok: false; error: ReadPageError; status?: number };

type LookupFn = (host: string) => Promise<Array<{ address: string; family: number }>>;
export interface ReadPageOptions {
  fetchImpl?: typeof fetch;
  lookupImpl?: LookupFn;
  timeoutMs?: number;
  maxBytes?: number;
  maxHops?: number;
  maxText?: number;
  maxLinks?: number;
}

const DEFAULTS = { timeoutMs: 8000, maxBytes: 1_500_000, maxHops: 4, maxText: 6000, maxLinks: 40 };

/** Re-exported: the address rule lives with the fetch that enforces it (lib/web/publicFetch.ts). */
export { isPrivateAddress };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', copy: '©', reg: '®', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’' };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const clean = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

function metaContent(html: string, key: string): string {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*>`, 'i');
  const tag = re.exec(html)?.[0];
  const content = tag ? /content=["']([^"']*)["']/i.exec(tag)?.[1] : '';
  return content ? clean(content) : '';
}

/** HTML → its title, description, readable text (the <main>/<article> when there is one) and its http(s) links. */
export function extractPage(html: string, baseUrl: string, maxText: number, maxLinks: number): Omit<ReadPage, 'url'> {
  const noise = /<(script|style|noscript|svg|template|iframe|canvas|object)\b[^>]*>[\s\S]*?<\/\1>/gi;
  const stripped = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(noise, ' ');
  const title = clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(stripped)?.[1] ?? '') || metaContent(stripped, 'og:title');
  const description = metaContent(stripped, 'description') || metaContent(stripped, 'og:description');
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(stripped)?.[1] ?? stripped;
  // The page's own content when it says where that is; otherwise the body without its chrome.
  const main = /<(main|article)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(body)?.[2];
  const region = main && clean(main).length > 200 ? main : body.replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');

  const blocks = region
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer|blockquote|pre|table|ul|ol|dd|dt|figcaption)>/gi, '\n')
    .replace(/<(h[1-6])\b[^>]*>/gi, '\n## ')
    .replace(/<li\b[^>]*>/gi, '\n• ');
  const lines = decodeEntities(blocks.replace(/<[^>]*>/g, ' '))
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter((l) => l && l !== '•' && l !== '##');
  let text = lines.join('\n').replace(/\n{3,}/g, '\n\n');
  const truncated = text.length > maxText;
  if (truncated) text = `${text.slice(0, maxText).replace(/\s+\S*$/, '')} …`;

  const links: PageLink[] = [];
  const seen = new Set<string>();
  for (const m of body.matchAll(/<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (links.length >= maxLinks) break;
    let href: string;
    try { href = new URL(decodeEntities(m[1]!.trim()), baseUrl).href; } catch { continue; }
    if (!/^https?:/i.test(href) || seen.has(href)) continue;
    const label = clean(m[2] ?? '').slice(0, 80) || clean(/aria-label=["']([^"']*)["']/i.exec(m[0])?.[1] ?? '').slice(0, 80);
    if (!label) continue;
    seen.add(href);
    links.push({ text: label, url: href });
  }
  return { title: title.slice(0, 200), description: description.slice(0, 400), text, links, truncated };
}

function charsetOf(contentType: string, head: string): string {
  const fromHeader = /charset=([\w-]+)/i.exec(contentType)?.[1];
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  return (fromHeader || fromMeta || 'utf-8').toLowerCase();
}

/** Read one public page. Never throws. */
export async function readWebPage(rawUrl: string, opts: ReadPageOptions = {}): Promise<ReadPageResult> {
  const o = { ...DEFAULTS, ...opts };
  const got = await fetchPublic(rawUrl, {
    fetchImpl: o.fetchImpl,
    lookupImpl: o.lookupImpl,
    timeoutMs: o.timeoutMs,
    maxHops: o.maxHops,
    headers: {
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
      'Accept-Language': 'ka,en;q=0.8,ru;q=0.6',
    },
  });
  // No `allowUrl` is passed here, so 'refused_url' cannot happen; it reads as a blocked host if it ever did.
  if (!got.ok) return { ok: false, error: got.error === 'refused_url' ? 'blocked_host' : got.error, ...(got.status ? { status: got.status } : {}) };
  const { res, url } = got;

  const type = (res.headers.get('content-type') || '').toLowerCase();
  const isHtml = /text\/html|application\/xhtml\+xml/.test(type);
  const isText = /text\/plain/.test(type);
  if (!isHtml && !isText) {
    void res.body?.cancel().catch(() => undefined);
    return { ok: false, error: 'not_html', status: res.status };
  }

  const buf = await readBodyWithCap(res, o.maxBytes);
  if (!buf) return { ok: false, error: 'too_large' };
  const head = buf.subarray(0, 4096).toString('latin1');
  let body: string;
  try { body = new TextDecoder(charsetOf(type, head)).decode(buf); } catch { body = new TextDecoder('utf-8').decode(buf); }

  if (isText) {
    const truncated = body.length > o.maxText;
    return { ok: true, page: { url, title: '', description: '', text: truncated ? `${body.slice(0, o.maxText)} …` : body, links: [], truncated } };
  }
  return { ok: true, page: { url, ...extractPage(body, url, o.maxText, o.maxLinks) } };
}
