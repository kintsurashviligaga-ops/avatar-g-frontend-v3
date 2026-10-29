'use client';

/** Chat-native inline music. Keeps signed audio playback, no volume/Web Audio. */
import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { MusicParticleVisualizer } from './MusicParticleVisualizer';

interface MusicPreviewPlayerProps {
  src: string;
  locale?: string;
  title?: string;
  durationSec?: number;
  coverUrl?: string;
  compact?: boolean;
}

const copy = {
  ka: { label: 'მუსიკის პრევიუ', play: 'დაკვრა', pause: 'პაუზა', seek: 'გადახვევა', failed: 'აუდიოს დაკვრა ვერ მოხერხდა.' },
  en: { label: 'Music preview', play: 'Play', pause: 'Pause', seek: 'Seek', failed: 'Unable to play audio.' },
  ru: { label: 'Предпрослушивание', play: 'Воспроизвести', pause: 'Пауза', seek: 'Перемотка', failed: 'Не удалось воспроизвести аудио.' },
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
  }, [src, durationSec]);

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
    try { audio.currentTime = value; setPosition(value); }
    catch { /* metadata unavailable */ }
  };

  const total = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const progress = total ? Math.max(0, Math.min(100, position / total * 100)) : 0;
  const accessibleTitle = title && !/^(music|მუსიკა|музыка)$/i.test(title.trim()) ? title.trim() : null;

  return (
    <section data-testid="music-preview-card" aria-label={t.label} className="relative mx-auto w-full min-w-0 max-w-[520px] bg-transparent text-slate-100">
      {accessibleTitle && <span className="sr-only">{accessibleTitle}</span>}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        data-testid="music-player"
        aria-label={t.label}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration);
        }}
        onError={() => { setPlaying(false); setError(true); }}
      />
      <div className="relative mx-auto w-full">
        <MusicParticleVisualizer playing={playing} compact={compact} />
        <button
          type="button"
          data-testid="music-play-toggle"
          aria-label={playing ? t.pause : t.play}
          aria-pressed={playing}
          onClick={() => void toggle()}
          className="absolute left-1/2 top-1/2 z-10 grid h-[68px] w-[68px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-cyan-300/30 bg-[#18202b]/90 text-white shadow-[0_0_0_5px_rgba(10,147,229,0.12),0_0_27px_rgba(23,155,255,0.27)] backdrop-blur-md transition-all duration-200 hover:border-cyan-200/60 hover:bg-[#243240] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 sm:h-[76px] sm:w-[76px]"
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
          style={{ background: 'linear-gradient(to right, #28dce9 ' + progress + '%, #434750 ' + progress + '%)' }}
        />
      </div>
      {error && <p role="alert" className="mt-3 text-center text-xs text-amber-200">{t.failed}</p>}
      <style jsx>{'.music-preview-seek::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:16px; height:16px; border-radius:50%; border:2px solid #fff; background:#fff; box-shadow:0 1px 5px rgba(0,0,0,.2); } .music-preview-seek::-moz-range-thumb { width:14px; height:14px; border:2px solid #fff; border-radius:50%; background:#fff; }'}</style>
    </section>
  );
}
