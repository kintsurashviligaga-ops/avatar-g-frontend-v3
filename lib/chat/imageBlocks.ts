/**
 * imageBlocks — turn an assistant reply's raw text into renderable pieces.
 *
 * Chat models sometimes describe a picture as a text placeholder like `[Image: a photorealistic donkey…]`
 * (no real image) or emit a markdown/bare image URL. Rendered verbatim, the placeholder shows as an ugly bracketed
 * "monospace" block. This splits those out so the UI can render real image URLs as `<img>` frames and offer to
 * GENERATE the described (URL-less) ones, leaving clean prose behind.
 *
 * Pure + deterministic (unit-tested); no DOM, no network.
 */

export interface ParsedImageBlocks {
  /** the prose with every image block/placeholder removed + whitespace tidied */
  text: string;
  /** real image URLs found (deduped, in order) — render as <img> */
  urls: string[];
  /** URL-less `[Image: description]` placeholders → offer a "Generate" action */
  prompts: string[];
}

function pushUnique(arr: string[], v: string): void {
  const c = v.trim().replace(/[)\].,]+$/, '');
  if (c && !arr.includes(c)) arr.push(c);
}

// Every quantifier is BOUNDED so the regexes are linear (no catastrophic backtracking / ReDoS): a truncated
// `[image:` streamed with a long whitespace run can no longer freeze the render thread.
const HTTP_URL = /https?:\/\/[^\s)\]]+/i;
const PLACEHOLDER = /\[\s{0,4}(?:image|სურათი|изображение)\s{0,4}:\s{0,4}([^\]\n]{0,600})\]/gi;
const MD_IMAGE = /!\[[^\]\n]{0,200}\]\(\s{0,4}(https?:\/\/[^\s)]{1,2000})\s{0,4}\)/gi;

/**
 * Parse `[Image: …]` placeholders and markdown images out of an assistant reply.
 *
 * Deliberately NOT extracting bare URLs from prose: a raw link whose path merely ends in `.png` (a Wikipedia
 * `File:` page, a markdown link's href, a tracking redirect) must stay a clickable link, not become a broken <img>.
 * We only lift EXPLICIT image markers.
 */
export function parseImageBlocks(raw: string): ParsedImageBlocks {
  const urls: string[] = [];
  const prompts: string[] = [];
  let text = typeof raw === 'string' ? raw : '';

  // 1) [Image: …] / [სურათი: …] / [изображение: …] — a URL inside ⇒ real image, else a description to (offer to) generate.
  text = text.replace(PLACEHOLDER, (_m, inner: string) => {
    const u = inner.match(HTTP_URL);
    if (u) pushUnique(urls, u[0]);
    else { const p = inner.trim(); if (p) prompts.push(p); }
    return '';
  });

  // 2) markdown images ![alt](url) — NOTE the leading `!`, so a plain markdown LINK [text](url) is left intact.
  text = text.replace(MD_IMAGE, (_m, url: string) => { pushUnique(urls, url); return ''; });

  text = text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text, urls, prompts };
}

/** Does this reply contain an explicit image marker? (cheap, bounded pre-check before the fuller parse) */
export function hasImageBlocks(raw: string): boolean {
  if (typeof raw !== 'string' || !raw) return false;
  return /\[\s{0,4}(?:image|სურათი|изображение)\s{0,4}:/i.test(raw) || /!\[[^\]\n]{0,200}\]\(https?:/i.test(raw);
}
