/**
 * lib/chat/assetType.ts
 * =====================
 * PHASE 57 hotfix — the single source of truth for "which media kind should a
 * chat turn render?", isolated in a dependency-free module so it can be unit
 * tested without mounting the (very heavy) MyAvatarChatV2 client component.
 * Mirrors the specialistRouting / interiorRouting split.
 *
 * Why this exists: every inline preview (MessageBubble) and the Preview
 * Workspace gate strictly on `assetType`. Before this fix `assetType` was mapped
 * ONLY from the server's `responseType`, so any turn that returned a perfectly
 * good `assetUrl` while tagging itself 'analysis' / 'action_suggestions' /
 * 'text' — or omitting the field entirely — collapsed to `null` and the preview
 * SILENTLY vanished across EVERY service (image, 30s film, music, audio,
 * interior redesign). That is the "no service shows a preview" regression.
 *
 * The contract:
 *   1. `responseType` is authoritative when it names a media kind.
 *   2. Otherwise sniff the asset itself — data: MIME prefix first (most
 *      authoritative), then the path extension.
 *   3. As a last resort, trust the composer mode that produced the turn, so an
 *      extension-less signed/CDN URL still mounts instead of dropping to text.
 *
 * Pure string inspection only — no `new URL` / `querySelector` / `decodeURI…` —
 * so it can NEVER throw the WebKit "string did not match the expected pattern"
 * SyntaxError that those APIs raise on malformed input.
 */

/** The three renderable media kinds (plus `null` = render as plain text). */
export type RenderableAssetType = 'image' | 'video' | 'audio' | null;

/**
 * Composer modes that imply a media kind when no other signal is available.
 * Kept as a loose string union so this module never imports the component.
 */
export type AssetModeHint =
  | 'global'
  | 'image'
  | 'video'
  | 'music'
  | 'avatar'
  | 'interior'
  | 'voice'
  | string;

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|avif|svg|bmp|heic|heif)(\?|#|$)/i;
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogv|mkv)(\?|#|$)/i;
const AUDIO_EXT_RE = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba)(\?|#|$)/i;
const DATA_MIME_RE = /^data:(image|video|audio)\//i;

/**
 * Resolve the renderable media kind for an orchestrated chat turn.
 *
 * @param responseType the server's advisory `responseType` (authoritative when
 *   it names a media kind; ignored otherwise)
 * @param assetUrl the returned asset URL (data:, blob:, or http(s))
 * @param modeHint the composer mode that produced the turn (last resort)
 */
export function resolveAssetType(
  responseType: string | null | undefined,
  assetUrl: string | null | undefined,
  modeHint?: AssetModeHint,
): RenderableAssetType {
  if (responseType === 'image' || responseType === 'video' || responseType === 'audio') {
    return responseType;
  }

  const url = typeof assetUrl === 'string' ? assetUrl.trim() : '';
  if (!url) return null;

  // data: URIs carry their own MIME type inline — the most authoritative hint.
  const dataKind = DATA_MIME_RE.exec(url)?.[1]?.toLowerCase();
  if (dataKind === 'image' || dataKind === 'video' || dataKind === 'audio') return dataKind;

  // Otherwise sniff the path extension (query string / hash tolerated).
  if (IMAGE_EXT_RE.test(url)) return 'image';
  if (VIDEO_EXT_RE.test(url)) return 'video';
  if (AUDIO_EXT_RE.test(url)) return 'audio';

  // Last resort: trust the mode that produced the turn, so an extension-less
  // signed/CDN URL still mounts instead of dropping to a bare text bubble.
  switch (modeHint) {
    case 'video':
      return 'video';
    case 'music':
      return 'audio';
    case 'image':
    case 'avatar':
      return 'image';
    default:
      return null;
  }
}
