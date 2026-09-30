/**
 * lib/veo/gcs.ts — Cloud Storage for the Vertex Veo transport (docs/VEO_ENGINE.md §1, §5).
 *
 *   • Outputs: Vertex writes `…/sample_N.mp4` under the `parameters.storageUri` we pass (veoOutputPrefix).
 *   • Inputs: first/last frames and reference images are uploaded to `inputs/{session}/` and handed to Vertex as
 *     `gcsUri`, so no base64 rides in the predictLongRunning body (uploadVeoInput).
 *   • Delivery: a V4 signed read URL for the finished clip (signedReadUrl).
 *
 * Auth is the one Vertex identity from vertexAuth. Errors are VeoGcsError with sanitised messages — never the input
 * URL (it may itself be a signed URL), a signed URL, a token or base64.
 */
import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { Storage } from '@google-cloud/storage';
import type { GoogleAuth } from 'google-auth-library';
import { isPublicHttpUrl, readBodyWithCap } from '@/lib/security/allowlistedAudioFetch';
import { getVertexGoogleAuth, isValidGcsBucketName, redactSecrets, vertexConfig } from './vertexAuth';
import type { VeoMedia, VertexConfig } from './types';

/** Largest input image we accept (docs/VEO_ENGINE.md §5): a first frame is never legitimately bigger, and it bounds memory. */
export const VEO_INPUT_MAX_BYTES = 20 * 1024 * 1024;
export const VEO_INPUT_FETCH_TIMEOUT_MS = 15_000;
export const SIGNED_URL_DEFAULT_TTL_SEC = 3600;
export const SIGNED_URL_MIN_TTL_SEC = 60;
/** V4 signatures are valid for at most 7 days (Cloud Storage signed-URL docs); the library throws above it. */
export const SIGNED_URL_MAX_TTL_SEC = 604_800;
const MAX_REDIRECTS = 3;

/** Veo's documented image input types. WebP/GIF/HEIC are rejected rather than silently transcoded. */
export type VeoInputMime = 'image/jpeg' | 'image/png';

export type VeoGcsErrorCode =
  | 'not_configured'
  | 'invalid_input'
  | 'unsupported_type'
  | 'too_large'
  | 'blocked_url'
  | 'fetch_failed'
  | 'storage_failed';

export class VeoGcsError extends Error {
  readonly code: VeoGcsErrorCode;
  readonly status?: number;
  constructor(code: VeoGcsErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'VeoGcsError';
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

// ── gs:// URIs ────────────────────────────────────────────────────────────────────────────────────────────────────

/** `gs://bucket/some/object` → `{ bucket, path: 'some/object' }` (path '' for the bucket root); null when malformed. */
export function parseGsUri(uri: string): { bucket: string; path: string } | null {
  if (typeof uri !== 'string') return null;
  const m = /^gs:\/\/([^/]+)(?:\/(.*))?$/s.exec(uri.trim());
  if (!m) return null;
  const bucket = m[1] ?? '';
  const path = m[2] ?? '';
  // Object names may not contain CR/LF (GCS naming rules); NUL is never legitimate either.
  if (!isValidGcsBucketName(bucket) || /[\r\n\0]/.test(path)) return null;
  return { bucket, path };
}

/** `toGsUri('b', 'a/c.png')` → `gs://b/a/c.png`. Leading slashes on the path are dropped; a trailing one is kept. */
export function toGsUri(bucket: string, path: string): string {
  if (!isValidGcsBucketName(bucket)) throw new VeoGcsError('invalid_input', 'Invalid GCS bucket name');
  return `gs://${bucket}/${path.replace(/^\/+/, '')}`;
}

const joinPath = (...parts: string[]): string => parts.filter((p) => p.length > 0).join('/');

/** A session id as a single safe path segment: [A-Za-z0-9_-] only, ≤64 chars, never empty. */
function sessionSegment(sessionId: string): string {
  const s = String(sessionId ?? '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 64);
  return s || 'session';
}

function requireConfig(): VertexConfig {
  const cfg = vertexConfig();
  if (!cfg) throw new VeoGcsError('not_configured', 'Vertex AI / GCS is not configured');
  return cfg;
}

/** The configured `gs://bucket[/prefix]` split into the bucket and its (slash-free) prefix. */
function bucketLocation(cfg: VertexConfig): { bucket: string; prefix: string } {
  const parsed = parseGsUri(cfg.bucket);
  if (!parsed) throw new VeoGcsError('not_configured', 'GCP_VEO_BUCKET is malformed');
  return { bucket: parsed.bucket, prefix: parsed.path.replace(/\/+$/, '') };
}

/**
 * Where Vertex writes one clip: `gs://BUCKET/[prefix/]veo/{session}/{ordinal}-{rand}/`. The random suffix means a
 * re-render of the same scene never lands in the prefix of an earlier attempt, where the poller could pick up the
 * old `sample_0.mp4`.
 */
export function veoOutputPrefix(sessionId: string, ordinal: number): string {
  const { bucket, prefix } = bucketLocation(requireConfig());
  const ord = Number.isFinite(ordinal) && ordinal >= 0 ? Math.floor(ordinal) : 0;
  const rand = randomBytes(4).toString('hex');
  return toGsUri(bucket, `${joinPath(prefix, 'veo', sessionSegment(sessionId), `${ord}-${rand}`)}/`);
}

// ── Storage client ────────────────────────────────────────────────────────────────────────────────────────────────

let storageMemo: { auth: GoogleAuth; projectId: string; storage: Storage } | null = null;

/** One Storage per Vertex identity: rebuilt only when vertexAuth rebuilt its clients (config changed). */
function storageFor(cfg: VertexConfig): Storage {
  const auth = getVertexGoogleAuth();
  if (storageMemo && storageMemo.auth === auth && storageMemo.projectId === cfg.projectId) return storageMemo.storage;
  const storage = new Storage({
    projectId: cfg.projectId,
    authClient: auth,
    // The library default retries for up to 600 s — longer than any function that calls this lives.
    retryOptions: { autoRetry: true, maxRetries: 2, totalTimeout: 60 },
  });
  storageMemo = { auth, projectId: cfg.projectId, storage };
  return storage;
}

function storageError(op: 'upload' | 'sign', err: unknown): VeoGcsError {
  const e = (err && typeof err === 'object' ? err : {}) as { code?: unknown; message?: unknown };
  const status = typeof e.code === 'number' && e.code >= 100 && e.code < 600 ? e.code : undefined;
  const detail = typeof e.message === 'string' ? redactSecrets(e.message, 160) : '';
  return new VeoGcsError(
    'storage_failed',
    `GCS ${op} failed${status !== undefined ? ` (HTTP ${status})` : ''}${detail ? `: ${detail}` : ''}`,
    status,
  );
}

// ── Inputs ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Identify an image by its magic bytes — the declared type (header, data URL) is only used to word the error. */
function sniffImageType(b: Buffer): string | null {
  if (b.length >= 8 && b[0] === 0x89 && b.toString('latin1', 1, 8) === 'PNG\r\n\x1a\n') return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.toString('latin1', 0, 6))) return 'image/gif';
  if (b.length >= 12 && b.toString('latin1', 4, 8) === 'ftyp') {
    const brand = b.toString('latin1', 8, 12);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (/^(heic|heix|hevc|mif1|msf1)$/.test(brand)) return 'image/heic';
  }
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
  if (b.length >= 4 && (b.toString('latin1', 0, 4) === 'II*\x00' || b.toString('latin1', 0, 4) === 'MM\x00*')) return 'image/tiff';
  return null;
}

/** A content-type for an error message: `type/subtype` only, lower-cased, or null when absent or odd. */
function mimeLabel(raw: string | null | undefined): string | null {
  const m = (raw ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(m) ? m : null;
}

/**
 * Raster formats Vertex refuses but we can re-encode to JPEG here. ⚠️ The Gemini-API transport forwards a WebP (or a
 * GIF, an AVIF…) inline and Veo accepts it there, so refusing them on Vertex made the SAME film fail the moment the
 * transport switched. HEIC stays refused: the stock sharp build cannot decode HEVC-based HEIC.
 */
const CONVERTIBLE_IMAGE = /^image\/(webp|gif|avif|bmp|tiff)$/;
const KNOWN_UNSUPPORTED_IMAGE = /^image\/(heic|heif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/;

function unsupported(label: string): VeoGcsError {
  return new VeoGcsError('unsupported_type', `Veo image inputs must be JPEG or PNG — got ${label}. Convert the image to JPEG or PNG first.`);
}

/** The image as Vertex takes it: JPEG/PNG as-is, a convertible raster re-encoded to JPEG, anything else refused. */
async function toVeoImage(bytes: Buffer, declared: string | null): Promise<{ bytes: Buffer; mimeType: VeoInputMime }> {
  const sniffed = sniffImageType(bytes);
  if (sniffed === 'image/jpeg' || sniffed === 'image/png') return { bytes, mimeType: sniffed };
  if (sniffed && CONVERTIBLE_IMAGE.test(sniffed)) {
    try {
      const sharp = (await import('sharp')).default;
      // First frame only (an animated GIF/WebP is a still here), EXIF orientation applied, sRGB JPEG.
      const jpeg = await sharp(bytes, { animated: false, limitInputPixels: 50_000_000 }).rotate().jpeg({ quality: 92 }).toBuffer();
      if (jpeg.length > 0 && jpeg.length <= VEO_INPUT_MAX_BYTES) return { bytes: jpeg, mimeType: 'image/jpeg' };
    } catch {
      /* undecodable → refused below, with the type it claimed to be */
    }
  }
  throw unsupported(sniffed ?? (declared ? `unrecognised bytes (declared ${declared})` : 'unrecognised bytes'));
}

/** `data:image/png;base64,…` → bytes media. Only base64 payloads — an image is never sent percent-encoded. */
function mediaFromDataUrl(s: string): { kind: 'bytes'; base64: string; mimeType: string } {
  const comma = s.indexOf(',');
  if (comma < 0) throw new VeoGcsError('invalid_input', 'Malformed data URL');
  const params = s.slice(5, comma).split(';');
  if (!params.slice(1).some((p) => p.trim().toLowerCase() === 'base64')) {
    throw new VeoGcsError('invalid_input', 'Only base64 data URLs are accepted for Veo inputs');
  }
  return { kind: 'bytes', base64: s.slice(comma + 1), mimeType: mimeLabel(params[0]) ?? '' };
}

function mediaFromString(input: string): VeoMedia {
  const s = input.trim();
  if (/^data:/i.test(s)) return mediaFromDataUrl(s);
  if (/^https:\/\//i.test(s)) return { kind: 'url', url: s };
  if (/^gs:\/\//i.test(s)) {
    throw new VeoGcsError('invalid_input', "A gs:// input needs its mimeType — pass { kind: 'gcs', uri, mimeType }");
  }
  throw new VeoGcsError('invalid_input', 'Veo input must be a data: URL, an https URL or a VeoMedia object');
}

/**
 * The input as VeoMedia. A `{ kind: 'url' }` carrying a data: URL is decoded like the string form: the studio hands
 * uploaded images through as url media (lib/chat/ServiceManager.resolveReferenceImages accepts `data:image/…`), and
 * treating one as a fetch target would refuse it as "not a public https URL" on Vertex while the Gemini path
 * (engine.inlineForGemini) decodes the very same input — one input, two verdicts depending on the transport.
 */
function mediaFromInput(media: VeoMedia | string): VeoMedia {
  if (typeof media === 'string') return mediaFromString(media);
  if (media.kind === 'url' && typeof media.url === 'string' && /^\s*data:/i.test(media.url)) {
    return mediaFromDataUrl(media.url.trim());
  }
  return media;
}

function decodeBase64Input(base64: string): Buffer {
  // Reject by the encoded length before allocating: 4 chars → 3 bytes, with slack for line-wrapped base64.
  if (base64.length > Math.ceil((VEO_INPUT_MAX_BYTES * 4) / 3) * 1.05 + 16) {
    throw new VeoGcsError('too_large', 'Veo input image exceeds 20 MB');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > VEO_INPUT_MAX_BYTES) throw new VeoGcsError('too_large', 'Veo input image exceeds 20 MB');
  return bytes;
}

const isTimeout = (err: unknown): boolean =>
  !!err && typeof err === 'object' && ((err as { name?: unknown }).name === 'TimeoutError' || (err as { name?: unknown }).name === 'AbortError');

/**
 * Download a caller-supplied https image. isPublicHttpUrl only vets the URL it is given, so redirects are followed
 * MANUALLY and every hop is re-vetted — a public host 302-ing to 169.254.169.254 is refused, not fetched. One 15 s
 * deadline covers all hops and the body; the body is read under the 20 MB cap as it streams.
 */
async function fetchInputImage(url: string): Promise<{ bytes: Buffer; declared: string | null }> {
  const signal = AbortSignal.timeout(VEO_INPUT_FETCH_TIMEOUT_MS);
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!/^https:\/\//i.test(current) || !isPublicHttpUrl(current)) {
      throw new VeoGcsError('blocked_url', 'Veo input URL must be a public https URL');
    }
    let res: Response;
    try {
      res = await fetch(current, { redirect: 'manual', signal, headers: { accept: 'image/jpeg, image/png, image/webp;q=0.8, image/*;q=0.5' } });
    } catch (err) {
      throw new VeoGcsError('fetch_failed', isTimeout(err) || signal.aborted ? 'Veo input fetch timed out after 15 s' : 'Veo input fetch failed (network error)');
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      await res.body?.cancel().catch(() => undefined);
      if (!location) throw new VeoGcsError('fetch_failed', `Veo input fetch got HTTP ${res.status} without a Location`, res.status);
      try {
        current = new URL(location, current).toString();
      } catch {
        throw new VeoGcsError('fetch_failed', 'Veo input fetch got a malformed redirect');
      }
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new VeoGcsError('fetch_failed', `Veo input fetch failed: HTTP ${res.status}`, res.status);
    }
    const declared = mimeLabel(res.headers.get('content-type'));
    // Refuse before downloading when the server already says it is not a usable image; octet-stream and a missing
    // or merely non-canonical type ('image/jpg') are downloaded and judged by their bytes.
    if (declared && (KNOWN_UNSUPPORTED_IMAGE.test(declared) || (!declared.startsWith('image/') && !/octet-stream$/.test(declared)))) {
      await res.body?.cancel().catch(() => undefined);
      throw unsupported(declared);
    }
    const bytes = await readBodyWithCap(res, VEO_INPUT_MAX_BYTES);
    if (!bytes) {
      if (signal.aborted) throw new VeoGcsError('fetch_failed', 'Veo input fetch timed out after 15 s');
      throw new VeoGcsError('too_large', 'Veo input image exceeds 20 MB (or its download failed)');
    }
    return { bytes, declared };
  }
  throw new VeoGcsError('fetch_failed', `Veo input fetch exceeded ${MAX_REDIRECTS} redirects`);
}

/**
 * Put a Veo image input in our bucket and return it as `{ kind: 'gcs' }` for the Vertex payload.
 *   • `gcs`                 → returned as-is (no I/O).
 *   • `bytes` / data: URL   → decoded (≤20 MB) — a data: URL as a string or inside `{ kind: 'url' }`.
 *   • `url` / https string  → fetched with the SSRF guard, 15 s deadline, 20 MB cap.
 * The bytes must BE a JPEG or PNG (magic bytes, not the declared type); the object is written to
 * `<bucket>/[prefix/]inputs/{session}/{uuid}.{jpg|png}` with that contentType and never overwrites.
 */
export async function uploadVeoInput(
  media: VeoMedia | string,
  opts: { sessionId: string },
): Promise<VeoMedia & { kind: 'gcs' }> {
  const input = mediaFromInput(media);
  if (input.kind === 'gcs') {
    const parsed = parseGsUri(input.uri);
    if (!parsed || !parsed.path || parsed.path.endsWith('/')) {
      throw new VeoGcsError('invalid_input', 'gcs input needs a gs://bucket/object URI');
    }
    return { kind: 'gcs', uri: input.uri.trim(), mimeType: input.mimeType };
  }

  // Configuration first: never download a user's image we then cannot store.
  const cfg = requireConfig();
  const { bucket, prefix } = bucketLocation(cfg);

  let bytes: Buffer;
  let declared: string | null;
  if (input.kind === 'bytes') {
    bytes = decodeBase64Input(input.base64);
    declared = mimeLabel(input.mimeType);
  } else {
    ({ bytes, declared } = await fetchInputImage(input.url));
  }
  if (!bytes.length) throw new VeoGcsError('invalid_input', 'Veo input image is empty');
  const image = await toVeoImage(bytes, declared);
  bytes = image.bytes;
  const mimeType = image.mimeType;

  const objectPath = joinPath(prefix, 'inputs', sessionSegment(opts.sessionId), `${randomUUID()}.${mimeType === 'image/png' ? 'png' : 'jpg'}`);
  try {
    await storageFor(cfg).bucket(bucket).file(objectPath).save(bytes, {
      contentType: mimeType,
      // A ≤20 MB object goes up in one request; resumable sessions add a round trip and mint a session URI that is
      // itself a bearer credential.
      resumable: false,
      // ifGenerationMatch: 0 = "only if the object does not exist": never overwrite, and it makes the write
      // idempotent, which is what lets the library's retry policy retry it.
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { cacheControl: 'private, max-age=0' },
    });
  } catch (err) {
    throw storageError('upload', err);
  }
  return { kind: 'gcs', uri: toGsUri(bucket, objectPath), mimeType };
}

// ── Delivery ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** ttl in whole seconds within [60, 604800]; a non-finite ttl falls back to the 1 h default. */
export function clampSignedUrlTtl(ttlSec: number): number {
  if (!Number.isFinite(ttlSec)) return SIGNED_URL_DEFAULT_TTL_SEC;
  return Math.min(SIGNED_URL_MAX_TTL_SEC, Math.max(SIGNED_URL_MIN_TTL_SEC, Math.floor(ttlSec)));
}

/**
 * A V4 signed GET URL for one object. Key mode signs locally with the RSA key; WIF signs through IAM signBlob as
 * the impersonated service account (see vertexAuth BuiltClients). The URL is a bearer credential: never log it.
 */
export async function signedReadUrl(gsUri: string, ttlSec: number = SIGNED_URL_DEFAULT_TTL_SEC): Promise<string> {
  const parsed = parseGsUri(gsUri);
  if (!parsed || !parsed.path || parsed.path.endsWith('/')) {
    throw new VeoGcsError('invalid_input', 'signedReadUrl needs a gs://bucket/object URI');
  }
  const cfg = requireConfig();
  const ttl = clampSignedUrlTtl(ttlSec);
  try {
    const [url] = await storageFor(cfg)
      .bucket(parsed.bucket)
      .file(parsed.path)
      .getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + ttl * 1000 });
    return url;
  } catch (err) {
    throw storageError('sign', err);
  }
}
