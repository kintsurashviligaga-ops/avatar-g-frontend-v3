'use client';

/**
 * Scrolling karaoke lyrics for a Music Producer track. Lyria returns the words but no word timings, so lines are placed
 * by section (lib/music/producer/lyricSync) and the pane says so: "Synced by section". The line being sung is lit and
 * kept in view; clicking a line jumps the player there.
 */
import { useEffect, useRef } from 'react';
import { activeLineAt, type LyricLine } from '@/lib/music/producer/lyricSync';
import { LABELS } from '@/lib/music/producer/labels';
import type { ProducerLang } from '@/lib/music/producer/spec';

export function LyricsPane({ lines, time, onSeek, lang }: { lines: LyricLine[]; time: number; onSeek: (sec: number) => void; lang: ProducerLang }) {
  const active = activeLineAt(lines, time);
  const box = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-line="${active}"]`);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active]);
  if (!lines.length) return null;
  let lastSection = '';
  return (
    <div data-testid="mp-lyrics-pane" className="rounded-xl border border-app-border/15 bg-app-bg/40">
      <div className="flex items-center justify-between px-3 pt-2 text-[11px] uppercase tracking-wide text-app-muted">
        <span>Lyrics</span>
        <span data-testid="mp-synced" className="normal-case tracking-normal">{LABELS.synced[lang]}</span>
      </div>
      <ol ref={box} className="max-h-48 space-y-0.5 overflow-y-auto px-3 pb-3 pt-1">
        {lines.map((l, i) => {
          const head = l.section !== lastSection ? l.section : '';
          lastSection = l.section;
          return (
            <li key={i}>
              {head && <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-app-muted/80">{head}</div>}
              <button type="button" data-line={i} data-testid={`mp-line-${i}`} aria-current={i === active ? 'true' : undefined}
                onClick={() => onSeek(l.start)}
                className={`w-full rounded-md px-1 py-0.5 text-left text-[14px] transition-colors ${i === active ? 'bg-app-accent/15 font-medium text-app-text' : i < active ? 'text-app-muted/70' : 'text-app-muted'}`}>
                {l.text}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
