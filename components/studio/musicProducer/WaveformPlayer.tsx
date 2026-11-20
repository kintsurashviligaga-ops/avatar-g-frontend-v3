'use client';

/**
 * Waveform player for a Music Producer track: play/pause, a bar waveform you can click or drag-key to seek, the played
 * part tinted, time / length. Peaks come from the track itself (Web Audio decode → computePeaks) or from a `peaks` prop
 * (tests, Library). The <audio> element is the single source of truth for time; `onTime` feeds the lyric pane.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { computePeaks, seekAt } from '@/lib/music/producer/peaks';
import { mmss } from '@/lib/music/producer/timeline';

export const WAVE_BARS = 96;

export interface PlayerHandle { seek(sec: number): void; play(): void; pause(): void }

/** Decode the track in the browser and boil it down to bar heights. Empty on any miss (the bars then draw flat). */
export function useTrackPeaks(url: string, given: number[] | undefined, bars = WAVE_BARS): number[] {
  const [peaks, setPeaks] = useState<number[]>(given ?? []);
  useEffect(() => {
    if (given || !url) return;
    const Ctx = (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Ctx || typeof fetch !== 'function') return;
    let gone = false;
    (async () => {
      try {
        const buf = await (await fetch(url)).arrayBuffer();
        const ctx = new Ctx();
        const audio = await ctx.decodeAudioData(buf);
        const ch = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
        if (!gone) setPeaks(computePeaks(ch, bars));
        void ctx.close();
      } catch { /* flat bars */ }
    })();
    return () => { gone = true; };
  }, [url, given, bars]);
  return peaks;
}

export const WaveformPlayer = forwardRef<PlayerHandle, {
  url: string;
  durationSec: number;
  peaks?: number[];
  onTime?: (sec: number) => void;
  label: string;
}>(function WaveformPlayer({ url, durationSec, peaks: given, onTime, label }, ref) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(durationSec);
  const peaks = useTrackPeaks(url, given);
  const bars = peaks.length ? peaks : Array.from({ length: WAVE_BARS }, () => 0.08);

  const seek = useCallback((sec: number) => {
    const a = audio.current;
    const s = Math.max(0, Math.min(sec, dur || durationSec));
    if (a) a.currentTime = s;
    setT(s);
    onTime?.(s);
  }, [dur, durationSec, onTime]);

  useImperativeHandle(ref, () => ({
    seek,
    play: () => { void audio.current?.play()?.catch?.(() => undefined); },
    pause: () => audio.current?.pause(),
  }), [seek]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play()?.catch?.(() => undefined); else a.pause();
  };

  const progress = dur > 0 ? t / dur : 0;
  return (
    <div data-testid="mp-player" className="flex items-center gap-3">
      <audio ref={audio} src={url} preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setDur(d); }}
        onTimeUpdate={(e) => { const s = e.currentTarget.currentTime; setT(s); onTime?.(s); }} />
      <button type="button" data-testid="mp-play" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-accent text-white shadow-lg shadow-app-accent/25 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
        {playing
          ? <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor" /><rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor" /></svg>
          : <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14"><path d="M3 1.5v11l9.5-5.5z" fill="currentColor" /></svg>}
      </button>
      <div
        role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)}
        aria-valuetext={`${mmss(t)} / ${mmss(dur)}`} data-testid="mp-wave"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          seek(seekAt(r.width > 0 ? (e.clientX - r.left) / r.width : 0, dur));
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); seek(t + 5); }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(t - 5); }
          else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
        }}
        className="flex h-12 flex-1 cursor-pointer items-center gap-[2px] rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60">
        {bars.map((p, i) => (
          <span key={i} aria-hidden="true" data-played={i / bars.length < progress ? '1' : '0'}
            className={`flex-1 rounded-full transition-colors ${i / bars.length < progress ? 'bg-app-accent' : 'bg-app-border/35'}`}
            style={{ height: `${Math.max(8, Math.round(p * 100))}%` }} />
        ))}
      </div>
      <span data-testid="mp-time" className="w-[86px] shrink-0 text-right text-[12px] tabular-nums text-app-muted">{mmss(t)} / {mmss(dur)}</span>
    </div>
  );
});
