'use client';

/**
 * ChatAudioPlayer — the chat's own audio row, in place of the browser's white <audio controls> pill (the owner, after
 * the Preview run of 2026-10-09: „the player looks very bad, not modern"). A round play button, the file's name and
 * facts, and the track's own waveform you can tap or drag to seek, lit up to where it has played, with the time beside
 * it. The waveform is the sound's real loudness, decoded once at a low rate (a file up to 12 MB); until then, and for a
 * file that cannot be read (too big, a link that refuses it), the bars lie flat as a plain line: never an invented shape.
 *
 * Two sizes: `attachment` (a track the user sent, under their bubble) and `result` (an MP3 Agent G made).
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Music2, Pause, Play } from 'lucide-react';

const fmt = (s: number) => (!isFinite(s) || s < 0 ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);

type Lang = 'ka' | 'en' | 'ru';
const L: Record<Lang, { play: string; pause: string; seek: string; audio: string }> = {
  ka: { play: 'დაკვრა', pause: 'პაუზა', seek: 'აუდიოს პოზიცია', audio: 'აუდიო' },
  en: { play: 'Play', pause: 'Pause', seek: 'Audio position', audio: 'Audio' },
  ru: { play: 'Воспроизвести', pause: 'Пауза', seek: 'Позиция аудио', audio: 'Аудио' },
};

/** The loudest sample in each of `n` equal slices of `data`, scaled so the loudest slice is 1 (floor 0.12). */
export function peaksOf(data: Float32Array, n: number): number[] {
  const out: number[] = [];
  const size = Math.max(1, Math.floor(data.length / n));
  for (let i = 0; i < n; i++) {
    let max = 0;
    const end = Math.min(data.length, (i + 1) * size);
    for (let j = i * size; j < end; j++) { const v = Math.abs(data[j]!); if (v > max) max = v; }
    out.push(max);
  }
  const top = Math.max(...out, 1e-6);
  return out.map((v) => Math.max(0.12, v / top));
}

const PEAKS_MAX_BYTES = 12 * 1024 * 1024;

/** The track's waveform: fetched once and decoded at 8 kHz mono (light on a phone). Null until known, or when it cannot be. */
function usePeaks(src: string, n: number): number[] | null {
  const [peaks, setPeaks] = useState<number[] | null>(null);
  useEffect(() => {
    setPeaks(null);
    if (typeof window === 'undefined' || typeof fetch !== 'function' || typeof OfflineAudioContext === 'undefined') return;
    const ctl = new AbortController();
    void (async () => {
      try {
        const res = await fetch(src, { signal: ctl.signal });
        if (!res.ok || Number(res.headers.get('content-length') || 0) > PEAKS_MAX_BYTES) return;
        const buf = await res.arrayBuffer();
        if (buf.byteLength > PEAKS_MAX_BYTES || ctl.signal.aborted) return;
        const audio = await new OfflineAudioContext(1, 1, 8000).decodeAudioData(buf);
        if (!ctl.signal.aborted) setPeaks(peaksOf(audio.getChannelData(0), n));
      } catch { /* a plain line it stays */ }
    })();
    return () => ctl.abort();
  }, [src, n]);
  return peaks;
}

export const ChatAudioPlayer = memo(function ChatAudioPlayer({
  src, name, info, locale = 'ka', variant = 'attachment',
}: {
  src: string;
  /** The file's own name (a sent track, an MP3 Agent G made). */
  name?: string;
  /** Facts under the name („3:09 · 4.3 MB · MP3 192 kbps"). */
  info?: string;
  locale?: string;
  variant?: 'attachment' | 'result';
}) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = L[lang];
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const big = variant === 'result';
  const count = big ? 56 : 40;
  const peaks = usePeaks(src, count);

  const toggle = useCallback(() => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) { void a.play().catch(() => {}); } else { a.pause(); }
  }, []);

  const dragging = useRef(false);
  const seekToX = useCallback((clientX: number, el: HTMLElement) => {
    const a = ref.current;
    if (!a || !isFinite(a.duration) || a.duration <= 0) return;
    const r = el.getBoundingClientRect();
    a.currentTime = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * a.duration;
    setCur(a.currentTime);
  }, []);
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const a = ref.current;
    if (!a || !isFinite(a.duration)) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); a.currentTime = Math.max(0, a.currentTime - 5); setCur(a.currentTime); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); a.currentTime = Math.min(a.duration, a.currentTime + 5); setCur(a.currentTime); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
  };

  const played = dur > 0 ? cur / dur : 0;
  const title = name || t.audio;

  return (
    <div
      data-playing={playing ? 'true' : 'false'}
      className={`flex max-w-full items-center gap-3 rounded-2xl bg-app-elevated/70 ring-1 ring-app-border/15 ${big ? 'w-[min(88vw,420px)] p-3.5' : 'w-[min(85vw,340px)] px-3 py-2.5'}`}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={`${playing ? t.pause : t.play}: ${title}`}
        className={`flex shrink-0 items-center justify-center rounded-full bg-app-accent text-app-bg transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg ${big ? 'h-12 w-12' : 'h-10 w-10'}`}
      >
        {playing ? <Pause size={big ? 20 : 17} fill="currentColor" aria-hidden="true" /> : <Play size={big ? 20 : 17} fill="currentColor" aria-hidden="true" className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <Music2 size={13} aria-hidden="true" className="shrink-0 text-app-muted" />
          <span className={`min-w-0 truncate font-medium text-app-text ${big ? 'text-[14px]' : 'text-[13px]'}`} title={title}>{title}</span>
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label={t.seek}
          aria-valuemin={0}
          aria-valuemax={Math.round(dur)}
          aria-valuenow={Math.round(cur)}
          aria-valuetext={`${fmt(cur)} / ${fmt(dur)}`}
          onKeyDown={onKey}
          onPointerDown={(e) => { dragging.current = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ } seekToX(e.clientX, e.currentTarget); }}
          onPointerMove={(e) => { if (dragging.current) seekToX(e.clientX, e.currentTarget); }}
          onPointerUp={(e) => { dragging.current = false; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* unsupported */ } }}
          onPointerCancel={() => { dragging.current = false; }}
          className={`mt-1.5 flex cursor-pointer touch-pan-y items-center gap-[2px] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/50 ${big ? 'h-8' : 'h-6'}`}
        >
          {Array.from({ length: count }, (_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={`min-w-[2px] flex-1 rounded-full transition-[height,background-color] duration-300 ${(i + 0.5) / count <= played ? 'bg-app-accent' : 'bg-app-muted/35'}`}
              style={{ height: peaks ? `${Math.round(peaks[i]! * 100)}%` : '3px' }}
            />
          ))}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] tabular-nums text-app-muted">
          <span>{fmt(cur)} / {fmt(dur)}</span>
          {info ? <span className="min-w-0 truncate" title={info}>{info}</span> : null}
        </div>
      </div>
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => { if (isFinite(e.currentTarget.duration)) setDur(e.currentTarget.duration); }}
        onDurationChange={(e) => { if (isFinite(e.currentTarget.duration)) setDur(e.currentTarget.duration); }}
        className="hidden"
      />
    </div>
  );
});

export default ChatAudioPlayer;
