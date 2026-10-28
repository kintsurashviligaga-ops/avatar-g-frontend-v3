'use client';

/**
 * Compact, Grok-reference-inspired player for a REAL MyAvatar audio result.
 * The sample synthesizer in the reference is deliberately not embedded: audio
 * comes only from the existing Music Studio / service-preview result URL.
 * Bars are a playback-state animation, not a claimed frequency analysis.
 */
import { useEffect, useRef, useState } from 'react';
import { Music2, Pause, Play, RotateCcw, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';

interface MusicPreviewPlayerProps {
  src: string;
  locale?: string;
  title?: string;
  durationSec?: number;
  coverUrl?: string;
  compact?: boolean;
}

const bars = Array.from({ length: 41 }, (_, i) => {
  const wave = Math.abs(Math.sin(i * 0.66) * Math.cos(i * 0.21));
  return Math.round(17 + wave * 77);
});

function clock(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : 0;
  return String(Math.floor(safe / 60)) + ':' + String(safe % 60).padStart(2, '0');
}

export function MusicPreviewPlayer({
  src, locale = 'ka', title, durationSec, coverUrl, compact = false,
}: MusicPreviewPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(durationSec ?? 0);
  const [loop, setLoop] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [error, setError] = useState(false);
  const lang = locale.startsWith('ka') ? 'ka' : locale.startsWith('ru') ? 'ru' : 'en';
  const copy = lang === 'ka'
    ? { header: 'მუსიკის პრევიუ', fallback: 'შენი მუსიკა', play: 'დაკვრა', pause: 'პაუზა', back: '10 წამით უკან', next: '10 წამით წინ', loop: 'მარყუჟი', volume: 'ხმა', error: 'აუდიოს დაკვრა ვერ მოხერხდა. სცადე ხელახლა.' }
    : lang === 'ru'
      ? { header: 'Предпрослушивание', fallback: 'Ваша музыка', play: 'Воспроизвести', pause: 'Пауза', back: 'Назад на 10 секунд', next: 'Вперёд на 10 секунд', loop: 'Повтор', volume: 'Громкость', error: 'Не удалось воспроизвести аудио. Попробуйте снова.' }
      : { header: 'Music preview', fallback: 'Your music', play: 'Play', pause: 'Pause', back: 'Back 10 seconds', next: 'Forward 10 seconds', loop: 'Loop', volume: 'Volume', error: 'Unable to play this audio. Please try again.' };

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.currentTime = 0; }
    setPlaying(false);
    setPosition(0);
    setDuration(durationSec ?? 0);
    setError(false);
  }, [src, durationSec]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

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
    audio.currentTime = Math.max(0, Math.min(Math.max(0, max), seconds));
    setPosition(audio.currentTime);
  };
  const actualDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  const progress = actualDuration > 0 ? Math.min(100, position / actualDuration * 100) : 0;

  return (
    <section data-testid="music-preview-card" className="w-full min-w-0 overflow-hidden rounded-[22px] border border-cyan-400/30 bg-[#080c14] p-3.5 text-[#f4f7fb] shadow-[0_12px_38px_rgba(0,0,0,0.25)] sm:p-4" aria-label={copy.header}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        data-testid="music-player"
        aria-label={copy.header}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration);
        }}
        onError={() => { setPlaying(false); setError(true); }}
        loop={loop}
      />
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-cyan-200"><Music2 className="h-3.5 w-3.5" aria-hidden />{copy.header}</span>
        <span className="text-[10px] font-medium text-slate-500">MyAvatar</span>
      </div>
      <div className="relative mx-auto h-[128px] w-[128px] overflow-hidden rounded-[25px] border border-cyan-300/70 bg-[#071625] shadow-[0_0_24px_rgba(62,231,255,0.22)] sm:h-[154px] sm:w-[154px]" style={{ boxShadow: playing ? '0 0 30px rgba(62,231,255,0.36)' : undefined }}>
        {coverUrl ? (
          // Signed user-owned media URLs may not be compatible with Next Image optimizations.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <svg viewBox="0 0 200 200" className="h-full w-full" aria-hidden="true" role="img">
            <defs>
              <linearGradient id="music-preview-sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#020711" /><stop offset="55%" stopColor="#0b2941" /><stop offset="100%" stopColor="#034c65" /></linearGradient>
              <radialGradient id="music-preview-light"><stop offset="0%" stopColor="#62f3ff" stopOpacity=".75" /><stop offset="100%" stopColor="#62f3ff" stopOpacity="0" /></radialGradient>
            </defs>
            <rect width="200" height="200" fill="url(#music-preview-sky)" />
            <ellipse cx="138" cy="92" rx="65" ry="82" fill="url(#music-preview-light)" />
            <path d="M0 37 39 22 57 34 57 155 92 171 92 200 0 200Z" fill="#010711" /><path d="M200 31 165 21 150 39 150 152 118 174 118 200 200 200Z" fill="#010b15" />
            <path d="M0 200 93 125 107 125 200 200Z" fill="#0c2634" /><path d="M101 140 76 200M101 140 132 200" stroke="#45d5ec" strokeWidth="1.5" strokeOpacity=".52" />
            <path d="M19 62v79M34 54v83M176 62v76M188 57v74" stroke="#135069" strokeWidth="2" strokeOpacity=".55" />
            {Array.from({ length: 20 }, (_, i) => <path key={i} d={'M' + (i * 19 % 190) + ' ' + (i * 31 % 150) + 'l-5 12'} stroke="#6de8f7" strokeOpacity=".25" strokeWidth=".8" />)}
          </svg>
        )}
      </div>
      <div className="mt-3 text-center">
        <p className="mx-auto max-w-[95%] truncate text-[15px] font-semibold" title={title || copy.fallback}>{title || copy.fallback}</p>
        <span className="text-[11px] text-slate-400">MyAvatar Music Studio</span>
      </div>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button type="button" onClick={() => seek(position - 10)} aria-label={copy.back} className="grid h-11 w-11 place-items-center rounded-full border border-slate-600/80 text-slate-100 transition-colors hover:border-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"><SkipBack className="h-4 w-4" aria-hidden /></button>
        <button type="button" data-testid="music-play-toggle" onClick={() => void toggle()} aria-label={playing ? copy.pause : copy.play} aria-pressed={playing} className="grid h-14 w-14 place-items-center rounded-full bg-[#3ee7ff] text-[#04141a] shadow-[0_0_22px_rgba(62,231,255,0.4)] transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300">
          {playing ? <Pause className="h-6 w-6 fill-current" aria-hidden /> : <Play className="h-6 w-6 fill-current" aria-hidden />}
        </button>
        <button type="button" onClick={() => seek(position + 10)} aria-label={copy.next} className="grid h-11 w-11 place-items-center rounded-full border border-slate-600/80 text-slate-100 transition-colors hover:border-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"><SkipForward className="h-4 w-4" aria-hidden /></button>
      </div>
      <div className="mt-3" aria-hidden="true">
        <div className="flex h-10 items-end justify-center gap-[2px] overflow-hidden">
          {bars.map((height, index) => <span key={index} className="music-preview-bar min-w-0 flex-1 rounded-full bg-gradient-to-t from-cyan-800 to-[#3ee7ff]" style={{ height: height + '%', animationPlayState: playing ? 'running' : 'paused', animationDelay: '-' + (index % 13) * 0.09 + 's' }} />)}
        </div>
        {!compact && <div className="mt-0.5 flex h-4 scale-y-[-1] items-end justify-center gap-[2px] overflow-hidden opacity-25 [mask-image:linear-gradient(to_top,transparent,black)]">
          {bars.map((height, index) => <span key={index} className="music-preview-bar min-w-0 flex-1 rounded-full bg-[#3ee7ff]" style={{ height: height + '%', animationPlayState: playing ? 'running' : 'paused', animationDelay: '-' + (index % 13) * 0.09 + 's' }} />)}
        </div>}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] tabular-nums text-slate-400"><span>{clock(position)}</span><span>{clock(actualDuration)}</span></div>
      <input type="range" aria-label={copy.header} min={0} max={Math.max(1, actualDuration)} step={0.1} value={Math.min(position, Math.max(1, actualDuration))} onChange={(e) => seek(Number(e.target.value))} className="mt-1 h-2 w-full cursor-pointer accent-[#3ee7ff]" style={{ background: 'linear-gradient(to right, #3ee7ff ' + progress + '%, #2c3448 ' + progress + '%)' }} />
      <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-300">
        <button type="button" aria-label={copy.loop} aria-pressed={loop} onClick={() => setLoop((old) => !old)} className={'flex min-h-[40px] items-center gap-1 rounded-full px-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ' + (loop ? 'bg-cyan-400/15 text-cyan-200' : 'text-slate-400')}><RotateCcw className="h-3.5 w-3.5" aria-hidden />{copy.loop}</button>
        <label className="flex min-h-[40px] items-center gap-2">
          {volume === 0 ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
          <span className="sr-only">{copy.volume}</span>
          <input aria-label={copy.volume} type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="h-2 w-20 accent-[#3ee7ff]" />
        </label>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-amber-200">{copy.error}</p>}
      <style jsx>{'@keyframes myavatar-music-wave { 0%, 100% { transform:scaleY(.35) } 50% { transform:scaleY(1) } } .music-preview-bar { transform-origin:bottom center; animation:myavatar-music-wave 1.1s ease-in-out infinite; } @media (prefers-reduced-motion:reduce) { .music-preview-bar { animation:none!important; } }'}</style>
    </section>
  );
}
