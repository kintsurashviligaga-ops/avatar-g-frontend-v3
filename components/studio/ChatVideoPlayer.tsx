'use client';

/**
 * ChatVideoPlayer — the chat's own video player, in place of the browser's grey <video controls> bar (the owner, after the
 * Preview run of 2026-10-09: „the player looks very bad, not modern"). A frame of the video as its face with one round
 * play button in the middle; while it plays, a bar that fades in on hover or a tap: play/pause, the time, a scrub line
 * you can drag, sound, full screen. Space / K play and pause, ← → seek 5 s, M mutes, F goes full screen.
 *
 * Two sizes: `result` (a generated video in a reply, its own shape) and `attachment` (a clip the user sent, a short tile
 * whose width follows the clip's own shape once it is known).
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Pause, Play, Volume2, VolumeX } from 'lucide-react';

const fmt = (s: number) => (!isFinite(s) || s < 0 ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);

type Lang = 'ka' | 'en' | 'ru';
const L: Record<Lang, { play: string; pause: string; mute: string; unmute: string; full: string; seek: string; video: string }> = {
  ka: { play: 'დაკვრა', pause: 'პაუზა', mute: 'ხმის გამორთვა', unmute: 'ხმის ჩართვა', full: 'სრულ ეკრანზე', seek: 'ვიდეოს პოზიცია', video: 'ვიდეო' },
  en: { play: 'Play', pause: 'Pause', mute: 'Mute', unmute: 'Unmute', full: 'Full screen', seek: 'Video position', video: 'Video' },
  ru: { play: 'Воспроизвести', pause: 'Пауза', mute: 'Выключить звук', unmute: 'Включить звук', full: 'Во весь экран', seek: 'Позиция видео', video: 'Видео' },
};

export interface VideoMeta { duration: number; width: number; height: number }

export const ChatVideoPlayer = memo(function ChatVideoPlayer({
  src, poster, locale = 'ka', variant = 'result', className = '', label, onMeta,
}: {
  src: string;
  poster?: string;
  locale?: string;
  variant?: 'result' | 'attachment';
  /** Sizing for the frame (a result passes its orientation's box). */
  className?: string;
  /** The accessible name of the video. */
  label?: string;
  onMeta?: (m: VideoMeta) => void;
}) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = L[lang];
  const boxRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null);
  // The bar shows while paused, on hover, and for a moment after a tap or a key while it plays.
  const [awake, setAwake] = useState(false);
  const sleepRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wake = useCallback(() => {
    setAwake(true);
    if (sleepRef.current) clearTimeout(sleepRef.current);
    sleepRef.current = setTimeout(() => setAwake(false), 2400);
  }, []);
  useEffect(() => () => { if (sleepRef.current) clearTimeout(sleepRef.current); }, []);

  const toggle = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    if (v.paused || v.ended) { void v.play().catch(() => {}); } else { v.pause(); }
    wake();
  }, [wake]);
  // A tap on a playing video first shows the bar (as on a phone's own player); the next tap pauses. A click pauses at once.
  const lastPointer = useRef<string>('mouse');
  const awakeRef = useRef(false);
  useEffect(() => { awakeRef.current = awake; }, [awake]);
  const onVideoClick = useCallback(() => {
    if (lastPointer.current !== 'mouse' && playing && !awakeRef.current) { wake(); return; }
    toggle();
  }, [playing, toggle, wake]);

  const seekBy = useCallback((d: number) => {
    const v = ref.current;
    if (!v || !isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + d));
    setCur(v.currentTime);
    wake();
  }, [wake]);

  const toggleMute = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    wake();
  }, [wake]);

  const fullscreen = useCallback(() => {
    const box = boxRef.current;
    const v = ref.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) { void document.exitFullscreen().catch(() => {}); return; }
    if (box?.requestFullscreen) { void box.requestFullscreen().catch(() => v?.webkitEnterFullscreen?.()); return; }
    v?.webkitEnterFullscreen?.(); // iOS Safari: only the video element itself goes full screen.
  }, []);

  // Drag-to-scrub with pointer capture (mouse and touch alike); a vertical swipe still scrolls the feed.
  const dragging = useRef(false);
  const seekToX = useCallback((clientX: number, el: HTMLElement) => {
    const v = ref.current;
    if (!v || !isFinite(v.duration) || v.duration <= 0) return;
    const r = el.getBoundingClientRect();
    v.currentTime = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * v.duration;
    setCur(v.currentTime);
  }, []);
  const onScrubDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    dragging.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    seekToX(e.clientX, e.currentTarget);
    wake();
  };
  const onScrubMove = (e: React.PointerEvent<HTMLDivElement>) => { if (dragging.current) { seekToX(e.clientX, e.currentTarget); wake(); } };
  const onScrubUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* unsupported */ }
  };

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget && (e.target as HTMLElement).getAttribute('role') !== 'slider') return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'k') { e.preventDefault(); toggle(); }
    else if (k === 'arrowleft') { e.preventDefault(); seekBy(-5); }
    else if (k === 'arrowright') { e.preventDefault(); seekBy(5); }
    else if (k === 'm') { e.preventDefault(); toggleMute(); }
    else if (k === 'f') { e.preventDefault(); fullscreen(); }
  };

  const pct = dur > 0 ? (cur / dur) * 100 : 0;
  const ctl = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70';
  const small = variant === 'attachment';
  const showBar = started && (!playing || awake);
  // An attachment tile takes the clip's own shape once its size is known (a vertical clip is a narrow tile).
  const tileStyle = small ? { aspectRatio: ratio ? String(ratio) : '16 / 9' } : undefined;

  return (
    <div
      ref={boxRef}
      tabIndex={0}
      role="group"
      aria-label={label ?? t.video}
      onKeyDown={onKey}
      onPointerDownCapture={(e) => { lastPointer.current = e.pointerType; }}
      onPointerMove={(e) => { if (e.pointerType === 'mouse') wake(); }}
      onMouseLeave={() => setAwake(false)}
      data-playing={playing ? 'true' : 'false'}
      className={`group/player relative overflow-hidden bg-black ring-1 ring-app-border/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 [&:fullscreen]:rounded-none ${small ? 'h-24 max-w-full rounded-xl sm:h-28' : 'rounded-2xl'} ${className}`}
      style={tileStyle}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={ref}
        // #t=0.1 paints a real frame as the face (not a black box); preload=metadata loads that frame up front. A data:
        // address (a small file the user just attached) is left as it is: its bytes are already here.
        src={/^(https?:|blob:)/i.test(src) ? `${src}#t=0.1` : src}
        poster={poster}
        playsInline
        preload="metadata"
        onClick={onVideoClick}
        onDoubleClick={fullscreen}
        onPlay={() => { setPlaying(true); setStarted(true); }}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setAwake(true); }}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onProgress={(e) => {
          const v = e.currentTarget;
          if (v.buffered.length && isFinite(v.duration) && v.duration > 0) setBuffered((v.buffered.end(v.buffered.length - 1) / v.duration) * 100);
        }}
        onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (isFinite(v.duration)) setDur(v.duration);
          if (v.videoWidth > 0 && v.videoHeight > 0) setRatio(v.videoWidth / v.videoHeight);
          onMeta?.({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
        }}
        className="block h-full w-full cursor-pointer object-contain"
      />

      {/* The face: one round play button, and the length in the corner. */}
      {!playing ? (
        <button
          type="button"
          onClick={toggle}
          aria-label={t.play}
          className={`absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/45 via-black/5 to-transparent transition-opacity duration-200 focus-visible:outline-none`}
        >
          <span className={`flex items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/25 backdrop-blur-md transition-transform duration-200 group-hover/player:scale-105 ${small ? 'h-9 w-9' : 'h-14 w-14'}`}>
            <Play size={small ? 16 : 24} fill="currentColor" aria-hidden="true" className="ml-0.5" />
          </span>
        </button>
      ) : null}
      {!started && dur > 0 ? (
        <span className={`pointer-events-none absolute rounded-md bg-black/60 font-medium tabular-nums text-white ${small ? 'bottom-1.5 right-1.5 px-1.5 py-0.5 text-[10.5px]' : 'bottom-3 right-3 px-2 py-0.5 text-[12px]'}`}>{fmt(dur)}</span>
      ) : null}

      {/* The bar: play/pause · time · scrub · sound · full screen. A sent clip's small tile keeps only the scrub line and,
          in its corner, full screen. */}
      <div
        className={`absolute inset-x-0 bottom-0 flex items-center text-white transition-opacity duration-200 ${small ? 'px-2 pb-0.5' : 'gap-2 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-3 pb-2 pt-8'} ${showBar ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      >
        {!small ? (
          <>
            <button type="button" onClick={toggle} aria-label={playing ? t.pause : t.play} className={ctl}>
              {playing ? <Pause size={17} fill="currentColor" aria-hidden="true" /> : <Play size={17} fill="currentColor" aria-hidden="true" className="ml-0.5" />}
            </button>
            <span className="shrink-0 text-[12px] font-medium tabular-nums text-white/90">{fmt(cur)} <span className="text-white/50">/ {fmt(dur)}</span></span>
          </>
        ) : null}
        <div
          role="slider"
          tabIndex={0}
          aria-label={t.seek}
          aria-valuemin={0}
          aria-valuemax={Math.round(dur)}
          aria-valuenow={Math.round(cur)}
          aria-valuetext={`${fmt(cur)} / ${fmt(dur)}`}
          onPointerDown={onScrubDown}
          onPointerMove={onScrubMove}
          onPointerUp={onScrubUp}
          onPointerCancel={onScrubUp}
          className="group/scrub relative min-w-0 flex-1 cursor-pointer touch-pan-y py-2.5 focus-visible:outline-none"
        >
          <div className="relative h-1 rounded-full bg-white/25 transition-[height] duration-150 group-hover/scrub:h-1.5">
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/30" style={{ width: `${buffered}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-app-accent" style={{ width: `${pct}%` }} />
            <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover/scrub:opacity-100 group-focus-visible/scrub:opacity-100" style={{ left: `${pct}%` }} />
          </div>
        </div>
        {!small ? (
          <>
            <button type="button" onClick={toggleMute} aria-label={muted ? t.unmute : t.mute} className={ctl}>
              {muted ? <VolumeX size={17} aria-hidden="true" /> : <Volume2 size={17} aria-hidden="true" />}
            </button>
            <button type="button" onClick={fullscreen} aria-label={t.full} className={ctl}>
              <Maximize2 size={16} aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>
      {small ? (
        <button type="button" onClick={fullscreen} aria-label={t.full}
          className={`absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-opacity duration-200 focus-visible:opacity-100 ${showBar ? 'opacity-100' : 'opacity-0 [@media(hover:hover)]:group-hover/player:opacity-100'}`}>
          <Maximize2 size={12} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
});

export default ChatVideoPlayer;
