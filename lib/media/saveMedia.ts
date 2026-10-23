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
 */

export type SaveOutcome = 'shared' | 'downloaded' | 'started' | 'cancelled' | 'needs-tap' | 'opened';

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
    : /quicktime/.test(m) ? 'mov' : /mp4/.test(m) && m.startsWith('video') ? 'mp4' : /webm/.test(m) ? 'webm'
      : /mpeg|mp3/.test(m) ? 'mp3' : /wav/.test(m) ? 'wav' : /m4a|aac|audio\/mp4/.test(m) ? 'm4a' : /glb|gltf/.test(m) ? 'glb'
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

/** Browser-managed attachment: headers suffice; the browser owns the subsequent transfer. */
async function startStorageDownload(url: string, base: string, fallbackExt?: string): Promise<boolean> {
  const attachment = storageAttachment(url, fileNameFor(base, '', url, fallbackExt));
  if (!attachment) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const headers = await fetch(attachment.href, { method: 'HEAD', cache: 'no-store', redirect: 'error', signal: controller.signal });
    const mime = headers.headers.get('content-type') ?? '';
    // Content-Type is CORS-readable. Content-Disposition need not be exposed to
    // JS: Storage's documented `download` parameter makes the GET an attachment.
    if (!headers.ok || !/^(image|video|audio)\//i.test(mime)) return false;
    const name = fileNameFor(base, mime, url, fallbackExt);
    attachment.searchParams.set('download', name);
    const a = document.createElement('a');
    a.href = attachment.href;
    a.download = name;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    try { a.click(); } finally { a.remove(); }
    return true;
  } catch { return false; }
  finally { clearTimeout(timer); }
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

/**
 * Save the file at `url` as `base` (its extension is set from the bytes). Fail-open: a URL that cannot be fetched (CORS,
 * offline) is opened instead, which beats a button that does nothing.
 */
export async function saveMedia(url: string, base: string, opts: { fallbackExt?: string } = {}): Promise<SaveOutcome> {
  const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as ShareNav | undefined;
  // Apple Photos sharing still needs a complete File and a fresh user gesture.
  // "started" deliberately does not claim that the browser has finished saving.
  if (typeof document !== 'undefined' && !isAppleTouch(nav) && await startStorageDownload(url, base, opts.fallbackExt)) return 'started';
  let blob: Blob;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`fetch ${r.status}`);
    blob = await r.blob();
  } catch {
    try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { /* blocked */ }
    return 'opened';
  }
  const name = fileNameFor(base, blob.type, url, opts.fallbackExt);
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
