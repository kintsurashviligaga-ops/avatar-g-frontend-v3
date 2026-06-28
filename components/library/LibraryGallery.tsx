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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Film, ImageIcon, Music2, Star, Download, Trash2, Play, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

type Lang = 'ka' | 'en' | 'ru';
type Tab = 'video' | 'image' | 'music' | 'favorites';

// Save a media item. On mobile, the Web Share API hands the FILE to the OS share
// sheet → "Save to Photos/Gallery" (a plain <a download> only ever lands in Files).
// Desktop / unsupported → blob download. Any miss → open the URL. Fail-open throughout.
async function saveMedia(url: string): Promise<void> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const t = blob.type || '';
    const ext = /mp4|video/.test(t) ? 'mp4' : /audio|mpeg|mp3/.test(t) ? 'mp3' : /png/.test(t) ? 'png' : 'jpg';
    const name = `myavatar-${Date.now()}.${ext}`;
    const file = new File([blob], name, { type: t || 'application/octet-stream' });
    const nav = navigator as Navigator & { canShare?: (d?: { files?: File[] }) => boolean };
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: name });
      return;
    }
    const burl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = burl; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(burl);
  } catch {
    try { window.open(url, '_blank', 'noopener'); } catch { /* give up */ }
  }
}

interface LibraryItem {
  id: string;
  kind: string; // film | avatar | image | interior | music | voice
  url: string;
  prompt: string | null;
  orientation: 'landscape' | 'vertical';
  createdAt: string;
}

const PAGE_SIZE = 12;
const FAV_KEY = 'myavatar:favorites';

// Which service_type(s) each tab shows. The API filters by a single `kind`, so for
// multi-kind tabs (video = film+avatar) we fetch the primary kind; favorites pulls
// across all kinds and filters by the local set.
const TAB_KIND: Record<Exclude<Tab, 'favorites'>, string> = { video: 'film', image: 'image', music: 'music' };
const VIDEO_KINDS = new Set(['film', 'avatar']);
const IMAGE_KINDS = new Set(['image', 'interior']);

const COPY: Record<Lang, {
  title: string; tabs: Record<Tab, string>; empty: string; download: string; del: string;
  play: string; confirmDel: string; prev: string; next: string; page: string; search: string;
}> = {
  ka: {
    title: 'ბიბლიოთეკა',
    tabs: { video: '🎬 ვიდეო', image: '🖼 სურათი', music: '🎵 მუსიკა', favorites: '⭐ ფავორიტი' },
    empty: 'ჯერ არაფერი შექმენით',
    download: 'ჩამოტვირთვა', del: 'წაშლა', play: 'დაკვრა',
    confirmDel: 'წავშალო ეს ფაილი სამუდამოდ?', prev: 'წინა', next: 'შემდეგი', page: 'გვერდი', search: 'ძიება…',
  },
  en: {
    title: 'Library',
    tabs: { video: '🎬 Video', image: '🖼 Image', music: '🎵 Music', favorites: '⭐ Favorites' },
    empty: 'Nothing created yet',
    download: 'Download', del: 'Delete', play: 'Play',
    confirmDel: 'Delete this file permanently?', prev: 'Prev', next: 'Next', page: 'Page', search: 'Search…',
  },
  ru: {
    title: 'Библиотека',
    tabs: { video: '🎬 Видео', image: '🖼 Фото', music: '🎵 Музыка', favorites: '⭐ Избранное' },
    empty: 'Пока ничего не создано',
    download: 'Скачать', del: 'Удалить', play: 'Воспроизвести',
    confirmDel: 'Удалить этот файл навсегда?', prev: 'Назад', next: 'Далее', page: 'Стр.', search: 'Поиск…',
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

  const [tab, setTab] = useState<Tab>('video');
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

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
    setLoading(true);
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
      })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tab, page]);

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
            {tabIcon(tb)} {t.tabs[tb]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-app-muted"><Loader2 className="animate-spin" size={22} /></div>
      ) : display.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <span className="text-4xl opacity-60">📭</span>
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
                <div key={it.id} className="group flex flex-col overflow-hidden rounded-2xl border border-app-border/15 bg-app-elevated/40">
                  <div className={`relative w-full overflow-hidden bg-app-bg/60 ${it.orientation === 'vertical' ? 'aspect-[9/16]' : isMusic ? 'aspect-square' : 'aspect-video'}`}>
                    {/* #t=0.1 makes the browser seek to 0.1s and paint THAT frame as the
                        poster — without it many browsers show a black thumbnail until play. */}
                    {isVideo && <video src={`${it.url}#t=0.1`} controls playsInline preload="metadata" className="h-full w-full object-cover" />}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {isImage && <img src={it.url} alt={it.prompt ?? 'image'} className="h-full w-full object-cover" loading="lazy" />}
                    {isMusic && (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3">
                        <Music2 size={28} className="text-app-accent" />
                        <audio src={it.url} controls className="w-full" preload="none" />
                      </div>
                    )}
                    {/* Favorite star */}
                    <button type="button" onClick={() => toggleFav(it.id)} aria-label="favorite"
                      className={`absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 backdrop-blur transition ${favs.has(it.id) ? 'text-yellow-400' : 'text-white/80 hover:text-white'}`}>
                      <Star size={15} fill={favs.has(it.id) ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-1 p-2">
                    <span className="truncate text-[10.5px] text-app-muted">{fmtDate(it.createdAt, lang)}</span>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button type="button" onClick={() => void saveMedia(it.url)} aria-label={t.download} title={t.download}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted transition hover:bg-app-bg hover:text-app-text">
                        <Download size={15} />
                      </button>
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
