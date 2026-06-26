'use client';

/**
 * TrackPlayer — a polished, Suno-style audio player for generated music.
 * Album-art hero with a centred play/pause, a seekable progress bar with elapsed/
 * total time, and a subtle moving level shimmer while playing. Replaces the raw
 * <audio controls> (palette: navy/cyan, app tokens).
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { Play, Pause, Music2 } from 'lucide-react';

const fmt = (s: number) => (!isFinite(s) || s < 0 ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);

export function TrackPlayer({ url, coverUrl, label, engine }: { url: string; coverUrl?: string; label: string; engine?: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  const toggle = useCallback(() => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) { void a.play(); } else { a.pause(); }
  }, []);

  const dragging = useRef(false);

  // Seek from any clientX against the track element — shared by pointer + drag.
  const seekToX = useCallback((clientX: number, el: HTMLElement) => {
    const a = ref.current;
    if (!a || !dur) return;
    const r = el.getBoundingClientRect();
    a.currentTime = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * dur;
    setCur(a.currentTime);
  }, [dur]);

  // Pointer events unify mouse + touch and, with pointer capture, give a smooth
  // drag-to-scrub on mobile (a plain onClick only jumped once and never dragged).
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    seekToX(e.clientX, e.currentTarget);
  }, [seekToX]);
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current) seekToX(e.clientX, e.currentTarget);
  }, [seekToX]);
  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* unsupported */ }
  }, []);

  // Arrow keys nudge ±5s — keeps the role="slider" keyboard-operable.
  const onKey = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const a = ref.current;
    if (!a || !dur) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); a.currentTime = Math.max(0, a.currentTime - 5); setCur(a.currentTime); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); a.currentTime = Math.min(dur, a.currentTime + 5); setCur(a.currentTime); }
  }, [dur]);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    return () => { a.removeEventListener('play', onPlay); a.removeEventListener('pause', onPause); };
  }, []);

  const pct = dur ? (cur / dur) * 100 : 0;

  return (
    <div className="w-full">
      {/* Album art + centred play control */}
      <div className="relative aspect-square w-full overflow-hidden rounded-xl">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-500/30 to-blue-800/40">
            <Music2 className="text-white/60" size={40} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
          <Music2 size={12} /> {label}
        </span>
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'pause' : 'play'}
          className="absolute bottom-3 right-3 flex h-12 w-12 items-center justify-center rounded-full bg-cyan-400 text-slate-950 shadow-[0_4px_20px_rgba(34,211,238,0.5)] transition-transform hover:scale-110 active:scale-95"
        >
          {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
        </button>
      </div>

      {/* Scrubber + time */}
      <div className="mt-2.5 space-y-1">
        {/* -my-2.5 + py-2.5 gives a ~28px touch zone around the 8px visual track
            (WCAG 2.5.5) without changing layout. touch-pan-y (not touch-none) lets a
            vertical swipe still scroll the page/feed while horizontal drags are
            captured by the pointer handlers for scrubbing. */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKey}
          className="group relative -my-2.5 cursor-pointer touch-pan-y py-2.5"
          role="slider"
          aria-label={label}
          aria-valuemin={0}
          aria-valuenow={Math.round(cur)}
          aria-valuemax={Math.round(dur)}
          tabIndex={0}
        >
          <div className="relative h-2 rounded-full bg-app-border/25">
            <div className="absolute inset-y-0 left-0 rounded-full bg-cyan-400" style={{ width: `${pct}%` }} />
            {/* Always visible on touch (no hover); hover-reveal on pointer devices. */}
            <div className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white opacity-100 shadow transition-opacity sm:opacity-0 sm:group-hover:opacity-100" style={{ left: `calc(${pct}% - 7px)` }} />
          </div>
        </div>
        <div className="flex justify-between text-[11px] tabular-nums text-app-muted/80">
          <span>{fmt(cur)}</span><span>{fmt(dur)}</span>
        </div>
        {/* Honest provenance badge — the engine that actually produced the track
            (Udio / ElevenLabs Music / MusicGen / cloned voice), reported by the API. */}
        {engine && (
          <div className="flex items-center gap-1.5 pt-0.5 text-[10.5px] font-medium text-app-muted/70">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400/80" />
            <span>Generated with {engine}</span>
          </div>
        )}
      </div>

      <audio
        ref={ref}
        src={url}
        preload="metadata"
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
    </div>
  );
}

export default TrackPlayer;
