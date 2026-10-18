'use client';

/**
 * LibraryGallery — the dedicated /[locale]/library media gallery (PHASE 3 Task 1).
 *
 * A proper page (not the slide-over StudioLibraryGrid) with four tabs — Video ·
 * Image · Music · Favorites — over the user's completed generations. Reuses the
 * existing, RLS-protected API: GET /api/studio/library?kind=&limit=&offset= and
 * DELETE /api/studio/library?id=. Favorites are device-local (localStorage) so no
 * schema change is needed. Mobile-first grid, Georgian default copy.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Film, ImageIcon, Inbox, Music2, Star, Download, Trash2, Loader2, ChevronLeft, ChevronRight, Move3d, Scissors } from 'lucide-react';
import type { RoomGeometry, StyleGuide } from '@/lib/orchestrator/interior';
import { SHOOT_COPY } from '@/components/studio/create/newtools/copy';
import { PlanView } from '@/components/studio/create/newtools/PlanView';
import { MediaUnavailable } from '@/components/library/MediaUnavailable';
import { editKindFor, stashPendingEdit } from '@/lib/studio/pendingEdit';
import { saveMedia } from '@/lib/media/saveMedia';

type Lang = 'ka' | 'en' | 'ru';
type Tab = 'video' | 'image' | 'music' | 'favorites';

// ⚠️ DOWNLOAD SAVED ONLY SOMETIMES (GG, 2026-10-18). This page kept its own older copy of the save: it fetched the whole
// file first and only then asked for the system share sheet — a browser lets a page open that only for a few seconds
// after the tap, so a longer film was refused and the fallback opened a new tab, which a popup blocker stops. It also
// saved an error page as the file and released the file's link the instant the download began. It now saves through
// lib/media/saveMedia, the chat's own save: a plain download, the share sheet only on an iPhone or iPad (Photos) with a
// one-tap retry when the wait ran out, and the button shows it is working until the file is out.
function saveName(it: { kind: string; id: string }): string {
  return `myavatar-${it.kind}-${it.id.slice(0, 8)}`;
}
function fallbackExt(it: { kind: string; url: string }): string {
  if (/\.glb(\?|#|$)/i.test(it.url)) return 'glb';
  return VIDEO_KINDS.has(it.kind) ? 'mp4' : it.kind === 'music' ? 'mp3' : 'png';
}

interface LibraryItem {
  id: string;
  kind: string; // film | avatar | image | interior | music | voice
  url: string;
  prompt: string | null;
  orientation: 'landscape' | 'vertical';
  createdAt: string;
  /** An interior 3D plan: `url` is the render it was made for (GET /api/studio/library). */
  plan?: { geometry: RoomGeometry; style: StyleGuide };
}

const PAGE_SIZE = 12;
const FAV_KEY = 'myavatar:favorites';

// Which service_type(s) each tab shows (the API takes a comma list): avatar videos sit with the films, the Interior
// designer's 3D plans (filed with their render) with the pictures. Favorites pull across all kinds and filter locally.
const TAB_KIND: Record<Exclude<Tab, 'favorites'>, string> = { video: 'film,avatar', image: 'image,interior', music: 'music' };
const VIDEO_KINDS = new Set(['film', 'avatar']);
const IMAGE_KINDS = new Set(['image', 'interior']);

const COPY: Record<Lang, {
  title: string; tabs: Record<Tab, string>; empty: string; download: string; del: string; edit: string;
  play: string; confirmDel: string; prev: string; next: string; page: string; search: string;
  plan: string; openPlan: string; closePlan: string;
}> = {
  ka: {
    title: 'ბიბლიოთეკა',
    tabs: { video: 'ვიდეო', image: 'სურათი', music: 'მუსიკა', favorites: 'ფავორიტი' },
    empty: 'ჯერ არაფერი შექმენით',
    download: 'ჩამოტვირთვა', del: 'წაშლა', edit: 'რედაქტირება ედიტორში', play: 'დაკვრა',
    confirmDel: 'წავშალო ეს ფაილი სამუდამოდ?', prev: 'წინა', next: 'შემდეგი', page: 'გვერდი', search: 'ძიება…',
    plan: '3D გეგმა', openPlan: '3D გეგმის ნახვა', closePlan: 'გეგმის დახურვა',
  },
  en: {
    title: 'Library',
    tabs: { video: 'Video', image: 'Image', music: 'Music', favorites: 'Favorites' },
    empty: 'Nothing created yet',
    download: 'Download', del: 'Delete', edit: 'Open in Editor', play: 'Play',
    confirmDel: 'Delete this file permanently?', prev: 'Prev', next: 'Next', page: 'Page', search: 'Search…',
    plan: '3D plan', openPlan: 'View 3D plan', closePlan: 'Close plan',
  },
  ru: {
    title: 'Библиотека',
    tabs: { video: 'Видео', image: 'Фото', music: 'Музыка', favorites: 'Избранное' },
    empty: 'Пока ничего не создано',
    download: 'Скачать', del: 'Удалить', edit: 'Открыть в редакторе', play: 'Воспроизвести',
    confirmDel: 'Удалить этот файл навсегда?', prev: 'Назад', next: 'Далее', page: 'Стр.', search: 'Поиск…',
    plan: '3D-план', openPlan: 'Открыть 3D-план', closePlan: 'Закрыть план',
  },
};

function fmtDate(iso: string, lang: Lang): string {
  try {
    return new Date(iso).toLocaleDateString(lang === 'ka' ? 'ka-GE' : lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

export default function LibraryGallery({ locale }: { locale: string }) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('video');
  // The sidebar's Favorites row deep-links here with ?tab=favorites. Read once on mount: without this the
  // row would land on the Videos tab and quietly do nothing, which is worse than not offering the row.
  const searchParams = useSearchParams();
  useEffect(() => {
    const requested = searchParams?.get('tab');
    if (requested === 'favorites' || requested === 'video' || requested === 'image' || requested === 'music') {
      setTab(requested);
    }
  }, [searchParams]);
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  // Files being saved: the button spins until the file is out, and a second tap meanwhile starts no second download.
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const savingRef = useRef(new Set<string>());
  const [openPlan, setOpenPlan] = useState<string | null>(null);
  // Files that would not load. The first failure fetches the page again once, quietly (every link in it is minted
  // fresh, which mends a page left open past its links' 24 h); a file that fails again shows MediaUnavailable.
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [refetch, setRefetch] = useState(0);
  const quietRef = useRef(false);
  const autoRetriedRef = useRef(false);

  // Load favorites from localStorage once.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      if (raw) setFavs(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore corrupt favorites */ }
  }, []);

  const persistFavs = useCallback((next: Set<string>) => {
    setFavs(next);
    try { localStorage.setItem(FAV_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
  }, []);

  const toggleFav = useCallback((id: string) => {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(FAV_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Fetch the current tab/page. Favorites fetch a wider window (all kinds) then filter.
  useEffect(() => {
    let alive = true;
    if (!quietRef.current) setLoading(true);
    quietRef.current = false;
    const isFav = tab === 'favorites';
    const qs = new URLSearchParams();
    if (!isFav) { qs.set('kind', TAB_KIND[tab]); qs.set('limit', String(PAGE_SIZE)); qs.set('offset', String(page * PAGE_SIZE)); }
    else { qs.set('limit', '60'); } // favorites: pull a wide window, filter locally
    fetch(`/api/studio/library?${qs.toString()}`, { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j: { items?: LibraryItem[] }) => {
        if (!alive) return;
        // Favorites are filtered in render (off `favs`), so toggling a star never
        // re-fetches — the effect only depends on tab + page.
        setItems(Array.isArray(j.items) ? j.items : []);
        setFailed(new Set());
      })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tab, page, refetch]);

  const reload = useCallback(() => { quietRef.current = true; setRefetch((n) => n + 1); }, []);
  const onMediaError = useCallback((id: string) => {
    setFailed((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    if (!autoRetriedRef.current) { autoRetriedRef.current = true; reload(); }
  }, [reload]);

  // Favorites tab filters the fetched window by the local set, then paginates locally.
  // PHASE 6.3 — client-side search over the loaded items (prompt + kind match). Applied on
  // top of the tab filter; empty query is a no-op so paging behaviour is unchanged.
  const display = useMemo(() => {
    const base = tab === 'favorites'
      ? items.filter((it) => favs.has(it.id)).slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
      : items;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter((it) => (it.prompt ?? '').toLowerCase().includes(q) || (it.kind ?? '').toLowerCase().includes(q));
  }, [tab, items, favs, page, searchQuery]);

  const onTab = useCallback((next: Tab) => { setTab(next); setPage(0); }, []);

  const del = useCallback(async (id: string) => {
    if (!window.confirm(t.confirmDel)) return;
    setBusyId(id);
    try {
      const r = await fetch(`/api/studio/library?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
      if (r.ok) {
        setItems((prev) => prev.filter((it) => it.id !== id));
        if (favs.has(id)) { const n = new Set(favs); n.delete(id); persistFavs(n); }
      }
    } catch { /* fail-soft */ } finally { setBusyId(null); }
  }, [t.confirmDel, favs, persistFavs]);

  const download = useCallback(async (it: LibraryItem) => {
    if (savingRef.current.has(it.id)) return;
    savingRef.current.add(it.id);
    setSaving(new Set(savingRef.current));
    try {
      await saveMedia(it.url, saveName(it), { fallbackExt: fallbackExt(it) });
    } finally {
      savingRef.current.delete(it.id);
      setSaving(new Set(savingRef.current));
    }
  }, []);

  // Edit (GG's UI/UX plan, 2026-10-18): the file opens in the studio's Montage — a film or a picture on the timeline, a song
  // as the music (GG's card answer the same day). It rides over in this tab's sessionStorage (a signed link never goes in
  // the address bar) and the studio opens it once. Opening it generates and charges nothing.
  const edit = useCallback((it: LibraryItem) => {
    const kind = editKindFor(it.kind, it.url);
    if (!kind) return;
    stashPendingEdit(it.url, kind);
    router.push(`/${locale}/dashboard`); // the signed-in studio (/{lang} sends a signed-in visitor there anyway)
  }, [router, locale]);

  // Next page exists when a full window came back (or, for favorites, more starred
  // items remain beyond this page).
  const hasNext = tab !== 'favorites' ? items.length === PAGE_SIZE : items.filter((it) => favs.has(it.id)).length > (page + 1) * PAGE_SIZE;

  const TABS: Tab[] = useMemo(() => ['video', 'image', 'music', 'favorites'], []);
  const tabIcon = (tb: Tab) => tb === 'video' ? <Film size={14} /> : tb === 'image' ? <ImageIcon size={14} /> : tb === 'music' ? <Music2 size={14} /> : <Star size={14} />;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <h1 className="mb-4 text-[22px] font-bold tracking-tight text-app-text">{t.title}</h1>

      {/* PHASE 6.3 — search (16px font → no iOS zoom; filters the loaded items by prompt/kind) */}
      <input
        type="search"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={t.search}
        className="mb-4 w-full rounded-xl border border-app-border/15 bg-app-elevated px-3.5 py-2.5 text-[16px] text-app-text outline-none transition-colors placeholder:text-app-muted focus:border-app-accent/40"
      />

      {/* Tabs */}
      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((tb) => (
          <button key={tb} type="button" onClick={() => onTab(tb)}
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition ${tab === tb ? 'bg-app-accent text-app-bg' : 'bg-app-elevated text-app-muted hover:text-app-text'}`}>
            {/* Icon comes from tabIcon (lucide, matching the rest of the studio). The label strings
                used to carry an emoji as well, so every chip rendered TWO icons — a film glyph next to
                🎬, a star next to ⭐. Labels are text only; the icon lives here. */}
            {tabIcon(tb)} {t.tabs[tb]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-app-muted"><Loader2 className="animate-spin" size={22} /></div>
      ) : display.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          {/* A line icon, not an emoji (docs/DESIGN.md §6) — the copy below says what is empty. */}
          <Inbox size={40} strokeWidth={1.25} aria-hidden="true" className="text-app-muted/70" />
          <p className="text-[14px] text-app-muted">{t.empty}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {display.map((it) => {
              const isVideo = VIDEO_KINDS.has(it.kind);
              const isImage = IMAGE_KINDS.has(it.kind);
              const isMusic = it.kind === 'music';
              return (
                <div key={it.id} className={`group flex flex-col overflow-hidden rounded-2xl border border-app-border/15 bg-app-elevated/40 ${openPlan === it.id ? 'col-span-full' : ''}`}>
                  <div className={`relative w-full overflow-hidden bg-app-bg/60 ${it.orientation === 'vertical' ? 'aspect-[9/16]' : isMusic ? 'aspect-square' : 'aspect-video'}`}>
                    {/* #t=0.1 makes the browser seek to 0.1s and paint THAT frame as the
                        poster — without it many browsers show a black thumbnail until play. */}
                    {failed.has(it.id) && <MediaUnavailable lang={lang} onRetry={reload} />}
                    {isVideo && !failed.has(it.id) && <video src={`${it.url}#t=0.1`} controls playsInline preload="metadata" onError={() => onMediaError(it.id)} className="h-full w-full object-cover" />}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {isImage && !failed.has(it.id) && <img src={it.url} alt={it.prompt ?? 'image'} onError={() => onMediaError(it.id)} className="h-full w-full object-cover" loading="lazy" />}
                    {it.plan && (
                      <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur">
                        <Move3d size={12} aria-hidden="true" /> {t.plan}
                      </span>
                    )}
                    {isMusic && !failed.has(it.id) && (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3">
                        <Music2 size={28} className="text-app-accent" />
                        <audio src={it.url} controls className="w-full" preload="none" onError={() => onMediaError(it.id)} />
                      </div>
                    )}
                    {/* Favorite star */}
                    <button type="button" onClick={() => toggleFav(it.id)} aria-label={t.tabs.favorites} aria-pressed={favs.has(it.id)}
                      className={`absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 backdrop-blur transition ${favs.has(it.id) ? 'text-yellow-400' : 'text-white/80 hover:text-white'}`}>
                      <Star size={15} fill={favs.has(it.id) ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  {it.plan && openPlan === it.id && (
                    <div className="p-2 pb-0"><PlanView geometry={it.plan.geometry} style={it.plan.style} copy={SHOOT_COPY[lang]} /></div>
                  )}
                  {it.plan && (
                    <button type="button" onClick={() => setOpenPlan((cur) => (cur === it.id ? null : it.id))} aria-expanded={openPlan === it.id}
                      data-testid="library-plan-toggle"
                      className="mx-2 mt-2 inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-app-accent/30 bg-app-accent/10 px-3 text-[12.5px] font-semibold text-app-text transition hover:border-app-accent/60">
                      <Move3d size={14} aria-hidden="true" /> {openPlan === it.id ? t.closePlan : t.openPlan}
                    </button>
                  )}
                  <div className="flex items-center justify-between gap-1 p-2">
                    <span className="truncate text-[10.5px] text-app-muted">{fmtDate(it.createdAt, lang)}</span>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button type="button" onClick={() => void download(it)} disabled={saving.has(it.id)} aria-busy={saving.has(it.id) || undefined}
                        aria-label={t.download} title={t.download} data-testid="library-download"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted transition hover:bg-app-bg hover:text-app-text disabled:opacity-60">
                        {saving.has(it.id) ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                      </button>
                      {editKindFor(it.kind, it.url) && !failed.has(it.id) && (
                        <button type="button" onClick={() => edit(it)} aria-label={t.edit} title={t.edit} data-testid="library-edit"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted transition hover:bg-app-bg hover:text-app-text">
                          <Scissors size={15} />
                        </button>
                      )}
                      <button type="button" onClick={() => del(it.id)} disabled={busyId === it.id} aria-label={t.del} title={t.del}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50">
                        {busyId === it.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {(page > 0 || hasNext) && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="inline-flex min-h-[40px] items-center gap-1 rounded-full bg-app-elevated px-4 text-[13px] font-medium text-app-text transition disabled:opacity-40">
                <ChevronLeft size={15} /> {t.prev}
              </button>
              <span className="text-[12.5px] tabular-nums text-app-muted">{t.page} {page + 1}</span>
              <button type="button" disabled={!hasNext} onClick={() => setPage((p) => p + 1)}
                className="inline-flex min-h-[40px] items-center gap-1 rounded-full bg-app-elevated px-4 text-[13px] font-medium text-app-text transition disabled:opacity-40">
                {t.next} <ChevronRight size={15} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
