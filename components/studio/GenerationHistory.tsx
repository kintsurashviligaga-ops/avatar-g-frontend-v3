'use client';

/**
 * GenerationHistory (Pipeline Iteration, Phase 7C) — a compact "📜 history" affordance
 * for the chat composer. Toggles a dropdown of the user's last few generations, read
 * from the existing /api/studio/library feed (no new endpoint). Fail-open: an error or
 * empty feed simply shows nothing. Self-contained + locale-aware; clicking an item opens
 * the media in a new tab.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { History } from 'lucide-react';

type Lang = 'ka' | 'en' | 'ru';
interface Item { id: string; kind: string; url: string; prompt: string | null; createdAt: string }

const ICON: Record<string, string> = { film: '🎬', avatar: '🎬', image: '🖼', music: '🎵', voice: '🎤', interior: '🏠' };

function timeAgo(iso: string, lang: Lang): string {
  try {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return lang === 'en' ? 'just now' : lang === 'ru' ? 'только что' : 'ახლახ';
    const m = Math.floor(s / 60); if (m < 60) return lang === 'en' ? `${m}m` : lang === 'ru' ? `${m} мин` : `${m} წთ`;
    const h = Math.floor(m / 60); if (h < 24) return lang === 'en' ? `${h}h` : lang === 'ru' ? `${h} ч` : `${h} სთ`;
    const d = Math.floor(h / 24); return lang === 'en' ? `${d}d` : lang === 'ru' ? `${d} дн` : `${d} დღ`;
  } catch { return ''; }
}

export default function GenerationHistory({ locale }: { locale: string }) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const label = lang === 'en' ? 'Recent generations' : lang === 'ru' ? 'Последние генерации' : 'ბოლო გენერაციები';
  const empty = lang === 'en' ? 'Nothing yet' : lang === 'ru' ? 'Пока пусто' : 'ჯერ ცარიელია';

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number; width: number } | null>(null);

  // Viewport-aware open: this trigger sits on the LEFT of the composer, so a right-aligned
  // (right-0) menu ran 113px OFF the left edge on a 375px screen, covering content. Compute a
  // FIXED position clamped into the viewport [8 .. winW-width-8] and open ABOVE the button, so
  // the menu is always fully on-screen regardless of where the trigger sits.
  const toggle = useCallback(() => {
    if (!open && btnRef.current && typeof window !== 'undefined') {
      const r = btnRef.current.getBoundingClientRect();
      const width = Math.min(290, window.innerWidth - 16);
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      setPos({ left, bottom: window.innerHeight - r.top + 8, width });
    }
    setOpen((o) => !o);
  }, [open]);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/studio/library?limit=5', { cache: 'no-store', credentials: 'include' });
      if (!r.ok) { setLoaded(true); return; }
      const j = (await r.json()) as { items?: Item[] };
      setItems(Array.isArray(j.items) ? j.items.slice(0, 5) : []);
    } catch { /* fail-open */ } finally { setLoaded(true); }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, load]);

  return (
    <div ref={ref} className="relative">
      <button type="button" ref={btnRef} onClick={toggle} aria-label={label}
        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text touch-manipulation">
        <History size={13} /> 📜
      </button>
      {open && (
        <>
        {/* Tap-outside backdrop (mobile-safe close). */}
        <div className="fixed inset-0 z-[79]" onClick={() => setOpen(false)} aria-hidden />
        <div
          style={pos ? { position: 'fixed', left: pos.left, bottom: pos.bottom, width: pos.width } : undefined}
          className={`z-[80] overflow-hidden rounded-2xl border border-app-border/15 bg-app-surface shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] ${pos ? '' : 'absolute bottom-full right-0 mb-2 w-[290px] max-w-[88vw]'}`}
        >
          <div className="border-b border-app-border/10 px-4 py-2.5 text-[12.5px] font-semibold text-app-text">{label}</div>
          {loaded && items.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12.5px] text-app-muted">{empty}</div>
          ) : (
            <ul className="max-h-[55vh] overflow-y-auto">
              {items.map((it) => (
                <li key={it.id}>
                  <a href={it.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-start gap-2.5 border-b border-app-border/8 px-4 py-2.5 last:border-0 transition-colors hover:bg-app-elevated/60">
                    <span className="mt-0.5 text-[15px]">{ICON[it.kind] ?? '✨'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] leading-snug text-app-text">{it.prompt || it.kind}</span>
                      <span className="mt-0.5 block text-[10.5px] text-app-muted">{timeAgo(it.createdAt, lang)}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        </>
      )}
    </div>
  );
}
