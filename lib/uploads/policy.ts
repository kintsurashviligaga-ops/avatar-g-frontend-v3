/**
 * Upload policy — the ONE definition of what a user may put in the `uploads` bucket, shared by the browser
 * (components/studio/ui/useUpload and the other upload legs), the API routes (/api/upload, /api/upload/sign)
 * and the storage adapter. Isomorphic: no server-only imports.
 *
 * ⚠️ BEFORE THIS, BOTH UPLOAD ROUTES TOOK ANY CONTENT TYPE. /api/upload/sign minted a service-role upload
 * token for `text/html`, `image/svg+xml` or anything else a client named, and nothing capped the size, so a
 * signed-in user could park arbitrary files (pages, scripts, archives) of any size in our storage. The UI only
 * ever uploads pictures, video and audio; that is now all either route accepts, at the 50 MB the UI already
 * enforced. The bucket itself carries the same list and cap (supabase/migrations/20261008a_…), because a
 * signed upload URL is a direct PUT to storage that no route sees.
 *
 * Keep UPLOAD_MIME_ALLOWLIST in step with that migration's `allowed_mime_types` (a test compares them).
 */

/** 50 MB — the cap the UI has always shown ("50MB max"), now enforced by the routes and the bucket too. */
export const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

export const UPLOAD_MIME_ALLOWLIST: readonly string[] = [
  // images
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/avif',
  // video
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp', 'video/3gpp2', 'video/x-matroska',
  'video/x-msvideo', 'video/mpeg', 'video/ogg',
  // audio
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/x-aac', 'audio/wav',
  'audio/x-wav', 'audio/wave', 'audio/vnd.wave', 'audio/webm', 'audio/ogg', 'audio/opus', 'audio/flac',
  'audio/x-flac', 'audio/aiff', 'audio/x-aiff', 'audio/3gpp', 'audio/amr',
];

const ALLOWED = new Set(UPLOAD_MIME_ALLOWLIST);

/** File extension → MIME, for a file the browser could not type (empty `file.type`) or a generic octet-stream. */
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  heic: 'image/heic', heif: 'image/heif', avif: 'image/avif',
  mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska',
  avi: 'video/x-msvideo', '3gp': 'video/3gpp', mpg: 'video/mpeg', mpeg: 'video/mpeg', ogv: 'video/ogg',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg',
  opus: 'audio/opus', flac: 'audio/flac', aif: 'audio/aiff', aiff: 'audio/aiff', amr: 'audio/amr',
};

/** MIME → the extension the object is stored under. */
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/heic': 'heic', 'image/heif': 'heif', 'image/avif': 'avif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-m4v': 'm4v', 'video/3gpp': '3gp',
  'video/3gpp2': '3g2', 'video/x-matroska': 'mkv', 'video/x-msvideo': 'avi', 'video/mpeg': 'mpg', 'video/ogg': 'ogv',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a',
  'audio/aac': 'aac', 'audio/x-aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/vnd.wave': 'wav', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/opus': 'opus', 'audio/flac': 'flac',
  'audio/x-flac': 'flac', 'audio/aiff': 'aiff', 'audio/x-aiff': 'aiff', 'audio/3gpp': '3gp', 'audio/amr': 'amr',
};

const GENERIC = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'application/binary']);

/** `Audio/WebM; codecs=opus` → `audio/webm`. */
export function baseMime(contentType: string | null | undefined): string {
  return String(contentType ?? '').split(';')[0]!.trim().toLowerCase();
}

function extOf(name: string | null | undefined): string {
  const m = /\.([a-z0-9]{2,5})$/i.exec(String(name ?? '').split(/[?#]/)[0] ?? '');
  return m ? m[1]!.toLowerCase() : '';
}

/**
 * The content type a file is stored under: its own type when that is specific, else the type its NAME implies
 * (an empty `file.type`, or a provider that answered `application/octet-stream`). Parameters are dropped.
 * Never invents a type: an unknown name keeps the generic type.
 */
export function storageContentType(contentType: string | null | undefined, name?: string | null): string {
  const base = baseMime(contentType);
  if (!GENERIC.has(base)) return base;
  return MIME_BY_EXT[extOf(name)] ?? (base || 'application/octet-stream');
}

/** The allowlisted MIME a user upload is stored as, or null when it is not an image, a video or audio. */
export function allowedUploadMime(contentType: string | null | undefined, name?: string | null): string | null {
  const ct = storageContentType(contentType, name);
  return ALLOWED.has(ct) ? ct : null;
}

export function isAllowedUploadMime(contentType: string | null | undefined): boolean {
  return ALLOWED.has(baseMime(contentType));
}

/** The extension for an object of this (allowlisted) type. */
export function uploadExtFor(contentType: string): string {
  return EXT_BY_MIME[baseMime(contentType)] ?? 'bin';
}
