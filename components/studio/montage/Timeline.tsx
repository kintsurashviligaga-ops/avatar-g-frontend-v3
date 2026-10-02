'use client';

/**
 * components/studio/montage/Timeline.tsx — the CapCut timeline: a fixed playhead in the middle, the edit
 * scrolling under it.
 *
 *   ruler   ·  0:00 ·  0:02 ·  0:04 …
 *   video   [sound] [clip ▮▮▮▮][|][clip ▮▮▮][|][clip ▮▮] [+]
 *   text            [T caption ]      [T title]
 *   music   [♫ track ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~]
 *
 * Scrolling IS seeking: the time under the playhead is `scrollLeft / pxPerSec`, so the edit starts and ends
 * exactly under it (half a viewport of padding on each side). While the preview plays, the player moves the
 * scroll position itself (`scrollToTime`), and those programmatic scrolls are told apart from the user's.
 *
 * A selected clip gets the white frame with two handles. The RIGHT handle trims live — the edge follows the
 * finger and everything after it shifts, as in CapCut. The LEFT handle shows the cut as a dimmed region and
 * applies it on release: trimming a clip's start live would slide the clip out from under the finger.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { AlertCircle, Layers, Loader2, Minus, Music2, Plus, Square, Type, Volume2, VolumeX } from 'lucide-react';
import type { Copy } from './copy';
import { fmtSec, fmtTime } from './media';
import { clipDuration, type Clip, type MediaSource, type Placed } from './project';

export interface TimelineMusic {
  name: string;
  durationSec: number;
  peaks: number[];
  status: MediaSource['status'];
}

export interface TimelineProps {
  t: Copy;
  clips: Clip[];
  placed: Placed[];
  totalSec: number;
  sources: Record<string, MediaSource>;
  /** sourceId → filmstrip frames spread evenly over the SOURCE's length. */
  thumbs: Record<string, string[]>;
  pxPerSec: number;
  selectedId: string | null;
  music: TimelineMusic | null;
  originalSound: boolean;
  /** Short tracks on a phone, roomier on a desktop. */
  compact: boolean;
  onSeek: (t: number) => void;
  onUserScrollStart: () => void;
  onSelect: (id: string | null) => void;
  onTrimBegin: (id: string) => void;
  onTrim: (id: string, edge: 'start' | 'end', sourceSec: number) => void;
  onTrimEnd: () => void;
  onTransition: (clipId: string) => void;
  onAddClip: () => void;
  onMusic: () => void;
  onText: (clipId: string | null) => void;
  onToggleOriginal: () => void;
  onZoom: (factor: number) => void;
}

export interface TimelineHandle {
  /** Move the edit so `t` sits under the playhead, without it counting as the user's scroll. */
  scrollToTime: (t: number) => void;
}

const RULER_H = 18;

export const Timeline = forwardRef<TimelineHandle, TimelineProps>(function Timeline(p, ref) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const [viewW, setViewW] = useState(360);
  const lastProgrammatic = useRef<number | null>(null);
  const pxRef = useRef(p.pxPerSec);
  pxRef.current = p.pxPerSec;

  const videoH = p.compact ? 52 : 60;
  const textH = p.compact ? 22 : 24;
  const musicH = p.compact ? 30 : 34;
  const pad = viewW / 2;
  const contentW = pad * 2 + p.totalSec * p.pxPerSec;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth || 360));
    ro.observe(el);
    setViewW(el.clientWidth || 360);
    return () => ro.disconnect();
  }, []);

  const scrollToTime = useCallback((t: number) => {
    const el = scroller.current;
    if (!el) return;
    const x = Math.round(t * pxRef.current);
    lastProgrammatic.current = x;
    el.scrollLeft = x;
  }, []);
  useImperativeHandle(ref, () => ({ scrollToTime }), [scrollToTime]);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const x = el.scrollLeft;
    if (lastProgrammatic.current !== null && Math.abs(x - lastProgrammatic.current) <= 2) return;
    lastProgrammatic.current = null;
    p.onUserScrollStart();
    p.onSeek(x / pxRef.current);
  }, [p]);

  // ZOOM: ctrl/⌘ + wheel or a trackpad pinch on a desktop; two fingers on a phone. Non-passive listeners,
  // because the page itself must not zoom while the timeline does.
  const onZoom = p.onZoom;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      onZoom(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    let pinch: number | null = null;
    const dist = (e: TouchEvent) => {
      const [a, b] = [e.touches[0], e.touches[1]];
      return a && b ? Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) : 0;
    };
    const tStart = (e: TouchEvent) => { if (e.touches.length === 2) pinch = dist(e); };
    const tMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch) return;
      e.preventDefault();
      const d = dist(e);
      if (d > 0 && Math.abs(d / pinch - 1) > 0.04) { onZoom(d / pinch); pinch = d; }
    };
    const tEnd = () => { pinch = null; };
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('touchstart', tStart, { passive: true });
    el.addEventListener('touchmove', tMove, { passive: false });
    el.addEventListener('touchend', tEnd);
    return () => {
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('touchstart', tStart);
      el.removeEventListener('touchmove', tMove);
      el.removeEventListener('touchend', tEnd);
    };
  }, [onZoom]);

  // ── Trim drag ──────────────────────────────────────────────────────────────────────────────────────
  const [leftDrag, setLeftDrag] = useState<{ id: string; value: number } | null>(null);
  const drag = useRef<{ id: string; edge: 'start' | 'end'; x0: number; v0: number; pointer: number } | null>(null);

  const beginTrim = (e: React.PointerEvent, c: Clip, edge: 'start' | 'end') => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { id: c.id, edge, x0: e.clientX, v0: edge === 'start' ? c.startSec : c.endSec, pointer: e.pointerId };
    p.onTrimBegin(c.id);
    if (edge === 'start') setLeftDrag({ id: c.id, value: c.startSec });
  };
  const moveTrim = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const value = d.v0 + (e.clientX - d.x0) / pxRef.current;
    if (d.edge === 'end') p.onTrim(d.id, 'end', value);
    else setLeftDrag({ id: d.id, value });
  };
  const endTrim = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    drag.current = null;
    if (d.edge === 'start') {
      p.onTrim(d.id, 'start', d.v0 + (e.clientX - d.x0) / pxRef.current);
      setLeftDrag(null);
    }
    p.onTrimEnd();
  };
  const nudge = (e: React.KeyboardEvent, c: Clip, edge: 'start' | 'end') => {
    const step = e.shiftKey ? 1 : 0.1;
    const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    p.onTrimBegin(c.id);
    p.onTrim(c.id, edge, (edge === 'start' ? c.startSec : c.endSec) + dir * step);
    p.onTrimEnd();
  };

  // ── Ruler ticks: one label every 1/2/5/10/30 s, whichever keeps labels ≥ 56 px apart ────────────────
  const ticks = useMemo(() => {
    const steps = [1, 2, 5, 10, 30, 60];
    const step = steps.find((s) => s * p.pxPerSec >= 56) ?? 60;
    const out: number[] = [];
    for (let s = 0; s <= p.totalSec + 1e-6; s += step) out.push(s);
    return { step, out };
  }, [p.pxPerSec, p.totalSec]);

  const tracksTop = RULER_H + 6;
  const textTop = tracksTop + videoH + 6;
  const musicTop = textTop + textH + 6;
  const height = musicTop + musicH + 8;
  const anyCaption = p.clips.some((c) => c.caption.trim());

  return (
    <div className="relative w-full select-none" style={{ height }} data-testid="montage-timeline">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="absolute inset-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ touchAction: 'pan-x' }}
        role="group"
        aria-label={p.t.timeline}
      >
        <div
          className="relative h-full"
          style={{ width: contentW }}
          onPointerDown={(e) => { if (e.target === e.currentTarget) p.onSelect(null); }}
        >
          {/* Ruler */}
          <div className="absolute left-0 right-0 top-0" style={{ height: RULER_H }} aria-hidden="true">
            {ticks.out.map((s) => (
              <div key={s} className="absolute top-0 flex h-full items-end" style={{ left: pad + s * p.pxPerSec }}>
                <span className="-translate-x-1/2 text-[10px] tabular-nums leading-none text-app-muted/80">{fmtTime(s)}</span>
              </div>
            ))}
            {ticks.out.map((s) => (
              <span key={`m${s}`} className="absolute top-[13px] h-[5px] w-px bg-app-border/25" style={{ left: pad + (s + ticks.step / 2) * p.pxPerSec }} />
            ))}
          </div>

          {/* Clip sound — left of the first clip, like CapCut's „Mute clip audio" */}
          {p.clips.length > 0 && (
            <button
              type="button"
              data-testid="montage-original-sound"
              aria-pressed={p.originalSound}
              aria-label={p.originalSound ? p.t.originalOn : p.t.originalOff}
              onClick={p.onToggleOriginal}
              className="absolute flex w-11 flex-col items-center justify-center gap-0.5 rounded-lg text-app-muted transition hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
              style={{ left: pad - 66, top: tracksTop, height: videoH }}
            >
              {p.originalSound ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" className="text-app-text" />}
              <span className="text-[9.5px] leading-none">{p.t.clipSound}</span>
            </button>
          )}

          {/* Video track */}
          {p.clips.map((c, i) => {
            const pl = p.placed[i];
            if (!pl) return null;
            const src = p.sources[c.sourceId];
            const selected = p.selectedId === c.id;
            const ghost = leftDrag && leftDrag.id === c.id ? leftDrag : null;
            const width = (pl.t1 - pl.t0) * p.pxPerSec;
            const cutPx = ghost ? Math.max(-c.startSec, ghost.value - c.startSec) * p.pxPerSec : 0;
            return (
              <div
                key={c.id}
                className={`absolute ${selected ? 'z-20' : 'z-10'}`}
                style={{ left: pad + pl.t0 * p.pxPerSec, top: tracksTop, width, height: videoH }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  data-testid="montage-clip"
                  data-selected={selected ? 'true' : 'false'}
                  aria-pressed={selected}
                  aria-label={`${p.t.clipN} ${i + 1} · ${fmtSec(clipDuration(c), p.t.sec)}${c.muted ? ` · ${p.t.mute}` : ''}`}
                  // No focus on a pointer press: focusing a half-visible clip scrolls the timeline to show it, and
                  // here scrolling IS seeking — tapping a clip would move the playhead. Keyboard focus is untouched.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => p.onSelect(selected ? null : c.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelect(selected ? null : c.id); } }}
                  className="relative h-full w-full overflow-hidden rounded-md bg-app-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/70"
                >
                  <Filmstrip clip={c} src={src} frames={p.thumbs[c.sourceId] ?? []} width={width} height={videoH} pxPerSec={p.pxPerSec} />
                  <span className="absolute bottom-0.5 left-1 rounded bg-black/55 px-1 text-[10px] tabular-nums leading-[14px] text-white">
                    {fmtSec(clipDuration(c), p.t.sec)}
                  </span>
                  {c.muted && (
                    <VolumeX size={12} aria-hidden="true" className="absolute right-1 top-1 rounded bg-black/55 p-0.5 text-white" />
                  )}
                  {src?.status === 'uploading' && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/45" aria-label={p.t.uploading}>
                      <Loader2 size={16} aria-hidden="true" className="animate-spin text-white motion-reduce:animate-none" />
                    </span>
                  )}
                  {src?.status === 'error' && (
                    <span className="absolute inset-0 flex items-center justify-center gap-1 bg-black/60 px-1 text-[10px] text-app-danger" title={src.error ?? p.t.failed}>
                      <AlertCircle size={14} aria-hidden="true" /> <span className="truncate">{p.t.failed}</span>
                    </span>
                  )}
                  {ghost && cutPx > 0 && (
                    <span className="absolute inset-y-0 left-0 bg-black/65" style={{ width: Math.min(cutPx, width - 8) }} aria-hidden="true" />
                  )}
                </div>
                {selected && (
                  <>
                    <span className="pointer-events-none absolute -inset-[2px] rounded-[8px] ring-2 ring-white" aria-hidden="true" />
                    <TrimHandle
                      side="start"
                      label={p.t.trimStart}
                      offset={ghost ? cutPx : 0}
                      onPointerDown={(e) => beginTrim(e, c, 'start')}
                      onPointerMove={moveTrim}
                      onPointerUp={endTrim}
                      onPointerCancel={endTrim}
                      onKeyDown={(e) => nudge(e, c, 'start')}
                    />
                    <TrimHandle
                      side="end"
                      label={p.t.trimEnd}
                      offset={0}
                      onPointerDown={(e) => beginTrim(e, c, 'end')}
                      onPointerMove={moveTrim}
                      onPointerUp={endTrim}
                      onPointerCancel={endTrim}
                      onKeyDown={(e) => nudge(e, c, 'end')}
                    />
                  </>
                )}
              </div>
            );
          })}

          {/* Transition markers on every cut */}
          {p.clips.map((c, i) => {
            if (i === 0) return null;
            const pl = p.placed[i];
            if (!pl) return null;
            // A selected clip's trim handles sit on its two cuts; the markers there would cover them.
            if (p.selectedId && (p.selectedId === c.id || p.selectedId === p.clips[i - 1]?.id)) return null;
            const Icon = c.transition === 'crossfade' ? Layers : c.transition === 'fade' ? Square : Minus;
            return (
              <button
                key={`tr-${c.id}`}
                type="button"
                data-testid="montage-transition"
                data-transition={c.transition}
                aria-label={`${p.t.transitionInto} · ${p.t.clipN} ${i + 1}`}
                onClick={() => p.onTransition(c.id)}
                className={`absolute z-30 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-md ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent ${
                  c.transition === 'cut' ? 'bg-white text-black ring-black/20' : 'bg-app-accent text-black ring-black/10'
                }`}
                style={{ left: pad + pl.t0 * p.pxPerSec, top: tracksTop + videoH / 2 - 12 }}
              >
                <Icon size={12} aria-hidden="true" className={c.transition === 'cut' ? 'rotate-90' : c.transition === 'fade' ? 'fill-black' : ''} />
              </button>
            );
          })}

          {/* Add a clip — right after the last one */}
          <button
            type="button"
            data-testid="montage-add-clip"
            aria-label={p.t.addClip}
            onClick={p.onAddClip}
            className="absolute flex items-center justify-center rounded-lg bg-white text-black transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
            style={{ left: pad + p.totalSec * p.pxPerSec + 10, top: tracksTop + (videoH - 44) / 2, width: 44, height: 44 }}
          >
            <Plus size={20} aria-hidden="true" />
          </button>

          {/* Text track */}
          {p.clips.map((c, i) => {
            const pl = p.placed[i];
            if (!pl || !c.caption.trim()) return null;
            return (
              <button
                key={`tx-${c.id}`}
                type="button"
                data-testid="montage-text-chip"
                onClick={() => p.onText(c.id)}
                className="absolute flex items-center gap-1 overflow-hidden rounded bg-app-elevated px-1.5 text-left text-[11px] text-app-text ring-1 ring-app-border/15 hover:ring-app-border/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
                style={{ left: pad + pl.t0 * p.pxPerSec + 1, width: Math.max(28, (pl.t1 - pl.t0) * p.pxPerSec - 2), top: textTop, height: textH }}
              >
                <Type size={11} aria-hidden="true" className="shrink-0 text-app-muted" />
                <span className="truncate">{c.caption}</span>
              </button>
            );
          })}
          {p.clips.length > 0 && !anyCaption && (
            <button
              type="button"
              data-testid="montage-add-text"
              onClick={() => p.onText(null)}
              className="absolute flex items-center gap-1 rounded bg-app-surface px-2 text-[11px] text-app-muted ring-1 ring-app-border/10 hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
              style={{ left: pad + 1, top: textTop, height: textH }}
            >
              <Plus size={11} aria-hidden="true" /> {p.t.addText}
            </button>
          )}

          {/* Music track */}
          {p.clips.length > 0 && (p.music ? (
            <button
              type="button"
              data-testid="montage-music-bar"
              onClick={p.onMusic}
              className="absolute flex items-center gap-1.5 overflow-hidden rounded bg-app-accent/15 px-1.5 text-left text-[11px] text-app-text ring-1 ring-app-accent/25 hover:bg-app-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
              style={{
                left: pad,
                width: Math.max(44, (p.music.durationSec > 0 ? Math.min(p.music.durationSec, p.totalSec) : p.totalSec) * p.pxPerSec),
                top: musicTop,
                height: musicH,
              }}
            >
              <Waveform peaks={p.music.peaks} />
              <span className="relative flex min-w-0 items-center gap-1">
                {p.music.status === 'uploading'
                  ? <Loader2 size={11} aria-hidden="true" className="shrink-0 animate-spin motion-reduce:animate-none" />
                  : p.music.status === 'error'
                    ? <AlertCircle size={11} aria-hidden="true" className="shrink-0 text-app-danger" />
                    : <Music2 size={11} aria-hidden="true" className="shrink-0 text-app-accent" />}
                <span className="truncate">{p.music.name}</span>
              </span>
            </button>
          ) : (
            <button
              type="button"
              data-testid="montage-add-music"
              onClick={p.onMusic}
              className="absolute flex items-center gap-1 rounded bg-app-surface px-2 text-[11px] text-app-muted ring-1 ring-app-border/10 hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
              style={{ left: pad + 1, top: musicTop, height: musicH }}
            >
              <Music2 size={12} aria-hidden="true" /> {p.t.addAudio}
            </button>
          ))}
        </div>
      </div>

      {/* The playhead — fixed in the middle; the edit moves under it */}
      <div className="pointer-events-none absolute bottom-1 top-0 z-40 w-0.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]" style={{ left: '50%' }} aria-hidden="true">
        <span className="absolute -left-[4px] top-0 h-2.5 w-2.5 rounded-full bg-white" />
      </div>
    </div>
  );
});

function TrimHandle(props: {
  side: 'start' | 'end';
  label: string;
  offset: number;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const start = props.side === 'start';
  return (
    <button
      type="button"
      data-testid={start ? 'montage-trim-start' : 'montage-trim-end'}
      aria-label={props.label}
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onPointerCancel={props.onPointerCancel}
      onKeyDown={props.onKeyDown}
      onClick={(e) => e.stopPropagation()}
      className={`absolute -top-[2px] -bottom-[2px] z-30 flex w-3.5 cursor-ew-resize items-center justify-center bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent ${
        start ? '-left-[14px] rounded-l-[7px]' : '-right-[14px] rounded-r-[7px]'
      }`}
      style={{ touchAction: 'none', ...(start ? { transform: `translateX(${props.offset}px)` } : {}) }}
    >
      {/* The grip, and an invisible 44 px hit area around the slim visible handle */}
      <span className="h-4 w-[3px] rounded-full bg-black/45" aria-hidden="true" />
      <span className={`absolute inset-y-0 w-11 ${start ? 'right-0' : 'left-0'}`} aria-hidden="true" />
    </button>
  );
}

/** The frames under a clip: each tile shows the source frame nearest the time it covers. */
function Filmstrip({ clip, src, frames, width, height, pxPerSec }: {
  clip: Clip; src: MediaSource | undefined; frames: string[]; width: number; height: number; pxPerSec: number;
}) {
  if (!src) return null;
  const tileW = Math.max(24, Math.round(height * 0.72));
  const n = Math.max(1, Math.ceil(width / tileW));
  if (src.kind === 'image') {
    return (
      <div className="flex h-full" aria-hidden="true">
        {Array.from({ length: n }, (_, k) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={k} src={src.previewUrl} alt="" draggable={false} className="h-full shrink-0 object-cover" style={{ width: tileW }} />
        ))}
      </div>
    );
  }
  if (!frames.length || src.durationSec <= 0) {
    return <div className="h-full w-full bg-gradient-to-b from-app-elevated to-app-surface" aria-hidden="true" />;
  }
  return (
    <div className="flex h-full" aria-hidden="true">
      {Array.from({ length: n }, (_, k) => {
        const at = clip.startSec + ((k + 0.5) * tileW) / pxPerSec;
        const fi = Math.max(0, Math.min(frames.length - 1, Math.floor((at / src.durationSec) * frames.length)));
        // eslint-disable-next-line @next/next/no-img-element
        return <img key={k} src={frames[fi]} alt="" draggable={false} className="h-full shrink-0 object-cover" style={{ width: tileW }} />;
      })}
    </div>
  );
}

function Waveform({ peaks }: { peaks: number[] }) {
  if (!peaks.length) return null;
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center gap-px px-1 opacity-60" aria-hidden="true">
      {peaks.map((v, i) => (
        <span key={i} className="min-w-px flex-1 rounded-full bg-app-accent/70" style={{ height: `${Math.round(v * 80)}%` }} />
      ))}
    </span>
  );
}
