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
  /** the prose with every media block/placeholder removed + whitespace tidied */
  text: string;
  /** real image URLs found (deduped, in order) — render as <img> */
  urls: string[];
  /** URL-less `[Image: description]` placeholders → offer a "Generate" action */
  prompts: string[];
  /** real audio/music URLs found (deduped, in order) — render as a native player */
  audioUrls: string[];
}

function pushUnique(arr: string[], v: string): void {
  const c = v.trim().replace(/[)\].,]+$/, '');
  if (c && !arr.includes(c)) arr.push(c);
}

/**
 * Strip raw <audio>/<source> HTML → audioUrls, but ONLY when a real https track URL is present. A URL-less block
 * (a relative-src demo or an HTML code EXAMPLE) is kept verbatim — a genuine generated-track player ALWAYS carries
 * an https CDN URL, so this loses zero real players while honouring "never delete legit prose". `seg` is already
 * OUTSIDE any fenced code block (the caller skips fences), so tutorial code stays intact too.
 */
function stripAudioHtml(seg: string, audioUrls: string[]): string {
  return seg
    .replace(AUDIO_HTML_BLOCK, (block) => { const u = block.match(MEDIA_SRC); if (!u || !u[1]) return block; pushUnique(audioUrls, u[1]); return ''; })
    .replace(AUDIO_ORPHAN_TAG, (tag) => { const u = tag.match(MEDIA_SRC); if (!u || !u[1]) return tag; pushUnique(audioUrls, u[1]); return ''; });
}

// Every quantifier is BOUNDED so the regexes are linear (no catastrophic backtracking / ReDoS): a truncated
// `[image:` streamed with a long whitespace run can no longer freeze the render thread.
const HTTP_URL = /https?:\/\/[^\s)\]]+/i;
// `(?<!!)` + `(?!\()` ensure a placeholder is a STANDALONE bracket — never the alt of a markdown image `![...](...)`
// nor the text of a markdown link `[...](...)`, so those are left for MD_IMAGE / Markdown to handle intact.
const PLACEHOLDER = /(?<!!)\[\s{0,4}(?:image|სურათი|изображение)\s{0,4}:\s{0,4}([^\]\n]{0,600})\](?!\()/gi;
const AUDIO_PLACEHOLDER = /(?<!!)\[\s{0,4}(?:audio|music|track|აუდიო|მუსიკა|музыка|трек)\s{0,4}:\s{0,4}([^\]\n]{0,600})\](?!\()/gi;
const MD_IMAGE = /!\[[^\]\n]{0,200}\]\(\s{0,4}(https?:\/\/[^\s)]{1,2000})\s{0,4}\)/gi;
// Raw <audio …>…</audio> / <source src> HTML the CHAT MODEL sometimes emits verbatim for a generated track — it
// would otherwise leak as un-rendered markup in the bubble. Every quantifier BOUNDED (no ReDoS on a truncated tag).
// The tag-attribute bound (2100) must EXCEED MEDIA_SRC's URL bound (2000) so a long signed CDN URL (base + ?token=
// <~300-char JWT>) inside the tag still matches — a 300 cap silently dropped those and leaked the raw markup.
const MEDIA_SRC = /\bsrc\s{0,4}=\s{0,4}["']?(https?:\/\/[^\s"'>]{1,2000})/i;
const AUDIO_HTML_BLOCK = /<audio\b[^>]{0,2100}>[\s\S]{0,3000}?<\/audio>/gi; // a full <audio>…</audio> element
const AUDIO_ORPHAN_TAG = /<\/?(?:audio|source)\b[^>]{0,2100}\/?>/gi;        // self-closing / stray <audio>, <source>, </audio>
// Fenced code (``` … ``` / ~~~ … ~~~), bounded. Media stripping SKIPS these so an HTML tutorial that shows an
// <audio>/<source> example is never mangled (Markdown renders fenced content literally anyway).
const CODE_FENCE = /(?:```|~~~)[\s\S]{0,20000}?(?:```|~~~)/g;

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
  const audioUrls: string[] = [];
  let text = typeof raw === 'string' ? raw : '';

  // 1) [Image: …] / [სურათი: …] / [изображение: …] — a URL inside ⇒ real image, else a description to (offer to) generate.
  text = text.replace(PLACEHOLDER, (_m, inner: string) => {
    const u = inner.match(HTTP_URL);
    if (u) pushUnique(urls, u[0]);
    else { const p = inner.trim(); if (p) prompts.push(p); }
    return '';
  });

  // 2) [Audio: url] / [Music: url] — a real track URL becomes a native player. A URL-LESS bracket (e.g. a
  //    "[music: jazz]" description or citation) is LEFT INTACT so we never delete legit prose.
  text = text.replace(AUDIO_PLACEHOLDER, (m, inner: string) => {
    const u = inner.match(HTTP_URL);
    if (!u) return m; // no URL → not a media object, keep the original text
    pushUnique(audioUrls, u[0]);
    return '';
  });

  // 2b) Raw <audio …>…</audio> HTML → lift the track URL into the native player and STRIP the markup, so a model
  //     that answers with a literal <audio controls><source src=…></audio> never leaks raw tags into the bubble.
  //     Applied ONLY to prose OUTSIDE fenced code blocks (an HTML tutorial's ```<audio>…</audio>``` is left intact),
  //     and only when a real https URL is present (stripAudioHtml keeps URL-less example markup verbatim).
  {
    const parts: string[] = [];
    let last = 0;
    for (const m of text.matchAll(CODE_FENCE)) {
      const idx = m.index ?? 0;
      parts.push(stripAudioHtml(text.slice(last, idx), audioUrls)); // transform the prose before this fence
      parts.push(m[0]);                                             // keep the fenced code verbatim
      last = idx + m[0].length;
    }
    parts.push(stripAudioHtml(text.slice(last), audioUrls));        // transform the trailing prose
    text = parts.join('');
  }

  // 3) markdown images ![alt](url) — NOTE the leading `!`, so a plain markdown LINK [text](url) is left intact.
  text = text.replace(MD_IMAGE, (_m, url: string) => { pushUnique(urls, url); return ''; });

  text = text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text, urls, prompts, audioUrls };
}

/** Does this reply contain an explicit image/audio marker? (cheap, bounded pre-check before the fuller parse) */
export function hasImageBlocks(raw: string): boolean {
  if (typeof raw !== 'string' || !raw) return false;
  return /\[\s{0,4}(?:image|სურათი|изображение)\s{0,4}:/i.test(raw)
    || /\[\s{0,4}(?:audio|music|track|აუდიო|მუსიკა|музыка|трек)\s{0,4}:/i.test(raw)
    || /!\[[^\]\n]{0,200}\]\(https?:/i.test(raw)
    || /<(?:audio|source)\b/i.test(raw); // a raw <audio>/<source> HTML tag must trigger the parse+strip path
}
