'use client';

/**
 * components/studio/montage/smart/SmartLanes.tsx — the Text and Effects lanes of the Smart Timeline (Phase 8.7 PR B),
 * drawn INSIDE the montage timeline's scrolling content above the video track, so they scroll and zoom with it.
 *
 * Drag an item to move it, drag one of its edges to trim it. Both snap (8 px) to the playhead, the clip boundaries,
 * the other items' edges and the music's beats (lib/services/montage/smart/timeline snapTime / snapSpan); hold Alt to
 * place freely. A tap selects; the selected item shows its delete button. Pure positioning: the parent owns the state.
 */
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Type, X, Zap } from 'lucide-react';
import { moveItem, snapSpan, snapTargets, snapTime, trimItem, removeItem, type SeqClip, type SmartTracks, type TrackName } from '@/lib/services/montage/smart/timeline';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export interface SmartLanesProps {
  tracks: SmartTracks;
  clips: readonly SeqClip[];
  totalSec: number;
  pxPerSec: number;
  /** Left padding of the timeline content (half a viewport, so 0 s sits under the playhead). */
  pad: number;
  top: number;
  laneH: number;
  playheadSec: number;
  beats?: readonly number[];
  labels: { text: string; fx: string; remove: string; fxNames: Record<string, string> };
  onChange: (next: SmartTracks) => void;
}

/** Total height the two lanes take, gap included. */
export const smartLanesHeight = (laneH: number): number => laneH * 2 + 4;

type Drag = { track: TrackName; id: string; mode: 'move' | 'start' | 'end'; x0: number; t0: number; t1: number; pointer: number };

export function SmartLanes(p: SmartLanesProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);

  const begin = (e: ReactPointerEvent, track: TrackName, id: string, mode: Drag['mode'], t0: number, t1: number) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { track, id, mode, x0: e.clientX, t0, t1, pointer: e.pointerId };
    setSelected(id);
  };
  const moveTo = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointer) return;
    const dt = (e.clientX - d.x0) / p.pxPerSec;
    const targets = snapTargets({ clips: p.clips, tracks: p.tracks, playheadSec: p.playheadSec, beats: p.beats ?? [], excludeId: d.id });
    const free = e.altKey;
    if (d.mode === 'move') {
      const s = snapSpan(d.t0 + dt, d.t1 - d.t0, targets, p.pxPerSec, { free });
      p.onChange(moveItem(p.tracks, d.track, d.id, s.t0, p.totalSec));
    } else {
      const raw = (d.mode === 'start' ? d.t0 : d.t1) + dt;
      const s = snapTime(raw, targets, p.pxPerSec, { free });
      p.onChange(trimItem(p.tracks, d.track, d.id, d.mode, s.t, p.totalSec));
    }
  };
  const end = (e: ReactPointerEvent) => {
    if (drag.current && e.pointerId === drag.current.pointer) drag.current = null;
  };

  const lane = (track: TrackName, row: number) => {
    const items = track === 'text' ? p.tracks.texts : p.tracks.effects;
    const top = p.top + row * (p.laneH + 4);
    return (
      <div key={track} data-testid={`smart-lane-${track}`}>
        <span className="absolute flex items-center gap-1 text-[9.5px] text-app-muted" style={{ left: p.pad - 66, top, height: p.laneH }} aria-hidden="true">
          {track === 'text' ? <Type size={11} /> : <Zap size={11} />}
          {track === 'text' ? p.labels.text : p.labels.fx}
        </span>
        {items.map((it) => {
          const label = 'text' in it ? it.text : p.labels.fxNames[it.kind] ?? it.kind;
          const isSel = selected === it.id;
          const left = p.pad + it.t0 * p.pxPerSec;
          const width = Math.max(18, (it.t1 - it.t0) * p.pxPerSec);
          return (
            <div
              key={it.id}
              role="button"
              tabIndex={0}
              aria-label={label}
              aria-pressed={isSel}
              data-testid={`smart-item-${it.id}`}
              onPointerDown={(e) => begin(e, track, it.id, 'move', it.t0, it.t1)}
              onPointerMove={moveTo}
              onPointerUp={end}
              onPointerCancel={end}
              onKeyDown={(e) => {
                if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); p.onChange(removeItem(p.tracks, track, it.id)); }
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  e.preventDefault();
                  p.onChange(moveItem(p.tracks, track, it.id, it.t0 + (e.key === 'ArrowLeft' ? -0.1 : 0.1), p.totalSec));
                }
              }}
              className={cx(
                'absolute flex touch-none items-center overflow-hidden rounded px-2 text-[10.5px] leading-none ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent',
                track === 'text' ? 'bg-sky-500/20 text-app-text ring-sky-400/40' : 'bg-fuchsia-500/20 text-app-text ring-fuchsia-400/40',
                isSel && 'ring-2 ring-app-accent',
              )}
              style={{ left, width, top, height: p.laneH, cursor: 'grab' }}
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/10"
                onPointerDown={(e) => begin(e, track, it.id, 'start', it.t0, it.t1)}
                onPointerMove={moveTo}
                onPointerUp={end}
              />
              <span className="truncate">{label}</span>
              <span
                aria-hidden="true"
                className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/10"
                onPointerDown={(e) => begin(e, track, it.id, 'end', it.t0, it.t1)}
                onPointerMove={moveTo}
                onPointerUp={end}
              />
              {isSel && (
                <button
                  type="button"
                  aria-label={p.labels.remove}
                  data-testid={`smart-remove-${it.id}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => { p.onChange(removeItem(p.tracks, track, it.id)); setSelected(null); }}
                  className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <X size={11} aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {lane('text', 0)}
      {lane('effects', 1)}
      {(p.beats ?? []).map((b) => (
        <span key={b} aria-hidden="true" className="pointer-events-none absolute w-px bg-amber-300/30" style={{ left: p.pad + b * p.pxPerSec, top: p.top, height: smartLanesHeight(p.laneH) }} />
      ))}
    </>
  );
}
