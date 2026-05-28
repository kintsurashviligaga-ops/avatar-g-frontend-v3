/**
 * lib/chat/compositeTaskRef.ts
 * =============================
 * Wire-format for multi-asset composite tasks.
 *
 * The chat shell's poll loop follows one predictionId at a time. For
 * composite pipelines (music-video = lyrics + music + video), we encode
 * the references of ALL async legs into a single base64 token prefixed
 * with `composite:`. `pollOrchestrationTask` decodes and polls each leg
 * in lock-step, reporting the union status.
 *
 *   composite:<base64url(JSON({v, sessionId, createdAt, music, video, lyrics}))>
 *
 * Legs are optional so partial pipelines (music-only, video-only, or
 * lyrics-only) round-trip cleanly through the same format.
 */

export const COMPOSITE_PREFIX = 'composite:';

export interface CompositeTaskRef {
  v: 1;
  sessionId: string;
  createdAt: number;
  /** Udio workId (NOT prefixed with `udio:` — bare). */
  musicWorkId?: string;
  /** ServiceManager taskRef for the LTX/HeyGen video leg. */
  videoTaskRef?: string;
  /** Inline-rendered lyrics, already complete by the time we encode. */
  lyrics?: string | null;
}

function b64urlEncode(s: string): string {
  return Buffer.from(s, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + ((4 - (s.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function encodeCompositeRef(ref: Omit<CompositeTaskRef, 'v'>): string {
  const payload: CompositeTaskRef = { v: 1, ...ref };
  return `${COMPOSITE_PREFIX}${b64urlEncode(JSON.stringify(payload))}`;
}

export function decodeCompositeRef(token: string): CompositeTaskRef | null {
  if (!token.startsWith(COMPOSITE_PREFIX)) return null;
  try {
    const json = b64urlDecode(token.slice(COMPOSITE_PREFIX.length));
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && parsed.v === 1) {
      return parsed as CompositeTaskRef;
    }
    return null;
  } catch {
    return null;
  }
}

export function isCompositeRef(token: string | null | undefined): boolean {
  return typeof token === 'string' && token.startsWith(COMPOSITE_PREFIX);
}
