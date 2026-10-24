/**
 * lib/media/saveMedia.ts — the one way a result leaves the app for the user's device.
 *
 * ⚠️ ON AN IPHONE A DOWNLOAD NEVER REACHES PHOTOS. Safari files every `<a download>` under Files › Downloads, so a picture
 * or a clip "saved" from the chat was not in the camera roll where the owner looked for it (report 2026-10-09 18:36Z). The
 * only door to Photos a web page has is the share sheet: handed the FILE, iOS offers "Save Image" / "Save Video". So on
 * iOS a picture or a video goes to the share sheet; audio (Photos cannot hold it), documents, and every other device keep
 * the ordinary download.
 *
 * The share sheet needs a fresh tap, and fetching a large clip can outlast it. Then nothing is lost: the file is kept and
 * offered once more behind one tap (the `myavatar:save-ready` event, drawn by components/studio/ui/SaveReadyPrompt).
 * Other devices can start our signed Storage attachments after a bounded metadata
 * request, without buffering the full file in JavaScript. `started` is not a
 * transfer-completion acknowledgement; unsupported links retain the byte path.
 *
 * MASTER TASK v3.1 §4.3, on every device:
 *   · A second tap on the same link while it is being saved (a double click) saves one file, not two.
 *   · A link Storage refuses (its token ran out) is replaced once through the caller's `relink` (the Library reads its
 *     page again; nothing is generated or charged) and the save goes on with the fresh link.
 *   · Off an iPhone, the byte path never holds a large file in memory: a file over BUFFER_MAX_BYTES, or a video of
 *     unknown size, opens in a new tab instead ('opened', which no caller treats as saved).
 */

export type SaveOutcome = 'shared' | 'downloaded' | 'started' | 'cancelled' | 'needs-tap' | 'opened';

export interface SaveOptions {
  /** The extension when neither the bytes nor the link name one. */
  fallbackExt?: string;
  /** When the link runs out (an ISO time, e.g. a Library item's `expiresAt`): one already out, or about to be, is replaced first. */
  expiresAt?: string;
  /** A fresh link to the same file, or null. Asked at most once per save, when the link has run out or is refused. */
  relink?: () => Promise<string | null>;
}

/** Storage's answer to a link whose token ran out or is not valid: worth one fresh link. */
const REFUSED = new Set([400, 401, 403]);
/** A link with less than this left is replaced before the save starts (when the caller can replace it). */
const EXPIRY_MARGIN_MS = 30_000;
/** The largest file the byte path reads into memory off an iPhone (an iPhone needs the whole file for its share sheet). */
export const BUFFER_MAX_BYTES = 50 * 1024 * 1024;
/**
 * How long a save that produced a file answers another tap on the same link with the same outcome: the second click of a
 * double click (500 ms at most on common systems) after a save that started at once. A tap after that saves again.
 */
export const SAME_SAVE_MS = 1000;
/** What a Storage attachment may be saved as: media, a 3D model, a PDF, or plain bytes named by the link. Never a page. */
const SAVEABLE = /^(image|video|audio|model)\/|^application\/(pdf|octet-stream)\b/i;

interface ShareNav {
  canShare?: (d: { files?: File[] }) => boolean;
  share?: (d: { files?: File[]; title?: string }) => Promise<void>;
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
}

/** iPhone, iPod, or an iPad (which reports itself as a Mac with a touch screen). */
export function isAppleTouch(nav: ShareNav | undefined): boolean {
  if (!nav) return false;
  const ua = nav.userAgent ?? '';
  if (/iP(hone|od|ad)/.test(ua)) return true;
  return nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1;
}

/** What Photos keeps: pictures and videos. */
export function belongsInPhotos(mime: string): boolean {
  return /^(image|video)\//i.test(mime || '');
}

/** The single extension that matches the bytes (a provider's JPEG behind a ".png" name became "x.png.jpeg" on iOS). */
export function extensionFor(mime: string, url = ''): string {
  const m = (mime || '').toLowerCase();
  const fromMime = /jpe?g/.test(m) ? 'jpg' : /png/.test(m) ? 'png' : /webp/.test(m) ? 'webp' : /gif/.test(m) ? 'gif'
    : /avif/.test(m) ? 'avif' : /quicktime/.test(m) ? 'mov' : /mp4/.test(m) && m.startsWith('video') ? 'mp4' : /webm/.test(m) ? 'webm'
      : /^video\/mpeg/.test(m) ? 'mpg' : /mpeg|mp3/.test(m) ? 'mp3' : /wav/.test(m) ? 'wav' : /m4a|aac|audio\/mp4/.test(m) ? 'm4a'
        : /flac/.test(m) ? 'flac' : /^audio\/(ogg|opus)/.test(m) ? 'ogg' : /gltf-binary|glb/.test(m) ? 'glb' : /gltf/.test(m) ? 'gltf'
          : /pdf/.test(m) ? 'pdf' : '';
  if (fromMime) return fromMime;
  const clean = url.split(/[?#]/)[0] ?? url;
  return (/\.([a-z0-9]{2,4})$/i.exec(clean)?.[1] ?? '').toLowerCase();
}

/** `base` with exactly one extension, the right one: from the bytes, else the URL, else `base`'s own, else `fallbackExt`. */
export function fileNameFor(base: string, mime: string, url = '', fallbackExt = 'bin'): string {
  const own = (/\.([a-z0-9]{2,4})$/i.exec(base || '')?.[1] ?? '').toLowerCase();
  const stem = (base || '').replace(/\.[a-z0-9]{2,4}$/i, '') || 'myavatar';
  return `${stem}.${extensionFor(mime, url) || own || fallbackExt}`;
}

function downloadBlob(blob: Blob, name: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 5000);
}

/** Only our existing signed Storage links qualify; possession of that token is unchanged. */
function storageAttachment(url: string, name: string): URL | null {
  try {
    const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    const asset = new URL(url);
    if (origin.protocol !== 'https:' || asset.origin !== origin.origin || asset.username || asset.password) return null;
    if (!/^\/storage\/v1\/object\/sign\/[^/]+\/.+/.test(asset.pathname) || !asset.searchParams.get('token')) return null;
    asset.hash = '';
    asset.searchParams.set('download', name);
    return asset;
  } catch { return null; }
}

/**
 * Browser-managed attachment: headers suffice; the browser owns the subsequent transfer. 'refused' is Storage turning the
 * link down (a token that ran out); 'unusable' is any other reason to take the byte path.
 */
async function startStorageDownload(url: string, base: string, fallbackExt?: string): Promise<'started' | 'refused' | 'unusable'> {
  const attachment = storageAttachment(url, fileNameFor(base, '', url, fallbackExt));
  if (!attachment) return 'unusable';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const headers = await fetch(attachment.href, { method: 'HEAD', cache: 'no-store', redirect: 'error', signal: controller.signal });
    const mime = headers.headers.get('content-type') ?? '';
    // Content-Type is CORS-readable. Content-Disposition need not be exposed to
    // JS: Storage's documented `download` parameter makes the GET an attachment.
    if (REFUSED.has(headers.status)) return 'refused';
    if (!headers.ok || !SAVEABLE.test(mime)) return 'unusable';
    const name = fileNameFor(base, mime, url, fallbackExt);
    attachment.searchParams.set('download', name);
    const a = document.createElement('a');
    a.href = attachment.href;
    a.download = name;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    try { a.click(); } finally { a.remove(); }
    return 'started';
  } catch { return 'unusable'; }
  finally { clearTimeout(timer); }
}

/** Too big to read into memory: over BUFFER_MAX_BYTES, or a video whose size the answer does not give. */
function tooBigToHold(r: Response): boolean {
  const size = Number(r.headers?.get?.('content-length') ?? NaN);
  if (Number.isFinite(size) && size > 0) return size > BUFFER_MAX_BYTES;
  return /^video\//i.test(r.headers?.get?.('content-type') ?? '');
}

function openInTab(url: string): void {
  try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { /* blocked */ }
}

/** Hand a file already in memory to the share sheet (from a fresh tap). */
export async function shareFile(file: File, nav: ShareNav = navigator as ShareNav): Promise<SaveOutcome> {
  try {
    await nav.share!({ files: [file] });
    return 'shared';
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === 'AbortError') return 'cancelled';
    if (name === 'NotAllowedError') return 'needs-tap';
    downloadBlob(file, file.name);
    return 'downloaded';
  }
}

// The saves under way, by link (without its #fragment), each kept a moment after it produced a file.
const saves = new Map<string, Promise<SaveOutcome>>();

/** Tests only: forget the saves under way, so the next save of the same link starts afresh. */
export function forgetSavesForTests(): void { saves.clear(); }

/**
 * Save the file at `url` as `base` (its extension is set from the bytes). Fail-open: a URL that cannot be fetched (CORS,
 * offline) is opened instead, which beats a button that does nothing. Another tap on the same link while it is saved,
 * or just after it produced a file, gets the same outcome and saves nothing more.
 */
export function saveMedia(url: string, base: string, opts: SaveOptions = {}): Promise<SaveOutcome> {
  const key = url.split('#')[0] ?? url;
  const running = saves.get(key);
  if (running) return running;
  const run = saveOnce(url, base, opts);
  saves.set(key, run);
  const release = () => { if (saves.get(key) === run) saves.delete(key); };
  run.then((out) => {
    if (out === 'started' || out === 'downloaded' || out === 'shared') setTimeout(release, SAME_SAVE_MS);
    else release(); // a closed sheet, a tap that ran out or a tab opened: the next tap tries again
  }, release);
  return run;
}

async function saveOnce(url: string, base: string, opts: SaveOptions): Promise<SaveOutcome> {
  const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as ShareNav | undefined;
  const apple = isAppleTouch(nav);
  let link = url;
  let relinked = false;
  // One fresh link per save, when the caller can give one: true when there is a new link to use.
  const relink = async () => {
    if (relinked || !opts.relink) return false;
    relinked = true;
    const next = await opts.relink().catch(() => null);
    if (!next || next === link) return false;
    link = next;
    return true;
  };
  const left = opts.expiresAt ? Date.parse(opts.expiresAt) - Date.now() : NaN;
  if (left < EXPIRY_MARGIN_MS) await relink();
  // Apple Photos sharing still needs a complete File and a fresh user gesture.
  // "started" deliberately does not claim that the browser has finished saving.
  if (typeof document !== 'undefined' && !apple) {
    let started = await startStorageDownload(link, base, opts.fallbackExt);
    if (started === 'refused' && await relink()) started = await startStorageDownload(link, base, opts.fallbackExt);
    if (started === 'started') return 'started';
  }
  let blob: Blob;
  try {
    let r = await fetch(link, { cache: 'no-store' });
    if (!r.ok && REFUSED.has(r.status) && await relink()) r = await fetch(link, { cache: 'no-store' });
    if (!r.ok) throw new Error(`fetch ${r.status}`);
    if (!apple && tooBigToHold(r)) {
      void r.body?.cancel().catch(() => {});
      openInTab(link);
      return 'opened';
    }
    blob = await r.blob();
  } catch {
    openInTab(link);
    return 'opened';
  }
  const name = fileNameFor(base, blob.type, link, opts.fallbackExt);
  if (nav && isAppleTouch(nav) && belongsInPhotos(blob.type) && typeof nav.share === 'function') {
    const file = new File([blob], name, { type: blob.type });
    if (nav.canShare?.({ files: [file] })) {
      const out = await shareFile(file, nav);
      if (out === 'needs-tap' && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('myavatar:save-ready', { detail: { file } }));
      return out;
    }
  }
  downloadBlob(blob, name);
  return 'downloaded';
}
