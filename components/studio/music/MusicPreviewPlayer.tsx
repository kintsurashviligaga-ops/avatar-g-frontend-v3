'use client';

/**
 * The shared preview for music results in Music Create, Agent G and service chat.
 * It plays the provided signed audio URL directly; it never generates audio.
 * There is deliberately NO volume/mute UI and NO Web Audio/crossOrigin wiring:
 * iPhone users control output volume through the device's hardware controls.
 */
import { useEffect, useRef, useState } from 'react';
import { Music2, Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';

interface MusicPreviewPlayerProps {
  src: string;
  locale?: string;
  title?: string;
  durationSec?: number;
  coverUrl?: string;
  compact?: boolean;
}

const BARS = Array.from({ length: 35 }, (_, i) =>
  Math.round(18 + Math.abs(Math.sin(i * 0.47 + 0.2) * Math.cos(i * 0.17 - 0.8)) * 75),
);

const copy = {
  ka: { label: 'მუსიკის პრევიუ', play: 'დაკვრა', pause: 'პაუზა', back: '10 წამით უკან', forward: '10 წამით წინ', seek: 'გადახვევა', repeat: 'გამეორება', failed: 'აუდიოს დაკვრა ვერ მოხერხდა.' },
  en: { label: 'Music preview', play: 'Play', pause: 'Pause', back: 'Back 10 seconds', forward: 'Forward 10 seconds', seek: 'Seek', repeat: 'Repeat', failed: 'Unable to play audio.' },
  ru: { label: 'Предпрослушивание', play: 'Воспроизвести', pause: 'Пауза', back: 'Назад на 10 секунд', forward: 'Вперёд на 10 секунд', seek: 'Перемотка', repeat: 'Повтор', failed: 'Не удалось воспроизвести аудио.' },
} as const;

function formatTime(value: number): string {
  const seconds = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

export function MusicPreviewPlayer({
  src, locale = 'ka', title, durationSec, coverUrl, compact = false,
}: MusicPreviewPlayerProps) {
  const t = copy[locale.startsWith('ka') ? 'ka' : locale.startsWith('ru') ? 'ru' : 'en'];
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(durationSec ?? 0);
  const [repeat, setRepeat] = useState(false);
  const [error, setError] = useState(false);

  // The real signed media URL is passed unmodified. Avoid forcing CORS mode
  // for audio: private assets can play in Safari without cross-origin access.
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      try { audio.currentTime = 0; } catch { /* metadata not loaded */ }
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
    try {
      setError(false);
      await audio.play();
    } catch {
      setPlaying(false);
      setError(true);
    }
  };

  const seek = (nextTime: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(nextTime)) return;
    const max = Number.isFinite(audio.duration) ? audio.duration : duration;
    const time = Math.max(0, Math.min(Math.max(0, max), nextTime));
    try {
      audio.currentTime = time;
      setPosition(time);
    } catch { /* ignore early seeks while loading */ }
  };

  const total = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const played = total ? Math.max(0, Math.min(100, position / total * 100)) : 0;
  const displayTitle = title && !/^(music|მუსიკა|музыка)$/i.test(title.trim()) ? title.trim() : null;

  return (
    <section
      data-testid="music-preview-card"
      aria-label={t.label}
      className="relative w-full min-w-0 overflow-hidden rounded-[22px] border border-white/[0.10] bg-[#0a1019] p-3.5 text-slate-100 shadow-[0_10px_30px_rgba(0,0,0,0.20)] sm:p-4"
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        data-testid="music-player"
        aria-label={t.label}
        loop={repeat}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
        }}
        onError={() => { setPlaying(false); setError(true); }}
      />
      <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-cyan-300/[0.045] blur-3xl" />
      <div className="relative flex min-w-0 items-center gap-3.5">
        <div className={'relative aspect-square shrink-0 overflow-hidden rounded-[17px] border border-white/[0.10] bg-[#0e1b28] ' + (compact ? 'w-[78px]' : 'w-[92px] sm:w-[108px]')}>
          {coverUrl ? (
            // Private signed covers cannot reliably use Next image optimization.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} className="h-full w-full object-cover" alt="" />
          ) : (
            <div aria-hidden className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#285065_0%,#12283a_46%,#080e17_100%)]">
              <div className={'grid h-[70%] w-[70%] place-items-center rounded-full border border-white/[0.13] bg-[repeating-radial-gradient(circle_at_center,rgba(108,176,196,0.13)_0px,rgba(108,176,196,0.13)_1px,transparent_2px,transparent_7px)] shadow-[0_5px_17px_rgba(0,0,0,0.28)] ' + (playing ? 'music-disc-spin' : '')}>
                <span className="grid h-7 w-7 place-items-center rounded-full border border-cyan-200/20 bg-[#142c3b]">
                  <Music2 aria-hidden className="h-3.5 w-3.5 text-cyan-200" />
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2">
          {displayTitle && <p title={displayTitle} className="w-full truncate text-center text-[12px] font-medium text-slate-200/90">{displayTitle}</p>}
          <div className="flex w-full items-center justify-center gap-2">
            <button type="button" onClick={() => seek(position - 10)} aria-label={t.back} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
              <SkipBack className="h-[18px] w-[18px]" aria-hidden />
            </button>
            <button type="button" data-testid="music-play-toggle" onClick={() => void toggle()} aria-label={playing ? t.pause : t.play} aria-pressed={playing} className="grid h-[56px] w-[56px] shrink-0 place-items-center rounded-full bg-[#67dce9] text-[#06222a] shadow-[0_3px_16px_rgba(82,217,232,0.23)] transition-[transform,background-color] hover:bg-[#8be8f1] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300">
              {playing ? <Pause className="h-6 w-6 fill-current" aria-hidden /> : <Play className="ml-0.5 h-6 w-6 fill-current" aria-hidden />}
            </button>
            <button type="button" onClick={() => seek(position + 10)} aria-label={t.forward} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
              <SkipForward className="h-[18px] w-[18px]" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <div aria-hidden="true" className="mt-4 flex h-7 items-center justify-center gap-[3px] overflow-hidden">
        {BARS.map((bar, index) => (
          <span
            key={index}
            className="music-preview-bar min-w-0 flex-1 rounded-full bg-gradient-to-t from-[#14677b] to-[#68d5e3]"
            style={{
              height: bar + '%',
              opacity: index / BARS.length <= played / 100 ? 0.92 : 0.37,
              animationPlayState: playing ? 'running' : 'paused',
              animationDelay: '-' + (index % 11) * 0.11 + 's',
            }}
          />
        ))}
      </div>

      <div className="mt-2.5 flex min-h-11 items-center gap-2.5">
        <span className="w-9 shrink-0 text-center text-[11px] tabular-nums text-slate-400">{formatTime(position)}</span>
        <input
          type="range" data-testid="music-seek-slider" aria-label={t.seek}
          min={0} max={Math.max(1, total)} step={0.1}
          value={Math.min(position, Math.max(1, total))}
          onChange={(e) => seek(Number(e.target.value))}
          className="music-seek h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          style={{ background: 'linear-gradient(to right, #67dce9 ' + played + '%, #2a3543 ' + played + '%)' }}
        />
        <span className="w-9 shrink-0 text-center text-[11px] tabular-nums text-slate-400">{formatTime(total)}</span>
        <button type="button" data-testid="music-repeat-toggle" aria-label={t.repeat} aria-pressed={repeat} onClick={() => setRepeat((was) => !was)} className={'grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ' + (repeat ? 'bg-cyan-400/[0.12] text-[#67dce9]' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300')}>
          <RotateCcw className="h-[17px] w-[17px]" aria-hidden />
        </button>
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-amber-200">{t.failed}</p>}
      <style jsx>{'
        @keyframes preview-wave { 0%, 100% { transform:scaleY(.6) } 50% { transform:scaleY(1) } }
        @keyframes preview-spin { to { transform:rotate(360deg) } }
        .music-preview-bar { transform-origin: center; animation: preview-wave 1.4s ease-in-out infinite; }
        .music-disc-spin { animation: preview-spin 11s linear infinite; }
        .music-seek::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:13px; height:13px; border-radius:50%; background:#e0faff; box-shadow:0 0 0 3px rgba(103,220,233,.13); }
        .music-seek::-moz-range-thumb { width:13px; height:13px; border:0; border-radius:50%; background:#e0faff; }
        @media (prefers-reduced-motion: reduce) { .music-preview-bar, .music-disc-spin { animation:none!important; } }
      '}</style>
    </section>
  );
}
