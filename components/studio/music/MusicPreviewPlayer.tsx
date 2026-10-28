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

// An art-directed, layered animation. These are procedural motion graphics,
// not fabricated claims of audio-frequency analysis of private signed media.
const WAVEFORM = Array.from({ length: 43 }, (_, index) => {
  const x = index / 42;
  const envelope = 0.24 + 0.69 * Math.pow(Math.sin(Math.PI * x), 1.3);
  const ripple = 0.4 + 0.6 * Math.abs(Math.sin(index * 0.76 + 0.45) * Math.cos(index * 0.23));
  return {
    height: Math.round(14 + 80 * envelope * ripple),
    duration: (1.05 + (index % 7) * 0.14).toFixed(2) + 's',
    delay: (-((index * 0.13) % 2.6)).toFixed(2) + 's',
    emphasis: index % 11 === 0,
  };
});

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

      {/* Cinematic dual-layer pulse: luminous organic bars + restrained reflection.
          It uses transform/opacity for smooth playback animation without Web Audio
          or heavy per-frame JavaScript, preserving signed music playback on iOS. */}
      <div
        data-testid="music-equalizer"
        data-playing={playing ? 'true' : 'false'}
        aria-hidden="true"
        className="relative mt-3.5 h-[72px] w-full overflow-hidden rounded-[13px] border border-white/[0.045] bg-[linear-gradient(180deg,rgba(15,39,52,0.34),rgba(7,18,28,0.12)_54%,rgba(7,18,28,0.4))]"
      >
        <div className="absolute inset-x-3 top-[38px] h-px bg-gradient-to-r from-transparent via-cyan-300/20 to-transparent" />
        <div
          className="music-eq-halo pointer-events-none absolute inset-x-[12%] top-[12px] h-11 rounded-full bg-[radial-gradient(ellipse,rgba(28,181,209,0.16),transparent_68%)] blur-lg"
          style={{ animationPlayState: playing ? 'running' : 'paused' }}
        />
        <div className="absolute inset-x-2 top-[7px] flex h-[31px] items-end justify-center gap-[2.5px] sm:gap-[3px]">
          {WAVEFORM.map((bar, index) => (
            <span
              key={index}
              className="music-eq-bar relative min-w-0 flex-1 rounded-[3px] bg-gradient-to-t from-[#116074] via-[#32bfd0] to-[#9af0f5]"
              style={{
                height: bar.height + '%',
                opacity: index / WAVEFORM.length <= played / 100 ? 1 : 0.62,
                animationDelay: bar.delay,
                animationDuration: bar.duration,
                animationPlayState: playing ? 'running' : 'paused',
                boxShadow: playing && bar.emphasis ? '0 0 11px rgba(72,224,240,0.32)' : undefined,
              }}
            />
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-2 top-[39px] flex h-[22px] items-start justify-center gap-[2.5px] opacity-20 [mask-image:linear-gradient(to_bottom,black,transparent)] sm:gap-[3px]">
          {WAVEFORM.map((bar, index) => (
            <span
              key={index}
              className="music-eq-bar min-w-0 flex-1 rounded-[2px] bg-gradient-to-b from-[#5ad9e9] to-[#16546a]"
              style={{
                height: Math.max(15, bar.height * 0.82) + '%',
                animationDelay: bar.delay,
                animationDuration: bar.duration,
                animationPlayState: playing ? 'running' : 'paused',
              }}
            />
          ))}
        </div>
        <div
          className="music-eq-glint pointer-events-none absolute inset-y-0 left-[-30%] w-[38%] bg-gradient-to-r from-transparent via-cyan-200/[0.05] to-transparent"
          style={{ animationPlayState: playing ? 'running' : 'paused' }}
        />
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
      <style jsx>{`
        @keyframes eq-dance {
          0%,100% { transform:scaleY(.55); filter:brightness(.84); }
          22% { transform:scaleY(1); filter:brightness(1.1); }
          48% { transform:scaleY(.68); filter:brightness(.95); }
          73% { transform:scaleY(.92); filter:brightness(1.08); }
        }
        @keyframes eq-halo { 0%,100% { transform:scaleX(.82); opacity:.45; } 50% { transform:scaleX(1.08); opacity:1; } }
        @keyframes eq-glint { 0% { transform:translateX(0); opacity:0; } 30% { opacity:.65; } 72% { opacity:.5; } 100% { transform:translateX(360%); opacity:0; } }
        @keyframes preview-spin { to { transform:rotate(360deg) } }
        .music-eq-bar { transform-origin:bottom center; animation:eq-dance ease-in-out infinite; will-change:transform; }
        .music-eq-halo { animation:eq-halo 3.6s ease-in-out infinite; }
        .music-eq-glint { animation:eq-glint 5.8s ease-in-out infinite; }
        .music-disc-spin { animation:preview-spin 11s linear infinite; }
        .music-seek::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:13px; height:13px; border-radius:50%; background:#e0faff; box-shadow:0 0 0 3px rgba(103,220,233,.13); }
        .music-seek::-moz-range-thumb { width:13px; height:13px; border:0; border-radius:50%; background:#e0faff; }
        @media (prefers-reduced-motion: reduce) { .music-eq-bar, .music-eq-halo, .music-eq-glint, .music-disc-spin { animation:none!important; will-change:auto!important; } }
      `}</style>
    </section>
  );
}
