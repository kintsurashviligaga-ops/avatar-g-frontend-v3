'use client';

/**
 * StudioLibraryGrid — the signed-in user's durable media Library (Task 2).
 *
 * A DB-synced grid of every generation the account has produced (films first),
 * read from GET /api/studio/library (RLS-scoped per user). Each card is a real
 * playable thumbnail with the clip duration, and a Download / Share / Copy-prompt
 * action row. Strict studio palette: black · white · electric cyan (#00D2FF).
 *
 * Fail-soft by construction: an unauthenticated visitor or an empty account sees
 * a friendly empty state, never an error wall.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Share2, Copy, Check, Film, ImageIcon, Music2, Play, Loader2, Inbox, RefreshCw } from 'lucide-react';

type Lang = 'ka' | 'en' | 'ru';

interface LibraryItem {
  id: string;
  kind: string;
  url: string;
  prompt: string | null;
  orientation: 'landscape' | 'vertical';
  createdAt: string;
}

const COPY: Record<Lang, {
  title: string; subtitle: string;
  empty: string; emptyHint: string; goStudio: string;
  download: string; share: string; copyPrompt: string; copied: string; linkCopied: string;
  signedOut: string; retry: string; noPrompt: string;
}> = {
  ka: {
    title: 'ბიბლიოთეკა',
    subtitle: 'შენი დაგენერირებული ფილმები და მედია',
    empty: 'ჯერ არაფერია',
    emptyHint: 'შექმენი პირველი ფილმი — აქ გამოჩნდება.',
    goStudio: 'სტუდიაში გადასვლა',
    download: 'ჩამოტვირთვა', share: 'გაზიარება', copyPrompt: 'პრომპტის კოპირება',
    copied: 'დაკოპირდა', linkCopied: 'ბმული დაკოპირდა',
    signedOut: 'ბიბლიოთეკის სანახავად შედი ანგარიშზე.',
    retry: 'ხელახლა', noPrompt: 'პრომპტის გარეშე',
  },
  en: {
    title: 'Library',
    subtitle: 'Your generated films & media',
    empty: 'Nothing here yet',
    emptyHint: 'Create your first film — it will appear here.',
    goStudio: 'Go to Studio',
    download: 'Download', share: 'Share', copyPrompt: 'Copy prompt',
    copied: 'Copied', linkCopied: 'Link copied',
    signedOut: 'Sign in to see your Library.',
    retry: 'Retry', noPrompt: 'No prompt',
  },
  ru: {
    title: 'Библиотека',
    subtitle: 'Ваши сгенерированные фильмы и медиа',
    empty: 'Пока пусто',
    emptyHint: 'Создайте первый фильм — он появится здесь.',
    goStudio: 'В студию',
    download: 'Скачать', share: 'Поделиться', copyPrompt: 'Копировать промпт',
    copied: 'Скопировано', linkCopied: 'Ссылка скопирована',
    signedOut: 'Войдите, чтобы увидеть библиотеку.',
    retry: 'Повторить', noPrompt: 'Без промпта',
  },
};

function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function kindIcon(kind: string) {
  if (kind === 'image') return <ImageIcon className="h-3 w-3" />;
  if (kind === 'music' || kind === 'voice') return <Music2 className="h-3 w-3" />;
  return <Film className="h-3 w-3" />;
}

const isVideo = (kind: string) => kind === 'film' || kind === 'avatar' || kind === 'interior';
const isAudio = (kind: string) => kind === 'music' || kind === 'voice';

function LibraryCard({ item, t }: { item: LibraryItem; t: (typeof COPY)['ka'] }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [playing, setPlaying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState<'prompt' | 'link' | null>(null);

  const flash = useCallback((which: 'prompt' | 'link') => {
    setCopied(which);
    setTimeout(() => setCopied(null), 1800);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { void v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  }, []);

  // Download via blob so a cross-origin signed URL actually saves (an <a download>
  // is ignored cross-origin). Fallback: open the URL in a new tab.
  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const res = await fetch(item.url, { cache: 'no-store' });
      const blob = await res.blob();
      const ext = isVideo(item.kind) ? 'mp4' : isAudio(item.kind) ? 'mp3' : 'png';
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `myavatar-${item.kind}-${item.id.slice(0, 8)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 4000);
    } catch {
      window.open(item.url, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloading(false);
    }
  }, [item.url, item.kind, item.id]);

  const handleShare = useCallback(async () => {
    const nav = navigator as Navigator & { share?: (d: { title?: string; url?: string }) => Promise<void> };
    if (typeof nav.share === 'function') {
      try { await nav.share({ title: 'MyAvatar.ge', url: item.url }); return; } catch { /* cancelled → fall through */ }
    }
    try { await navigator.clipboard.writeText(item.url); flash('link'); } catch { /* clipboard unavailable */ }
  }, [item.url, flash]);

  const handleCopyPrompt = useCallback(async () => {
    if (!item.prompt) return;
    try { await navigator.clipboard.writeText(item.prompt); flash('prompt'); } catch { /* unavailable */ }
  }, [item.prompt, flash]);

  const aspect = item.orientation === 'vertical' ? 'aspect-[9/16]' : 'aspect-video';

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-black ring-1 ring-white/[0.04] transition-colors hover:border-[#00D2FF]/40">
      {/* Media thumbnail */}
      <div className={`relative ${aspect} w-full overflow-hidden bg-neutral-950`}>
        {isVideo(item.kind) ? (
          <>
            {/* #t=0.1 makes the browser paint an early frame as the poster. */}
            <video
              ref={videoRef}
              src={`${item.url}#t=0.1`}
              preload="metadata"
              playsInline
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              onEnded={() => setPlaying(false)}
              onClick={togglePlay}
              className="h-full w-full cursor-pointer object-cover"
            />
            {!playing && (
              <button
                type="button"
                onClick={togglePlay}
                aria-label="Play"
                className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/10"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 ring-1 ring-white/20 backdrop-blur-sm">
                  <Play className="ml-0.5 h-5 w-5 text-white" />
                </span>
              </button>
            )}
            {duration > 0 && (
              <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
                {fmtDuration(duration)}
              </span>
            )}
          </>
        ) : isAudio(item.kind) ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4">
            <Music2 className="h-8 w-8 text-[#00D2FF]/70" />
            <audio src={item.url} controls className="w-full" />
          </div>
        ) : (
          // image (and any other still kind)
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt={item.prompt ?? 'generated image'} className="h-full w-full object-cover" />
        )}

        {/* Kind badge */}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white ring-1 ring-white/10">
          {kindIcon(item.kind)} {item.kind}
        </span>
      </div>

      {/* Prompt + actions */}
      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <p className={`line-clamp-2 text-[12px] leading-snug ${item.prompt ? 'text-neutral-300' : 'italic text-neutral-600'}`}>
          {item.prompt ?? t.noPrompt}
        </p>
        <div className="mt-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            title={t.download}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#00D2FF]/30 bg-[#00D2FF]/10 text-[11px] font-semibold text-[#00D2FF] transition-colors hover:bg-[#00D2FF]/20 disabled:opacity-60"
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{t.download}</span>
          </button>
          <button
            type="button"
            onClick={handleShare}
            title={t.share}
            className="inline-flex h-8 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-neutral-300 transition-colors hover:border-white/25 hover:text-white"
          >
            {copied === 'link' ? <Check className="h-3.5 w-3.5 text-[#00D2FF]" /> : <Share2 className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={handleCopyPrompt}
            disabled={!item.prompt}
            title={t.copyPrompt}
            className="inline-flex h-8 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-neutral-300 transition-colors hover:border-white/25 hover:text-white disabled:opacity-40"
          >
            {copied === 'prompt' ? <Check className="h-3.5 w-3.5 text-[#00D2FF]" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StudioLibraryGrid({ locale = 'ka' }: { locale?: Lang }) {
  const t = COPY[locale] ?? COPY.ka;
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/studio/library?limit=48', { cache: 'no-store', credentials: 'include' });
      const json = (await res.json()) as { items?: LibraryItem[] };
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="w-full">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-white">{t.title}</h2>
          <p className="mt-0.5 text-[13px] text-neutral-500">{t.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-neutral-300 transition-colors hover:border-[#00D2FF]/40 hover:text-[#00D2FF]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t.retry}
        </button>
      </div>

      {loading && items === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-video animate-pulse rounded-2xl border border-white/5 bg-white/[0.03]" />
          ))}
        </div>
      ) : items && items.length > 0 ? (
        <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => <LibraryCard key={item.id} item={item} t={t} />)}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
            <Inbox className="h-7 w-7 text-neutral-600" />
          </div>
          <div>
            <p className="text-base font-semibold text-neutral-300">{t.empty}</p>
            <p className="mt-1 text-sm text-neutral-500">{t.emptyHint}</p>
          </div>
        </div>
      )}
    </section>
  );
}
