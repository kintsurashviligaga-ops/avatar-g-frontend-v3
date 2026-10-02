'use client';

/**
 * components/studio/montage/MediaPicker.tsx — where clips come from: this device, or the user's own creations.
 *
 * CapCut's import screen, cut to what this product has: one „from this device" button (photos and videos,
 * several at once) and a grid of the user's creations. Tap to pick, tap again to unpick, then one Add — the
 * order picked is the order they land on the timeline, numbered on the tiles so that is visible.
 */
import { useState } from 'react';
import { Check, Film, Loader2, Upload } from 'lucide-react';
import type { Copy } from './copy';
import { isVideoItem, type LibraryItem } from './useLibrary';

export function MediaPicker(p: {
  t: Copy;
  library: { items: LibraryItem[]; loading: boolean; signedOut: boolean };
  onDevice: () => void;
  onAdd: (items: LibraryItem[]) => void;
  /** Grid columns: 3 in a phone sheet, 2 in the desktop's narrow left column. */
  columns?: 2 | 3 | 4;
  testId?: string;
}) {
  const { t } = p;
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const add = () => {
    const byId = new Map(p.library.items.map((it) => [it.id, it]));
    const chosen = picked.map((id) => byId.get(id)).filter((x): x is LibraryItem => !!x);
    if (chosen.length) p.onAdd(chosen);
    setPicked([]);
  };
  const cols = p.columns ?? 3;

  return (
    <div className="flex min-h-0 flex-col" data-testid={p.testId ?? 'montage-media-picker'}>
      <button
        type="button"
        onClick={p.onDevice}
        data-testid="montage-from-device"
        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-app-accent px-4 text-[14px] font-semibold text-black transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg"
      >
        <Upload size={17} aria-hidden="true" /> {t.fromDevice}
      </button>

      <h4 className="mb-2 mt-4 text-[12px] font-medium uppercase tracking-wide text-app-muted">{t.myCreations}</h4>
      {p.library.signedOut ? (
        <p className="text-[12.5px] leading-snug text-app-muted">{t.signInLibrary}</p>
      ) : p.library.loading ? (
        <p className="flex items-center gap-2 text-[12.5px] text-app-muted"><Loader2 size={14} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> …</p>
      ) : p.library.items.length === 0 ? (
        <p className="text-[12.5px] leading-snug text-app-muted">{t.myCreationsEmpty}</p>
      ) : (
        <ul
          className="grid min-h-0 gap-1.5 overflow-y-auto pb-1"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          data-testid="montage-my-creations"
        >
          {p.library.items.map((it) => {
            const n = picked.indexOf(it.id);
            const on = n >= 0;
            const video = isVideoItem(it);
            return (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => toggle(it.id)}
                  aria-pressed={on}
                  aria-label={`${video ? t.video : t.photo}${it.prompt ? ` · ${it.prompt.slice(0, 60)}` : ''}`}
                  className={`relative block aspect-square w-full overflow-hidden rounded-lg bg-app-elevated ring-2 transition focus-visible:outline-none focus-visible:ring-app-accent ${on ? 'ring-app-accent' : 'ring-transparent'}`}
                >
                  {video ? (
                    <video src={`${it.url}#t=0.5`} muted playsInline preload="metadata" className="pointer-events-none h-full w-full object-cover" aria-hidden="true" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  )}
                  {video && <Film size={13} aria-hidden="true" className="absolute bottom-1 left-1 rounded bg-black/55 p-0.5 text-white" />}
                  {on && (
                    <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-app-accent px-1 text-[11px] font-semibold tabular-nums text-black" aria-hidden="true">
                      {n + 1}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {picked.length > 0 && (
        <button
          type="button"
          onClick={add}
          data-testid="montage-add-picked"
          className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-app-text px-4 text-[14px] font-semibold text-app-bg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
        >
          <Check size={17} aria-hidden="true" /> {t.addN} · {picked.length}
        </button>
      )}
    </div>
  );
}
