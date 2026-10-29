'use client';

/** Chat-native inline music. Keeps signed audio playback, no volume/Web Audio. */
import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { MusicParticleVisualizer } from './MusicParticleVisualizer';
import { loadBeatTrack, type BeatTrack } from './beatAnalysis';

interface MusicPreviewPlayerProps {
  src: string;
  locale?: string;
  title?: string;
  durationSec?: number;
  coverUrl?: string;
  compact?: boolean;
}

const copy = {
  ka: { label: 'მუსიკის პრევიუ', play: 'დაკვრა', pause: 'პაუზა', seek: 'გადახვევა', failed: 'აუდიოს დაკვრა ვერ მოხერხდა.', noSync: 'ბიტის სინქრონიზაცია ამ ფაილზე მიუწვდომელია' },
  en: { label: 'Music preview', play: 'Play', pause: 'Pause', seek: 'Seek', failed: 'Unable to play audio.', noSync: 'Beat sync unavailable for this file' },
  ru: { label: 'Предпрослушивание', play: 'Воспроизвести', pause: 'Пауза', seek: 'Перемотка', failed: 'Не удалось воспроизвести аудио.', noSync: 'Синхронизация с ритмом недоступна' },
} as const;

function formatTime(value: number): string {
  const s = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

export function MusicPreviewPlayer({
  src, locale = 'ka', title, durationSec, compact = false,
}: MusicPreviewPlayerProps) {
  const t = copy[locale.startsWith('ka') ? 'ka' : locale.startsWith('ru') ? 'ru' : 'en'];
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(durationSec ?? 0);
  const [error, setError] = useState(false);
  const [analysisTarget, setAnalysisTarget] = useState<string | null>(null);
  const [analysisState, setAnalysisState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const [beatTrack, setBeatTrack] = useState<BeatTrack | null>(null);
  const [seekVersion, setSeekVersion] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      try { audio.currentTime = 0; } catch { /* no metadata */ }
    }
    setPlaying(false);
    setPosition(0);
    setDuration(durationSec ?? 0);
    setError(false);
    setAnalysisTarget(null);
    setBeatTrack(null);
    setAnalysisState('idle');
    setSeekVersion(0);
  }, [src, durationSec]);

  // Analyze once per delivered track after the first user-initiated playback.
  // The signed audio URL is fetched separately only for decode; the <audio>
  // remains on its original native playback path (no CORS-induced silence).
  useEffect(() => {
    if (!analysisTarget) return;
    const controller = new AbortController();
    setAnalysisState('loading');
    let live = true;
    void loadBeatTrack(analysisTarget, controller.signal)
      .then((track) => {
        if (!live || controller.signal.aborted) return;
        if (!track.frames.length) throw new Error('no_audio_samples');
        setBeatTrack(track);
        setAnalysisState('ready');
      })
      .catch(() => {
        if (!live || controller.signal.aborted) return;
        setBeatTrack(null);
        // Important: do not pretend a synthetic animation is aligned to audio.
        setAnalysisState('unavailable');
      });
    return () => { live = false; controller.abort(); };
  }, [analysisTarget]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) { audio.pause(); return; }
    try { setError(false); await audio.play(); }
    catch { setPlaying(false); setError(true); }
  };

  const seek = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    const max = Number.isFinite(audio.duration) ? audio.duration : duration;
    const value = Math.max(0, Math.min(Math.max(0, max), seconds));
    try { audio.currentTime = value; setPosition(value); setSeekVersion((x) => x + 1); }
    catch { /* metadata unavailable */ }
  };

  const total = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const progress = total ? Math.max(0, Math.min(100, position / total * 100)) : 0;
  const accessibleTitle = title && !/^(music|მუსიკა|музыка)$/i.test(title.trim()) ? title.trim() : null;

  return (
    <section data-testid="music-preview-card" aria-label={t.label} className="relative mx-auto w-full min-w-0 max-w-[520px] overflow-hidden rounded-[24px] border border-[#1b3050]/60 bg-[radial-gradient(ellipse_at_50%_32%,#0d1b32_0%,#090e19_66%,#070b13_100%)] px-3 pb-5 pt-2 text-slate-100 shadow-[0_12px_36px_rgba(0,0,0,0.22)] sm:px-5">
      {accessibleTitle && <span className="sr-only">{accessibleTitle}</span>}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        data-testid="music-player"
        aria-label={t.label}
        onPlay={() => {
          setPlaying(true);
          if (!analysisTarget || analysisTarget !== src) setAnalysisTarget(src);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onSeeked={() => setSeekVersion((x) => x + 1)}
        onLoadedMetadata={(event) => {
          if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration);
        }}
        onError={() => { setPlaying(false); setError(true); }}
      />
      <div className="relative mx-auto w-full">
        <MusicParticleVisualizer
          playing={playing}
          compact={compact}
          audioRef={audioRef}
          beatTrack={beatTrack}
          seekVersion={seekVersion}
        />
        <button
          type="button"
          data-testid="music-play-toggle"
          aria-label={playing ? t.pause : t.play}
          aria-pressed={playing}
          onClick={() => void toggle()}
          className="absolute left-1/2 top-1/2 z-10 grid h-[68px] w-[68px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[#3c8ee9]/55 bg-[#101827]/95 text-white shadow-[0_0_0_4px_rgba(24,93,205,0.09),0_0_18px_rgba(18,98,240,0.18)] backdrop-blur-md transition-all duration-200 hover:border-cyan-200/60 hover:bg-[#243240] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 sm:h-[76px] sm:w-[76px]"
        >
          {playing ? <Pause className="h-7 w-7 fill-current" aria-hidden /> : <Play className="ml-1 h-7 w-7 fill-current" aria-hidden />}
        </button>
      </div>
      <div className="mt-[-3px] px-2 sm:px-4">
        <div className="mb-2 flex items-center justify-between">
          <span data-testid="music-time-pill" className="rounded-full bg-white/[0.085] px-3 py-1.5 text-[12px] font-medium tabular-nums tracking-wide text-slate-200">
            {formatTime(position)} / {formatTime(total)}
          </span>
        </div>
        <input
          data-testid="music-seek-slider"
          type="range"
          aria-label={t.seek}
          min="0"
          max={Math.max(1, total)}
          step="0.1"
          value={Math.min(position, Math.max(1, total))}
          onChange={(event) => seek(Number(event.target.value))}
          className="music-preview-seek block h-[5px] w-full cursor-pointer appearance-none rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300"
          style={{ background: 'linear-gradient(to right, #228bff ' + progress + '%, #343b49 ' + progress + '%)' }}
        />
      </div>
      {error && <p role="alert" className="mt-3 text-center text-xs text-amber-200">{t.failed}</p>}
      {!error && analysisState === 'unavailable' && (
        <p data-testid="beat-sync-unavailable" role="status" className="mt-3 text-center text-[11px] text-slate-400">
          {t.noSync}
        </p>
      )}
      <span className="sr-only" data-testid="beat-sync-state">{analysisState}</span>
      <style jsx>{'.music-preview-seek::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:16px; height:16px; border-radius:50%; border:2px solid #fff; background:#fff; box-shadow:0 1px 5px rgba(0,0,0,.2); } .music-preview-seek::-moz-range-thumb { width:14px; height:14px; border:2px solid #fff; border-radius:50%; background:#fff; }'}</style>
    </section>
  );
}
