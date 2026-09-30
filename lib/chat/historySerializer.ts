/**
 * The chat thread → the `messages` array POST /api/chat/gemini accepts. Pure and isomorphic: the browser
 * builds the payload with it, and the route can run the same rules again over an untrusted body
 * (`wireToHistory` then `serializeHistory`).
 *
 * Wire shape, exactly what the route's `toCoreMessages` (app/api/chat/gemini/route.ts) reads today:
 *
 *   { role: 'user',      content: 'text' | [{type:'text',text}, {type:'image',image}, {type:'file',data,mimeType}] }
 *   { role: 'assistant', content: 'text' }        ← ALWAYS a string, see below
 *
 * ⚠️ AN ASSISTANT TURN MUST BE A STRING. The route does `String(m.content)` for every assistant turn, so an
 * array there reaches the model as the literal text "[object Object]". Anything an assistant turn carries
 * besides its text becomes a short text reference.
 *
 * ⚠️ A GENERATED RESULT USED TO BE AN EMPTY MODEL TURN. An image, video or music result bubble has empty
 * `text` and its asset in `imageUrl` / `videoUrl` / `audioUrl`. The old inline mapping sent it as
 * `{role:'assistant', content:''}`. The Google provider drops empty text parts, so Gemini got a model turn
 * with no parts, which plausibly broke every later turn of that thread (not verified live). It also meant
 * the model never knew what it had made, so "make it warmer" had nothing to refer to. Such a turn now reads
 * `[generated image: https://…]`. A turn that has neither text nor an asset (an aborted or failed reply) is
 * dropped, and the two user turns around it are merged so roles still alternate.
 *
 * ⚠️ MEDIA BYTES ONLY IN THE LAST N MEDIA TURNS. This is `lib/chat/mediaWindow.ts`, reused as is (see its
 * header for why a window and not a strip). Older attachments become `[earlier image attachment]`.
 *
 * ⚠️ THE DATA URL'S OWN MIME TYPE WINS, BECAUSE THE AI SDK LETS IT WIN. `convertToLanguageModelV3DataContent`
 * in `ai` takes the media type from the data URL header and only falls back to the part's `mediaType`
 * when the header has none. So a declared `mimeType` that disagrees with the header is ignored downstream
 * anyway. The photo picker is the real case: it re-encodes to JPEG but keeps the original `f.type`
 * (`image/heic`). The one case where the declared type must win is a generic header
 * (`data:application/octet-stream;base64,…`, or an empty `data:;base64,…`). The SDK would send that generic
 * type and ignore ours, so the header is rewritten to the better type found from the declared type, the file
 * name or the kind.
 *
 * ⚠️ DOCUMENT FORMATS GEMINI CANNOT READ INLINE ARE SENT AS A NOTE, NOT AS BYTES. `.docx`, `.xlsx`, `.zip`
 * and unknown `application/octet-stream` files are not on Gemini's inline list (PDF, text/*, JSON, XML,
 * RTF and source code are). UNCERTAIN, not checked live, but very likely: such a part gets the whole request
 * rejected. Because the file stays inside the media window for the next turns too, the thread would keep
 * failing until two newer attachments pushed it out. The user turn instead says
 * `[attached file: report.docx — this format cannot be read here]`, so the model can tell the user.
 * Images, audio and video pass through unchanged, as before.
 *
 * ⚠️ A SIZE BUDGET, OLDEST TURNS FIRST. `maxChars` is roughly tokens × 4 of HISTORY only; the route adds
 * the system prompt on top. Media count as a flat estimate per kind (`MEDIA_CHAR_ESTIMATE`), never by
 * their base64 length. Their bytes are already bounded by the window and by the route's 16 MB body cap.
 * The kept history is always a contiguous suffix, always includes the last user turn even when that turn
 * alone is over the budget, and never starts with an assistant turn. No "[earlier messages omitted]"
 * marker is added. It would be Latin text inside what may be the only kept (and the latest) user turn, and
 * that can flip `detectReplyLocale` away from a short Georgian message.
 *
 * ⚠️ THE MARKERS ARE LATIN TEXT, AND `detectReplyLocale` COUNTS THEM. The route picks the reply language
 * from the newest message that has any letters. Most of the time that is the user's own text. But when
 * the user replies with only an emoji or digits, detection falls back to the previous assistant turn, which
 * may now be `[generated image: https://…]`, and that reads as English. Callers should strip the markers
 * with `stripHistoryMarkers` before detecting the script.
 */

import { mediaCarryingIndices, mediaPlaceholder, MEDIA_WINDOW_TURNS, type TurnLike } from './mediaWindow';

// ─── Shared interface (lib/chat/historySerializer — see the architecture brief) ──────────────────────────

export interface HistoryMedia { kind: 'image' | 'audio' | 'video' | 'pdf' | 'file'; dataUrl?: string; url?: string; mimeType?: string; name?: string }
export interface HistoryMsg { role: 'user' | 'assistant'; text: string; medias?: HistoryMedia[]; imageUrl?: string; videoUrl?: string; audioUrl?: string }
export type WirePart = { type: 'text'; text: string } | { type: 'image'; image: string; mimeType?: string } | { type: 'file'; data: string; mimeType: string; name?: string };
export interface WireMessage { role: 'user' | 'assistant'; content: string | WirePart[] }

/**
 * OmniStudio's attachment shape today: `{dataUrl, mimeType}` with no `kind`. The kind is worked out from
 * the MIME type. It is accepted as well so the OmniStudio change is one line: `serializeHistory(history)`.
 */
export interface LegacyMedia { dataUrl: string; mimeType: string; name?: string }
/** `HistoryMsg`, plus media in OmniStudio's own shape. Every `HistoryMsg[]` is also a valid input. */
export type HistoryMsgInput = Omit<HistoryMsg, 'medias'> & { medias?: ReadonlyArray<HistoryMedia | LegacyMedia> };

export interface SerializeHistoryOptions {
  /** History size budget in characters (≈ tokens × 4). `Infinity` turns trimming off. Default `DEFAULT_HISTORY_MAX_CHARS`. */
  maxChars?: number;
  /** How many of the newest media-bearing user turns send real bytes. Default `MEDIA_WINDOW_TURNS` (2). 0 = none. */
  mediaWindowTurns?: number;
}

/**
 * About 30k tokens of English. Long enough that an ordinary thread (up to 80 turns are kept locally) is
 * never trimmed, so the swap changes nothing for it. Short enough that a pasted-document marathon stops
 * resending its whole tail on every message. Georgian tokenizes worse than English, so the same number of
 * characters is more tokens (UNCERTAIN by how much for Gemini's tokenizer).
 */
export const DEFAULT_HISTORY_MAX_CHARS = 120_000;

/**
 * Flat per-media cost used by the budget, in characters (≈ tokens × 4). An image is about 258 tokens. For
 * audio, video and PDFs the count depends on the length, which we can't see, so these are round
 * estimates. They only decide how many OLD turns fit.
 */
export const MEDIA_CHAR_ESTIMATE: Readonly<Record<HistoryMedia['kind'], number>> = Object.freeze({
  image: 1_100,
  audio: 8_000,
  video: 16_000,
  pdf: 8_000,
  file: 4_000,
});

// ─── MIME helpers ────────────────────────────────────────────────────────────────────────────────────────

const GENERIC_MIMES = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'application/unknown']);

/** Document types Gemini reads inline besides `text/*` (and images, audio and video, which pass as before). */
const INLINE_DOC_MIMES = new Set([
  'application/pdf',
  'application/json',
  'application/xml',
  'application/rtf',
  'application/javascript',
  'application/x-javascript',
  'application/typescript',
  'application/x-typescript',
  'application/x-python',
  'application/x-python-code',
]);

const EXT_MIME: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown', csv: 'text/csv', tsv: 'text/tab-separated-values',
  html: 'text/html', htm: 'text/html', css: 'text/css', xml: 'text/xml', rtf: 'text/rtf', json: 'application/json',
  js: 'text/javascript', mjs: 'text/javascript', ts: 'text/x-typescript', tsx: 'text/x-typescript', py: 'text/x-python',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', weba: 'audio/webm',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mpeg: 'video/mpeg', mpg: 'video/mpeg', avi: 'video/x-msvideo', '3gp': 'video/3gpp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
};

function normalizeMime(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // Drop parameters ("audio/webm;codecs=opus" → "audio/webm"); the type/subtype is what Gemini keys on.
  const base = raw.split(';')[0] ?? '';
  const m = base.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,127}$/.test(m) ? m : '';
}

function mimeFromName(name: string | null | undefined): string {
  if (!name) return '';
  // Only the tail after the last "/" (so a URL path works), without query or fragment.
  const tail = name.split(/[?#]/, 1)[0]?.split('/').pop() ?? '';
  const dot = tail.lastIndexOf('.');
  if (dot < 0 || dot === tail.length - 1) return '';
  return EXT_MIME[tail.slice(dot + 1).toLowerCase()] ?? '';
}

function kindFromMime(mime: string): HistoryMedia['kind'] {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  return 'file';
}

/**
 * True when Gemini accepts this MIME type as inline data: images, audio, video, `text/*`, PDF, JSON,
 * XML, RTF and source code. Generic `application/octet-stream` and Office formats return false.
 */
export function isGeminiInlineMime(mime: string): boolean {
  const m = normalizeMime(mime);
  if (!m || GENERIC_MIMES.has(m)) return false;
  if (/^(image|audio|video|text)\//.test(m)) return true;
  return INLINE_DOC_MIMES.has(m);
}

/**
 * The MIME type declared in a data URL header, lowercased and without parameters. Returns '' for a
 * header without a type, and null when the string is not a data URL.
 */
export function dataUrlMime(src: string): string | null {
  if (typeof src !== 'string' || !/^data:/i.test(src)) return null;
  // Only the header is scanned. Never regex the payload: it can be megabytes.
  const comma = src.indexOf(',', 5);
  if (comma < 0 || comma > 512) return null;
  return normalizeMime(src.slice(5, comma));
}

// ─── Media resolution ────────────────────────────────────────────────────────────────────────────────────

interface ResolvedMedia {
  kind: HistoryMedia['kind'];
  /** A base64 data URL or an http(s) URL that can travel to the route. null = nothing sendable (blob:, empty, non-base64). */
  src: string | null;
  /** The effective MIME type, or '' when unknown. */
  mime: string;
  name: string | null;
  /** Gemini can read it inline: it has a source and a format Gemini accepts. */
  sendable: boolean;
}

const KINDS: ReadonlySet<string> = new Set(['image', 'audio', 'video', 'pdf', 'file']);
const HTTP_RE = /^https?:\/\//i;

function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // A file name goes inside "[…]" on one line: no control characters, newlines or square brackets.
  // eslint-disable-next-line no-control-regex
  const flat = raw.replace(/[\u0000-\u001f\u007f[\]]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  // Array.from so a cap never splits a surrogate pair (an emoji in a file name).
  const chars = Array.from(flat);
  return chars.length > 120 ? `${chars.slice(0, 119).join('')}…` : flat;
}

/**
 * One attachment → what can be sent. Only a base64 data URL or an http(s) link counts as a source.
 * A blob: URL means something only inside the tab that made it. A non-base64 data URL would reach
 * Gemini as garbage, because the AI SDK treats everything after the comma as base64. Raw base64 with no
 * `data:` prefix is not accepted either: no chat client sends it (all of them use FileReader or canvas data
 * URLs), and a relative path such as `/storage/v1/…` looks exactly like it.
 */
function resolveMedia(raw: unknown): ResolvedMedia | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = cleanName(r.name);
  const dataUrl = typeof r.dataUrl === 'string' ? r.dataUrl : '';
  const url = typeof r.url === 'string' ? r.url : '';
  // `dataUrl` wins when both exist (bytes beat a link). OmniStudio does put an https link in `dataUrl`
  // for an image picked from the library, and that is handled as the link it is.
  const candidate = dataUrl || url;

  const declared = normalizeMime(r.mimeType);
  const headerMime = dataUrlMime(candidate);
  const isLink = HTTP_RE.test(candidate);
  const declaredKind = typeof r.kind === 'string' && KINDS.has(r.kind) ? (r.kind as HistoryMedia['kind']) : null;
  // Most trustworthy first: the bytes' own header, then the declared type, then the file name, the
  // link's extension, and last the kind.
  const specific = [
    headerMime ?? '',
    declared,
    mimeFromName(name),
    isLink ? mimeFromName(candidate) : '',
    declaredKind === 'pdf' ? 'application/pdf' : '',
  ].find((m) => m && !GENERIC_MIMES.has(m)) ?? '';
  const mime = specific || headerMime || declared;
  const kind: HistoryMedia['kind'] = declaredKind ?? (mime ? kindFromMime(mime) : 'file');

  let src: string | null = null;
  if (headerMime !== null) {
    const comma = candidate.indexOf(',', 5);
    const isBase64 = /;base64$/i.test(candidate.slice(5, comma));
    if (isBase64 && comma < candidate.length - 1) {
      // Rewrite a generic header to the specific type found above. See the file header for why the
      // declared type alone is not enough.
      src = specific && GENERIC_MIMES.has(headerMime)
        ? `data:${specific};base64,${candidate.slice(comma + 1)}`
        : candidate;
    }
  } else if (isLink) {
    src = candidate;
  }

  // Images, audio and video pass through as before. Documents must be a format Gemini reads inline.
  const sendable = !!src && (kind === 'image' || (!!mime && isGeminiInlineMime(mime)));
  return { kind, src, mime, name, sendable };
}

/** The word used in every marker. A PDF is a "file", as `mediaPlaceholder` has always called it. */
function kindLabel(m: ResolvedMedia): 'image' | 'video' | 'audio' | 'file' {
  return m.kind === 'pdf' ? 'file' : m.kind;
}

/** `[earlier image attachment]`, or `[earlier file attachment: report.pdf]` when the name is known. */
function earlierPlaceholder(m: ResolvedMedia): string {
  const label = kindLabel(m);
  // mediaPlaceholder stays the one source of this text; it is fed a MIME type of the right family.
  const base = mediaPlaceholder(label === 'file' ? 'application/octet-stream' : `${label}/*`);
  return m.name ? `${base.slice(0, -1)}: ${m.name}]` : base;
}

/** An in-window attachment the model cannot read: the format isn't accepted, or there are no bytes (blob:). */
function unreadableNote(m: ResolvedMedia): string {
  const label = kindLabel(m);
  // The MIME type only helps for a nameless "file"; "image (image/png)" says nothing new.
  const what = m.name ? `${label}: ${m.name}` : label === 'file' && m.mime ? `${label} (${m.mime})` : label;
  return m.src ? `[attached ${what} — this format cannot be read here]` : `[attached ${what} — not available]`;
}

// ─── Asset references ────────────────────────────────────────────────────────────────────────────────────

const MAX_REF_URL = 2048;

function refUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const u = raw.trim();
  // Only a real link goes into the text. A data: URL would put megabytes of base64 into a text part, and
  // a blob: URL only means something inside the browser tab that made it.
  if (!HTTP_RE.test(u) || u.length > MAX_REF_URL || /\s/.test(u)) return null;
  return u.replace(/\[/g, '%5B').replace(/\]/g, '%5D');
}

function assetRef(role: 'user' | 'assistant', kind: 'image' | 'video' | 'audio', raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const verb = role === 'assistant' ? 'generated' : 'attached';
  const url = refUrl(raw);
  return url ? `[${verb} ${kind}: ${url}]` : `[${verb} ${kind}]`;
}

// ─── Markers ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Matches every marker this module writes (`[generated …]`, `[attached …]`, `[earlier … attachment…]`).
 * Bounded, with no nested quantifiers, so it runs in linear time. Global: reset `lastIndex` or use
 * `stripHistoryMarkers`.
 */
export const HISTORY_MARKER_RE = /\[(?:generated|attached) (?:image|video|audio|file)\b[^\]\n]{0,2200}\]|\[earlier (?:image|video|audio|file) attachment[^\]\n]{0,200}\]/g;

/** Removes the serializer's markers from a text, for script and locale detection. Leaves everything else as it was. */
export function stripHistoryMarkers(text: string): string {
  if (typeof text !== 'string' || !text.includes('[')) return typeof text === 'string' ? text : '';
  return text.replace(HISTORY_MARKER_RE, ' ');
}

// ─── Budget ──────────────────────────────────────────────────────────────────────────────────────────────

function partChars(p: WirePart): number {
  if (p.type === 'text') return p.text.length;
  if (p.type === 'image') return MEDIA_CHAR_ESTIMATE.image;
  return MEDIA_CHAR_ESTIMATE[kindFromMime(normalizeMime(p.mimeType))];
}

/** Estimated size of one wire message in characters (≈ tokens × 4). Media count as `MEDIA_CHAR_ESTIMATE`. */
export function estimateWireChars(m: WireMessage): number {
  if (typeof m.content === 'string') return m.content.length;
  let n = 0;
  for (const p of m.content) n += partChars(p);
  return n;
}

// ─── Serializer ──────────────────────────────────────────────────────────────────────────────────────────

const isBlank = (s: string): boolean => s.trim().length === 0;

function joinText(a: string, b: string, sep: string): string {
  if (!a) return b;
  if (!b) return a;
  return `${a}${sep}${b}`;
}

/**
 * Joins two same-role contents. Text is joined with `sep` into ONE leading text part and the media parts
 * follow in order. That is the same shape a single turn has, so the output reads back identically
 * through `wireToHistory`.
 */
function mergeContent(a: string | WirePart[], b: string | WirePart[], sep: string): string | WirePart[] {
  if (typeof a === 'string' && typeof b === 'string') return joinText(a, b, sep);
  let text = '';
  const media: WirePart[] = [];
  for (const c of [a, b]) {
    if (typeof c === 'string') { text = joinText(text, c, sep); continue; }
    for (const p of c) {
      if (p.type === 'text') text = joinText(text, p.text, sep);
      else media.push(p);
    }
  }
  if (!media.length) return text;
  return text ? [{ type: 'text', text }, ...media] : media;
}

function mediaPart(m: ResolvedMedia): WirePart {
  // `sendable` guarantees src; the non-null assertion is local to this one call site.
  const src = m.src as string;
  if (m.kind === 'image') return m.mime.startsWith('image/') ? { type: 'image', image: src, mimeType: m.mime } : { type: 'image', image: src };
  return m.name ? { type: 'file', data: src, mimeType: m.mime, name: m.name } : { type: 'file', data: src, mimeType: m.mime };
}

function clampOptions(opts: SerializeHistoryOptions | undefined): { maxChars: number; window: number } {
  const mc = opts?.maxChars;
  const maxChars = mc === Infinity ? Infinity : typeof mc === 'number' && Number.isFinite(mc) && mc > 0 ? Math.floor(mc) : DEFAULT_HISTORY_MAX_CHARS;
  const w = opts?.mediaWindowTurns;
  const window = typeof w === 'number' && Number.isInteger(w) && w >= 0 ? Math.min(w, 64) : MEDIA_WINDOW_TURNS;
  return { maxChars, window };
}

/**
 * Chat thread → wire messages for POST /api/chat/gemini.
 *
 * - Never emits an empty turn. A result bubble becomes a text reference (`[generated image: <url>]`).
 *   A turn with nothing in it is dropped.
 * - Consecutive same-role turns are merged, so roles strictly alternate.
 * - Media bytes travel only for the newest `mediaWindowTurns` media-bearing user turns. Older ones become
 *   `[earlier image attachment]`.
 * - Assistant content is always a string.
 * - The oldest turns are trimmed to fit `maxChars`. The last user turn is always kept, and the result
 *   never starts with an assistant turn.
 *
 * Never mutates its input. Tolerates malformed entries (it skips them), so the route can also run it
 * over a request body.
 */
export function serializeHistory(msgs: readonly HistoryMsgInput[], opts?: SerializeHistoryOptions): WireMessage[] {
  const { maxChars, window } = clampOptions(opts);
  const list: ReadonlyArray<unknown> = Array.isArray(msgs) ? msgs : [];

  // 1. Resolve every attachment once. Only USER turns with at least one SENDABLE attachment take a window
  //    slot. An unreadable .docx must not push the photo the user is still talking about out of the window,
  //    and assistant turns never carry bytes (the route turns them into strings).
  const resolved: Array<ResolvedMedia[]> = list.map((m) => {
    const medias = m && typeof m === 'object' ? (m as { medias?: unknown }).medias : undefined;
    if (!Array.isArray(medias)) return [];
    const out: ResolvedMedia[] = [];
    for (const md of medias) {
      const r = resolveMedia(md);
      if (r) out.push(r);
    }
    return out;
  });
  const windowOver = (pick: (r: ResolvedMedia) => boolean): Set<number> => mediaCarryingIndices(
    list.map((m, i): TurnLike => {
      const role = m && typeof m === 'object' ? (m as { role?: unknown }).role : undefined;
      const counts = role === 'user' && (resolved[i] ?? []).some(pick);
      return { role: typeof role === 'string' ? role : '', medias: counts ? [{ dataUrl: '', mimeType: '' }] : undefined };
    }),
    window,
  );
  // `carrying`: the turns whose bytes travel. `recent`: the same window counted over ANY attachment. An
  // unreadable attachment in a recent turn is reported as unreadable, not as "earlier". Every sendable
  // turn in `recent` is also in `carrying`, since fewer media turns follow it.
  const carrying = windowOver((r) => r.sendable);
  const recent = windowOver(() => true);

  // 2. Each turn → one wire message, or nothing.
  const turns: WireMessage[] = [];
  list.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') return;
    const m = raw as Record<string, unknown>;
    const role = m.role;
    if (role !== 'user' && role !== 'assistant') return;
    const text = typeof m.text === 'string' && !isBlank(m.text) ? m.text : '';
    const medias = resolved[i] ?? [];
    const refs = [
      assetRef(role, 'image', m.imageUrl),
      assetRef(role, 'video', m.videoUrl),
      assetRef(role, 'audio', m.audioUrl),
    ].filter((r): r is string => !!r);

    if (role === 'assistant') {
      // Assistant attachments (rare) can only be text: a link when there is one, otherwise the kind.
      const mediaRefs = medias.map((md) => {
        const k = kindLabel(md);
        const url = md.src && HTTP_RE.test(md.src) ? refUrl(md.src) : null;
        return url ? `[generated ${k}: ${url}]` : `[generated ${k}]`;
      });
      const body = [text, ...refs, ...mediaRefs].filter(Boolean).join('\n');
      if (body) turns.push({ role: 'assistant', content: body });
      return;
    }

    // User turn: the typed text first, then a note for each attachment that is not sent as bytes, then
    // the attachments that are, in their original order. All text goes in ONE leading part. That is the
    // shape `wireToHistory` reads back, so running the serializer twice gives the same result.
    const notes: string[] = [];
    const parts: WirePart[] = [];
    for (const md of medias) {
      if (md.sendable && carrying.has(i)) parts.push(mediaPart(md));
      else if (!md.sendable && (carrying.has(i) || recent.has(i))) notes.push(unreadableNote(md));
      else notes.push(earlierPlaceholder(md));
    }
    const lead = [text, ...notes, ...refs].filter(Boolean).join('\n');
    if (!parts.length) {
      if (lead) turns.push({ role: 'user', content: lead });
      return;
    }
    turns.push({ role: 'user', content: lead ? [{ type: 'text', text: lead }, ...parts] : parts });
  });

  // 3. Merge consecutive same-role turns (a dropped empty reply leaves two user turns side by side).
  const merged: WireMessage[] = [];
  for (const t of turns) {
    const last = merged[merged.length - 1];
    if (last && last.role === t.role) merged[merged.length - 1] = { role: t.role, content: mergeContent(last.content, t.content, '\n\n') };
    else merged.push(t);
  }

  // 4. Budget: keep everything from the last user turn on, then add older turns while they fit. The result
  //    is a contiguous suffix, so no turn is skipped out of the middle.
  let lastUser = -1;
  for (let i = merged.length - 1; i >= 0; i--) {
    if (merged[i]?.role === 'user') { lastUser = i; break; }
  }
  let start = 0;
  if (maxChars !== Infinity && lastUser >= 0) {
    start = lastUser;
    let used = 0;
    for (let i = lastUser; i < merged.length; i++) used += estimateWireChars(merged[i] as WireMessage);
    for (let i = lastUser - 1; i >= 0; i--) {
      const cost = estimateWireChars(merged[i] as WireMessage);
      if (used + cost > maxChars) break;
      used += cost;
      start = i;
    }
  }

  // 5. Never start with an assistant turn (a greeting bubble, or the reply whose question was trimmed).
  while (start < merged.length && merged[start]?.role === 'assistant') start++;
  return merged.slice(start);
}

// ─── Wire → history (server-side re-validation) ─────────────────────────────────────────────────────────

/**
 * Reads a request body's `messages` back into `HistoryMsg[]`, so the route can run `serializeHistory` over
 * what the client sent (dropping empty turns, merging roles and enforcing the window and the budget).
 * Tolerates anything. Unknown roles, part types and non-string fields are skipped. The text parts of a turn
 * are joined with a newline, and the image and file parts become attachments in their original order.
 */
export function wireToHistory(raw: unknown): HistoryMsg[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoryMsg[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { role?: unknown; content?: unknown };
    if (e.role !== 'user' && e.role !== 'assistant') continue;
    if (typeof e.content === 'string') { out.push({ role: e.role, text: e.content }); continue; }
    if (!Array.isArray(e.content)) continue;
    const texts: string[] = [];
    const medias: HistoryMedia[] = [];
    for (const p of e.content as unknown[]) {
      if (!p || typeof p !== 'object') continue;
      const part = p as Record<string, unknown>;
      if (part.type === 'text' && typeof part.text === 'string') {
        texts.push(part.text);
      } else if (part.type === 'image' && typeof part.image === 'string') {
        const mt = normalizeMime(part.mimeType);
        const src = part.image;
        medias.push({ kind: 'image', ...(HTTP_RE.test(src) ? { url: src } : { dataUrl: src }), ...(mt ? { mimeType: mt } : {}) });
      } else if (part.type === 'file' && typeof part.data === 'string') {
        const mt = normalizeMime(part.mimeType);
        const src = part.data;
        const name = cleanName(part.name);
        medias.push({
          kind: kindFromMime(mt || dataUrlMime(src) || ''),
          ...(HTTP_RE.test(src) ? { url: src } : { dataUrl: src }),
          ...(mt ? { mimeType: mt } : {}),
          ...(name ? { name } : {}),
        });
      }
    }
    out.push({ role: e.role, text: texts.join('\n'), ...(medias.length ? { medias } : {}) });
  }
  return out;
}
