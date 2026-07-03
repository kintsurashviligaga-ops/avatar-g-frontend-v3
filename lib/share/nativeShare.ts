/**
 * Native share/save — STEP 4.
 *
 * One entry point, `shareOrDownload`, that prefers the richest capability the device offers and
 * ALWAYS ends on a working path:
 *   1. Web Share with files  → native share sheet incl. "Save to Photos" (mobile)
 *   2. Web Share with a URL   → share sheet without the file payload
 *   3. <a download>           → MANDATORY fallback (desktop / unsupported / share failure)
 *
 * User-cancelled shares (AbortError) are a success, not a trigger for the download fallback
 * (otherwise cancelling would still force a download). The strategy decision + filename
 * derivation are pure functions → unit-tested with no DOM.
 */

export interface ShareCaps {
  hasShare: boolean;
  canShareFiles: boolean;
}
export type ShareStrategy = 'web-share-files' | 'web-share-url' | 'download';

export interface ShareInput {
  url: string;
  title?: string;
  text?: string;
  /** override the derived filename (without requiring an extension) */
  filename?: string;
  kind?: 'video' | 'image' | 'audio' | 'file';
}
export interface ShareOutcome {
  strategy: ShareStrategy;
  ok: boolean;
  cancelled?: boolean;
  error?: string;
}

const EXT_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/mp4': 'm4a',
};
const DEFAULT_EXT: Record<NonNullable<ShareInput['kind']>, string> = { video: 'mp4', image: 'jpg', audio: 'mp3', file: 'bin' };

/** Capability probe. `nav`/`fileCtor` injected so it is testable without a browser. */
export function detectShareCaps(
  nav: Partial<Navigator> | undefined,
  probeFile?: File,
): ShareCaps {
  const hasShare = !!nav && typeof nav.share === 'function';
  let canShareFiles = false;
  if (nav && typeof nav.canShare === 'function' && probeFile) {
    // call via nav to preserve `this` (detached navigator.canShare throws "Illegal invocation")
    try { canShareFiles = nav.canShare({ files: [probeFile] }); } catch { canShareFiles = false; }
  }
  return { hasShare, canShareFiles };
}

/** Choose the best strategy given capabilities + whether we actually hold the file bytes. Pure. */
export function pickShareStrategy(caps: ShareCaps, hasFile: boolean): ShareStrategy {
  if (caps.hasShare && caps.canShareFiles && hasFile) return 'web-share-files';
  if (caps.hasShare) return 'web-share-url';
  return 'download';
}

const slug = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 48);

/** Derive a safe, extensioned filename from url/title/mime/kind. Pure. */
export function deriveFilename(input: { url: string; title?: string; filename?: string; kind?: ShareInput['kind']; mime?: string }): string {
  const kind = input.kind ?? 'file';
  const fromMime = input.mime ? EXT_BY_MIME[(input.mime.split(';')[0] ?? '').trim()] : undefined;
  let ext = fromMime;
  if (!ext) {
    const path = (() => { try { return new URL(input.url).pathname; } catch { return input.url; } })();
    const m = path.match(/\.([a-z0-9]{1,5})$/i);
    ext = m?.[1]?.toLowerCase() ?? DEFAULT_EXT[kind];
  }
  const baseRaw = input.filename?.trim() || (input.title ? slug(input.title) : '') || `myavatar-${kind}`;
  const base = baseRaw.replace(/\.[a-z0-9]{1,5}$/i, '') || `myavatar-${kind}`;
  return `${base}.${ext}`;
}

const isAbort = (e: unknown) => e instanceof Error && (e.name === 'AbortError' || /abort|cancel/i.test(e.message));

/**
 * Share the asset natively, else download it. Never throws — resolves a ShareOutcome. Fetches
 * the bytes once so both file-share and download reuse them; if the fetch fails we still try a
 * URL share, and finally open the URL in a new tab as a last resort.
 */
export async function shareOrDownload(input: ShareInput): Promise<ShareOutcome> {
  if (typeof window === 'undefined') return { strategy: 'download', ok: false, error: 'no window' };
  const nav = navigator;

  // Fetch bytes (best-effort) so we can offer file-share + a real download.
  let blob: Blob | null = null;
  try {
    const res = await fetch(input.url, { credentials: 'omit' });
    if (res.ok) blob = await res.blob();
  } catch { /* fall through — may still URL-share */ }

  const filename = deriveFilename({ ...input, mime: blob?.type });
  const file = blob ? new File([blob], filename, { type: blob.type || 'application/octet-stream' }) : undefined;
  const caps = detectShareCaps(nav, file);
  const strategy = pickShareStrategy(caps, !!file);

  if (strategy === 'web-share-files' && file) {
    try {
      await nav.share({ files: [file], title: input.title, text: input.text });
      return { strategy, ok: true };
    } catch (e) {
      if (isAbort(e)) return { strategy, ok: true, cancelled: true };
      // fall through to download
    }
  } else if (strategy === 'web-share-url') {
    try {
      await nav.share({ url: input.url, title: input.title, text: input.text });
      return { strategy, ok: true };
    } catch (e) {
      if (isAbort(e)) return { strategy, ok: true, cancelled: true };
      // fall through to download
    }
  }

  // MANDATORY download fallback.
  try {
    const href = blob ? URL.createObjectURL(blob) : input.url;
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (blob) setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return { strategy: 'download', ok: true };
  } catch (e) {
    // Truly last resort: open in a new tab so the asset is never unreachable.
    try { window.open(input.url, '_blank', 'noopener'); return { strategy: 'download', ok: true }; } catch { /* noop */ }
    return { strategy: 'download', ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
