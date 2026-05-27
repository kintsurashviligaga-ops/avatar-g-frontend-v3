/**
 * lib/media/extractArtifact.ts
 * =============================
 * Single source of truth for normalizing arbitrary provider outputs
 * (Replicate, OpenAI, ElevenLabs, custom workers) into a MediaArtifact.
 *
 * Supersedes the divergent inline extractors that previously lived in
 * orchestrate/route.ts, providerRouter.ts, ServiceChatShell.tsx, and
 * UnifiedServiceLayout.tsx. Each of those would drop valid outputs in
 * different scenarios (data: URLs, nested objects, mixed arrays, etc.).
 */

export type MediaKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'text'
  | 'analysis'
  | 'unknown';

export interface MediaArtifact {
  /** Logical kind. May be set from a hint when the URL alone is ambiguous. */
  kind: MediaKind;
  /** http(s) URL, data: URL, or null when no addressable asset was found. */
  url: string | null;
  /** Plain text payload (captions, analyses, raw model text). */
  text: string | null;
  /** Optional mime type sniffed from data: URL or upstream payload. */
  mimeType?: string;
  /** Original payload for downstream consumers that need raw access. */
  raw: unknown;
}

const HTTP_RE = /^https?:\/\//i;
const DATA_RE = /^data:([\w.+-]+\/[\w.+-]+)?(?:;[\w.+-]+=[\w.+-]+)*(?:;base64)?,/i;

function isAddressableString(value: unknown): value is string {
  return typeof value === 'string' && (HTTP_RE.test(value) || DATA_RE.test(value));
}

function sniffMime(url: string | null): string | undefined {
  if (!url) return undefined;
  const dataMatch = url.match(DATA_RE);
  if (dataMatch?.[1]) return dataMatch[1];
  const ext = url.split('?')[0]?.split('.').pop()?.toLowerCase();
  if (!ext) return undefined;
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'].includes(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  if (['mp4', 'webm', 'mov', 'm4v', 'mkv'].includes(ext)) return `video/${ext === 'mov' ? 'quicktime' : ext}`;
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'].includes(ext)) return `audio/${ext === 'mp3' ? 'mpeg' : ext}`;
  return undefined;
}

function kindFromUrl(url: string | null, hint?: MediaKind): MediaKind {
  if (hint && hint !== 'unknown') return hint;
  if (!url) return 'unknown';
  const mime = sniffMime(url);
  if (mime?.startsWith('image/')) return 'image';
  if (mime?.startsWith('video/')) return 'video';
  if (mime?.startsWith('audio/')) return 'audio';
  return 'unknown';
}

/**
 * Common candidate keys we walk on plain objects, in priority order.
 * Includes both first-party (`assetUrl`, `output`) and upstream provider
 * conventions (`image`, `video`, `audio`, `src`, `data`, `result`, `urls`).
 */
const CANDIDATE_KEYS = [
  'url',
  'assetUrl',
  'asset_url',
  'asset',
  'image',
  'image_url',
  'imageUrl',
  'video',
  'video_url',
  'videoUrl',
  'audio',
  'audio_url',
  'audioUrl',
  'src',
  'href',
  'output',
  'data',
  'result',
  'response',
  'urls',
  'images',
  'frames',
];

function emptyArtifact(hint?: MediaKind, raw?: unknown): MediaArtifact {
  return { kind: hint ?? 'unknown', url: null, text: null, raw };
}

/**
 * Resolve a MediaArtifact from any provider output.
 *
 * @param input  Arbitrary payload — string, array, object, or null.
 * @param hint   Optional service-derived kind hint used for text-only payloads
 *               (e.g. visual analysis returns plain text and we want kind='analysis').
 */
export function extractMediaArtifact(input: unknown, hint?: MediaKind): MediaArtifact {
  if (input == null) return emptyArtifact(hint, input);

  if (typeof input === 'string') {
    if (isAddressableString(input)) {
      return {
        kind: kindFromUrl(input, hint),
        url: input,
        text: null,
        mimeType: sniffMime(input),
        raw: input,
      };
    }
    return {
      kind: hint === 'analysis' ? 'analysis' : hint && hint !== 'unknown' ? hint : 'text',
      url: null,
      text: input,
      raw: input,
    };
  }

  if (Array.isArray(input)) {
    if (input.length === 0) return emptyArtifact(hint, input);
    // Find first element that yields a URL.
    for (const item of input) {
      const sub = extractMediaArtifact(item, hint);
      if (sub.url) return { ...sub, raw: input };
    }
    // Otherwise concatenate text-bearing entries (visual-ai often returns ['caption text'])
    const texts = input
      .map((item) => (typeof item === 'string' ? item : null))
      .filter((s): s is string => !!s);
    if (texts.length > 0) {
      return {
        kind: hint === 'analysis' ? 'analysis' : hint && hint !== 'unknown' ? hint : 'text',
        url: null,
        text: texts.join('\n'),
        raw: input,
      };
    }
    return emptyArtifact(hint, input);
  }

  if (typeof input === 'object') {
    const obj = input as Record<string, unknown>;

    // Walk candidate keys in priority order. Return the first one that yields
    // an addressable URL or text.
    for (const key of CANDIDATE_KEYS) {
      if (!(key in obj)) continue;
      const sub = extractMediaArtifact(obj[key], hint);
      if (sub.url || sub.text) return { ...sub, raw: input };
    }

    // Recognize {caption}, {text}, {message} as text fallbacks.
    const textFields = ['caption', 'text', 'message', 'description'];
    for (const key of textFields) {
      const value = obj[key];
      if (typeof value === 'string' && value.length > 0) {
        return {
          kind: hint === 'analysis' ? 'analysis' : 'text',
          url: null,
          text: value,
          raw: input,
        };
      }
    }

    return emptyArtifact(hint, input);
  }

  return emptyArtifact(hint, input);
}

/**
 * Best-effort mapping from a service slug to the expected output kind.
 * Drives the `hint` argument and downstream UI selection (image vs video player).
 */
export function mediaKindForService(service: string | null | undefined): MediaKind {
  if (!service) return 'text';
  if (['avatar', 'image', 'photo'].includes(service)) return 'image';
  if (['video', 'editing'].includes(service)) return 'video';
  if (['music', 'voice'].includes(service)) return 'audio';
  if (['visual-ai', 'visual-intel'].includes(service)) return 'analysis';
  return 'text';
}

/**
 * Convenience: pull just a URL out of arbitrary payload using the same rules.
 * Used by API routes that only need the URL slot.
 */
export function extractUrl(input: unknown, hint?: MediaKind): string | null {
  return extractMediaArtifact(input, hint).url;
}

/**
 * Convenience: pull plain text out (captions, analyses) without an asset URL.
 */
export function extractText(input: unknown, hint?: MediaKind): string | null {
  const artifact = extractMediaArtifact(input, hint);
  return artifact.text;
}
