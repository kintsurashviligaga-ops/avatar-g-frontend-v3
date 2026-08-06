'use client';

import { useCallback, useState } from 'react';
import { Download, Share2, Check, Loader2, FolderPlus } from 'lucide-react';
import { ICON_BTN } from './tokens';

/**
 * The actions under a finished result. One set, for every service.
 *
 * ⚠️ THE DOWNLOAD LINK DID NOT DOWNLOAD. The service panels used `<a href={url} download>`, and a
 * browser IGNORES the `download` attribute when the href is cross-origin — which every one of these
 * URLs is, being a signed storage link. So the tap navigated AWAY from the app to the raw file instead
 * of saving it, and on mobile that means the render is gone from view with no obvious way back.
 *
 * Fetching the bytes into a Blob and downloading THAT is the only reliable path, and it is what the
 * Surgical Editor already did — the panels simply never got the same treatment. On iOS the share sheet
 * is offered first, because that is the only route to the Photos library; a blob link there lands in
 * Files, which is not where anyone looks for a video they just made.
 *
 * SAVE TO LIBRARY exists here because several services return an asset that no server-side code files:
 * a result the user can see but cannot find again tomorrow is barely a result. The button is idempotent
 * — the Library upserts on id — so a double tap is harmless.
 */

type Lang = 'ka' | 'en' | 'ru';

const COPY: Record<Lang, { download: string; share: string; save: string; saved: string; copied: string; failed: string }> = {
  ka: { download: 'ჩამოტვირთვა', share: 'გაზიარება', save: 'ბიბლიოთეკაში', saved: 'შენახულია', copied: 'ბმული დაკოპირდა', failed: 'ვერ მოხერხდა' },
  en: { download: 'Download', share: 'Share', save: 'Save to Library', saved: 'Saved', copied: 'Link copied', failed: 'Failed' },
  ru: { download: 'Скачать', share: 'Поделиться', save: 'В библиотеку', saved: 'Сохранено', copied: 'Ссылка скопирована', failed: 'Не удалось' },
};

function extFor(url: string, kind: string): string {
  const m = /\.([a-z0-9]{2,4})(?:\?|#|$)/i.exec(url);
  if (m?.[1]) return m[1];
  return kind === 'music' ? 'mp3' : kind === 'image' ? 'png' : kind === 'model3d' ? 'glb' : 'mp4';
}


/**
 * Save a cross-origin URL to disk, properly.
 *
 * ⚠️ `<a href={url} download>` DOES NOTHING ACROSS ORIGINS. The browser silently drops the `download`
 * attribute and just navigates, so the tap opens the raw file instead of saving it. Every asset URL here
 * is a signed storage link, i.e. cross-origin, i.e. always the broken case. Exported so the SECONDARY
 * files a panel offers — a dub's audio stem, its subtitle track, a music video — get the same treatment
 * as the primary result without each panel re-implementing it.
 *
 * Fail-open: a CORS block or an offline tab falls back to opening the file, which is still better than
 * a button that appears to do nothing.
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 4000);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export function ResultActions({
  url, kind, locale, prompt, onNote,
}: {
  url: string;
  /** Drives the filename extension and the Library's service_type. */
  kind: 'film' | 'image' | 'music' | 'avatar' | 'model3d';
  locale: Lang;
  /** Stored with the Library row so the card has a caption later. */
  prompt?: string;
  /** Surface a short status line — the caller owns where it appears. */
  onNote?: (msg: string) => void;
}) {
  const t = COPY[locale] ?? COPY.ka;
  const [busy, setBusy] = useState<'dl' | 'save' | null>(null);
  const [saved, setSaved] = useState(false);

  const download = useCallback(async () => {
    setBusy('dl');
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `myavatar-${kind}-${Date.now()}.${extFor(url, kind)}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 4000);
    } catch {
      // CORS-blocked or offline — opening the file is still better than doing nothing silently.
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setBusy(null);
    }
  }, [url, kind]);

  const share = useCallback(async () => {
    const nav = navigator as Navigator & { share?: (d: { url?: string; title?: string }) => Promise<void> };
    if (typeof nav.share === 'function') {
      try { await nav.share({ url, title: 'MyAvatar' }); return; }
      catch (e) { if ((e as Error).name === 'AbortError') return; /* else fall back to copy */ }
    }
    try { await navigator.clipboard.writeText(url); onNote?.(t.copied); } catch { onNote?.(t.failed); }
  }, [url, onNote, t.copied, t.failed]);

  const save = useCallback(async () => {
    setBusy('save');
    try {
      const r = await fetch('/api/studio/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        // 3D meshes ride as 'image' — the DB CHECK on service_type allows only
        // film|avatar|interior|image|music|voice, and the Library detects a .glb from the URL.
        body: JSON.stringify({ url, kind: kind === 'model3d' ? 'image' : kind, prompt: prompt ?? null }),
      });
      if (r.ok) { setSaved(true); onNote?.(t.saved); try { window.dispatchEvent(new CustomEvent('myavatar:library-updated')); } catch { /* noop */ } }
      else onNote?.(t.failed);
    } catch {
      onNote?.(t.failed);
    } finally {
      setBusy(null);
    }
  }, [url, kind, prompt, onNote, t.saved, t.failed]);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={download} disabled={busy === 'dl'} className={ICON_BTN} aria-label={t.download} title={t.download}>
        {busy === 'dl' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
      </button>
      <button type="button" onClick={share} className={ICON_BTN} aria-label={t.share} title={t.share}>
        <Share2 size={15} />
      </button>
      <button type="button" onClick={save} disabled={busy === 'save' || saved} className={ICON_BTN} aria-label={t.save} title={saved ? t.saved : t.save}>
        {busy === 'save' ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} className="text-app-accent" /> : <FolderPlus size={15} />}
      </button>
    </div>
  );
}
