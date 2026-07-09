'use client';

/**
 * StudioLibraryGrid — the signed-in user's durable media Library (Task 2).
 *
 * A DB-synced grid of every generation the account has produced (films first),
 * read from GET /api/studio/library (RLS-scoped per user). Each card is a real
 * playable thumbnail with the clip duration, and Download / Share / Copy-prompt
 * / Delete quick actions revealed on hover. Strict studio palette: black ·
 * white · electric cyan (#00D2FF).
 *
 * Spec features wired here (Master Prompt §4):
 *   • Filter tabs — All / Videos / Soundtracks / Avatars · Images
 *   • Hover quick-actions — Download (mp4/png), Share/Copy Link, Copy prompt, Delete (confirm)
 *   • Shimmer placeholders — per-tile until media paints
 *   • Empty state — branded illustration + CTA
 *   • Infinite scroll — IntersectionObserver-based, page size 24 → offset bump
 *
 * Fail-soft by construction: an unauthenticated visitor or an empty account sees
 * a friendly empty state, never an error wall.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download, Share2, Copy, Check, Film, ImageIcon, Music2, Play, Loader2,
  Inbox, RefreshCw, Trash2, AlertTriangle,
} from 'lucide-react';

type Lang = 'ka' | 'en' | 'ru';

interface LibraryItem {
  id: string;
  kind: string;
  url: string;
  prompt: string | null;
  orientation: 'landscape' | 'vertical';
  createdAt: string;
}

type FilterKey = 'all' | 'videos' | 'soundtracks' | 'avatars-images';

const COPY: Record<Lang, {
  title: string; subtitle: string;
  empty: string; emptyHint: string; goStudio: string;
  download: string; share: string; copyPrompt: string; copied: string; linkCopied: string;
  signedOut: string; retry: string; noPrompt: string;
  deleteAsset: string; deleteConfirmTitle: string; deleteConfirmBody: string;
  cancel: string; confirm: string; deleting: string; deleteFailed: string;
  loadingMore: string;
  tabs: Record<FilterKey, string>;
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
    deleteAsset: 'წაშლა',
    deleteConfirmTitle: 'წაშლის დადასტურება',
    deleteConfirmBody: 'ეს ფაილი სამუდამოდ წაიშლება შენი ბიბლიოთეკიდან. ეს მოქმედება ვერ დაბრუნდება.',
    cancel: 'გაუქმება', confirm: 'წავშალო',
    deleting: 'იშლება…', deleteFailed: 'წაშლა ვერ შესრულდა.',
    loadingMore: 'მეტი იტვირთება…',
    tabs: { all: 'ყველაფერი', videos: 'ვიდეო', soundtracks: 'საუნდტრეკი', 'avatars-images': 'ავატარი · სურათი' },
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
    deleteAsset: 'Delete',
    deleteConfirmTitle: 'Confirm delete',
    deleteConfirmBody: 'This asset will be permanently removed from your Library. This cannot be undone.',
    cancel: 'Cancel', confirm: 'Delete',
    deleting: 'Deleting…', deleteFailed: 'Could not delete.',
    loadingMore: 'Loading more…',
    tabs: { all: 'All Assets', videos: 'Videos', soundtracks: 'Soundtracks', 'avatars-images': 'Avatars / Images' },
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
    deleteAsset: 'Удалить',
    deleteConfirmTitle: 'Подтвердите удаление',
    deleteConfirmBody: 'Этот ассет будет навсегда удалён из вашей библиотеки. Действие необратимо.',
    cancel: 'Отмена', confirm: 'Удалить',
    deleting: 'Удаление…', deleteFailed: 'Не удалось удалить.',
    loadingMore: 'Загружаем ещё…',
    tabs: { all: 'Все', videos: 'Видео', soundtracks: 'Саундтреки', 'avatars-images': 'Аватары · Картинки' },
  },
};

const PAGE_SIZE = 24;

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

/** Maps server `service_type` strings to the user-facing filter tabs. */
function filterMatches(kind: string, f: FilterKey): boolean {
  if (f === 'all') return true;
  if (f === 'videos') return kind === 'film' || kind === 'interior';
  if (f === 'soundtracks') return kind === 'music' || kind === 'voice';
  if (f === 'avatars-images') return kind === 'image' || kind === 'avatar';
  return true;
}

function LibraryCard({
  item, t, onDeleted,
}: {
  item: LibraryItem;
  t: (typeof COPY)['ka'];
  onDeleted: (id: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [playing, setPlaying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState<'prompt' | 'link' | null>(null);
  // §13 — per-tile lazy reveal: a shimmer sweep covers each thumbnail until its
  // media actually paints, so the grid fills in progressively instead of flashing.
  const [loaded, setLoaded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

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
      try { await nav.share({ title: 'MyAvatar', url: item.url }); return; } catch { /* cancelled → fall through */ }
    }
    try { await navigator.clipboard.writeText(item.url); flash('link'); } catch { /* clipboard unavailable */ }
  }, [item.url, flash]);

  const handleCopyPrompt = useCallback(async () => {
    if (!item.prompt) return;
    try { await navigator.clipboard.writeText(item.prompt); flash('prompt'); } catch { /* unavailable */ }
  }, [item.prompt, flash]);

  const confirmDelete = useCallback(async () => {
    setDeleting(true); setDeleteErr(null);
    try {
      const r = await fetch(`/api/studio/library?id=${encodeURIComponent(item.id)}`, {
        method: 'DELETE', credentials: 'include',
      });
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!j.success) { setDeleteErr(j.error || t.deleteFailed); setDeleting(false); return; }
      onDeleted(item.id);
    } catch {
      setDeleteErr(t.deleteFailed); setDeleting(false);
    }
  }, [item.id, onDeleted, t.deleteFailed]);

  const aspect = item.orientation === 'vertical' ? 'aspect-[9/16]' : 'aspect-video';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-black ring-1 ring-white/[0.04] transition-colors hover:border-[#00D2FF]/40"
    >
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
              onLoadedData={() => setLoaded(true)}
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
            <audio src={item.url} controls className="w-full" onLoadedData={() => setLoaded(true)} />
          </div>
        ) : (
          // image (and any other still kind)
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt={item.prompt ?? 'generated image'}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            className={`h-full w-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          />
        )}

        {/* Shimmer sweep until the media paints (skipped for audio, which has no thumbnail) */}
        {!loaded && !isAudio(item.kind) && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden bg-white/[0.03]">
            <div className="absolute inset-0 animate-[tile-shimmer_1.6s_linear_infinite] bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
          </div>
        )}

        {/* Kind badge */}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white ring-1 ring-white/10">
          {kindIcon(item.kind)} {item.kind}
        </span>

        {/* HOVER QUICK-ACTIONS — top-right floating cluster, revealed on hover.
            Also pinned visible on touch devices where :hover is sticky/odd. */}
        <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            title={t.download}
            aria-label={t.download}
            className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-white ring-1 ring-white/15 backdrop-blur-sm transition-colors hover:bg-[#00D2FF]/20 hover:text-[#00D2FF] disabled:opacity-60"
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={handleShare}
            title={t.share}
            aria-label={t.share}
            className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-white ring-1 ring-white/15 backdrop-blur-sm transition-colors hover:bg-[#00D2FF]/20 hover:text-[#00D2FF]"
          >
            {copied === 'link' ? <Check className="h-3.5 w-3.5 text-[#00D2FF]" /> : <Share2 className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            title={t.deleteAsset}
            aria-label={t.deleteAsset}
            className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-white ring-1 ring-white/15 backdrop-blur-sm transition-colors hover:bg-red-500/30 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Prompt + bottom secondary action row (Copy prompt — kept here so it
          isn't obscured by media controls). */}
      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <p className={`line-clamp-2 text-[12px] leading-snug ${item.prompt ? 'text-neutral-300' : 'italic text-neutral-600'}`}>
          {item.prompt ?? t.noPrompt}
        </p>
        <div className="mt-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopyPrompt}
            disabled={!item.prompt}
            title={t.copyPrompt}
            className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] text-[11px] font-medium text-neutral-300 transition-colors hover:border-white/25 hover:text-white disabled:opacity-40"
          >
            {copied === 'prompt' ? <Check className="h-3.5 w-3.5 text-[#00D2FF]" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied === 'prompt' ? t.copied : t.copyPrompt}</span>
          </button>
        </div>
      </div>

      {/* Delete confirmation — local to the card so multiple cards can each have
          their own confirmation without colliding. */}
      <AnimatePresence>
        {confirming && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/80 p-4 text-center backdrop-blur-sm"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/20 ring-1 ring-red-500/40">
              <AlertTriangle className="h-4 w-4 text-red-400" />
            </div>
            <p className="text-[12px] font-medium text-white">{t.deleteConfirmTitle}</p>
            <p className="text-[11px] leading-snug text-neutral-400">{t.deleteConfirmBody}</p>
            {deleteErr && <p className="text-[11px] text-red-400">{deleteErr}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setConfirming(false); setDeleteErr(null); }}
                disabled={deleting}
                className="inline-flex h-8 items-center rounded-md border border-white/15 bg-white/[0.04] px-3 text-[11px] font-medium text-neutral-300 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-red-500/90 px-3 text-[11px] font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-60"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {deleting ? t.deleting : t.confirm}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function StudioLibraryGrid({ locale = 'ka' }: { locale?: Lang }) {
  const t = COPY[locale] ?? COPY.ka;
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  /** Fresh load — replaces everything; resets pagination cursor. */
  const load = useCallback(async () => {
    setLoading(true); setExhausted(false);
    try {
      const res = await fetch(`/api/studio/library?limit=${PAGE_SIZE}&offset=0`, { cache: 'no-store', credentials: 'include' });
      const json = (await res.json()) as { items?: LibraryItem[] };
      const list = Array.isArray(json.items) ? json.items : [];
      setItems(list);
      if (list.length < PAGE_SIZE) setExhausted(true);
    } catch {
      setItems([]); setExhausted(true);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Append the next page — called by the IntersectionObserver sentinel. */
  const loadMore = useCallback(async () => {
    if (loadingMore || exhausted || items === null) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/studio/library?limit=${PAGE_SIZE}&offset=${items.length}`, { cache: 'no-store', credentials: 'include' });
      const json = (await res.json()) as { items?: LibraryItem[] };
      const more = Array.isArray(json.items) ? json.items : [];
      if (more.length === 0) { setExhausted(true); return; }
      // Defensive: drop any duplicates if pages overlap on a fresh write.
      setItems((prev) => {
        const seen = new Set((prev ?? []).map((x) => x.id));
        const merged = [...(prev ?? []), ...more.filter((x) => !seen.has(x.id))];
        if (more.length < PAGE_SIZE) setExhausted(true);
        return merged;
      });
    } catch {
      // Soft-fail: keep what we have, mark exhausted so the loop doesn't pound.
      setExhausted(true);
    } finally {
      setLoadingMore(false);
    }
  }, [items, loadingMore, exhausted]);

  useEffect(() => { void load(); }, [load]);

  // IntersectionObserver — page in when the sentinel hits the viewport.
  useEffect(() => {
    if (!sentinelRef.current || exhausted) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadMore();
    }, { rootMargin: '300px 0px' });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [loadMore, exhausted, items?.length]);

  const handleDeleted = useCallback((id: string) => {
    setItems((prev) => (prev ?? []).filter((x) => x.id !== id));
  }, []);

  /** Filter the loaded items client-side so tab switches are instant — the
   *  server's optional `kind` param doesn't map cleanly to our 4 user tabs. */
  const visible = useMemo(() => {
    if (!items) return null;
    return items.filter((x) => filterMatches(x.kind, filter));
  }, [items, filter]);

  const tabs: { key: FilterKey; label: string }[] = useMemo(() => ([
    { key: 'all',             label: t.tabs.all },
    { key: 'videos',          label: t.tabs.videos },
    { key: 'soundtracks',     label: t.tabs.soundtracks },
    { key: 'avatars-images',  label: t.tabs['avatars-images'] },
  ]), [t]);

  return (
    <section className="w-full">
      <div className="mb-4 flex items-end justify-between gap-3">
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

      {/* Filter tabs — pill row, horizontally scrollable on narrow viewports. */}
      <div className="mb-5 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const active = filter === tab.key;
          // Per-tab count so users see at a glance how much they have of each kind.
          const count = items ? items.filter((x) => filterMatches(x.kind, tab.key)).length : 0;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              aria-pressed={active}
              className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold transition-colors ${
                active
                  ? 'bg-[#00D2FF] text-black shadow-[0_0_0_1px_rgba(0,210,255,0.4)]'
                  : 'border border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/25 hover:text-white'
              }`}
            >
              <span>{tab.label}</span>
              {items && (
                <span className={`min-w-[18px] rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums ${
                  active ? 'bg-black/15 text-black' : 'bg-white/10 text-neutral-400'
                }`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {loading && items === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-video animate-pulse rounded-2xl border border-white/5 bg-white/[0.03]" />
          ))}
        </div>
      ) : visible && visible.length > 0 ? (
        <>
          <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {visible.map((item) => (
                <LibraryCard key={item.id} item={item} t={t} onDeleted={handleDeleted} />
              ))}
            </AnimatePresence>
          </div>

          {/* Infinite-scroll sentinel — observed by the IntersectionObserver to
              kick off the next page when ~300px from the viewport. */}
          {!exhausted && (
            <div ref={sentinelRef} className="mt-6 flex items-center justify-center py-6 text-neutral-500">
              {loadingMore ? (
                <span className="inline-flex items-center gap-2 text-[12px]">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t.loadingMore}
                </span>
              ) : (
                <span className="h-4" />
              )}
            </div>
          )}
        </>
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
