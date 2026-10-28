'use client';

/**
 * Unified media preview. Audio is always the real generated track, never a demo.
 *
 * iOS Safari ignores HTMLMediaElement.volume, so unsupported browsers use a
 * Web Audio GainNode (created only on the user's play/volume gesture). The
 * normal media-element path is retained on desktop/Android. If a browser does
 * not support Web Audio either, the UI honestly defers to device volume.
 *
 * Web Audio requires CORS-clean media. Only the gain-node path sets
 * crossOrigin=anonymous, leaving ordinary browser playback unchanged elsewhere.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Music2, Pause, Play, RotateCcw, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';

interface MusicPreviewPlayerProps {
  src: string;
  locale?: string;
  title?: string;
  durationSec?: number;
  coverUrl?: string;
  compact?: boolean;
}

type VolumeMode = 'native' | 'web-audio' | 'device';

const WAVE = Array.from({ length: 32 }, (_, i) => 20 + Math.round(
  Math.abs(Math.sin(i * 0.47) * Math.cos(i * 0.19 + 0.6)) * 77,
));

function clock(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return String(Math.floor(safe / 60)) + ':' + String(safe % 60).padStart(2, '0');
}

export function supportsMediaElementVolume(audio: Pick<HTMLMediaElement, 'volume'>): boolean {
  try {
    const old = audio.volume;
    audio.volume = 0.37;
    const supported = Math.abs(audio.volume - 0.37) < 0.02;
    audio.volume = old;
    return supported;
  } catch {
    return false;
  }
}

function getWebAudioConstructor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

const translations = {
  ka: {
    label: 'მუსიკის პრევიუ', play: 'დაკვრა', pause: 'პაუზა', back: '10 წამით უკან',
    forward: '10 წამით წინ', seek: 'გადახვევა', volume: 'ხმის დონე', mute: 'ხმის გამორთვა',
    unmute: 'ხმის ჩართვა', loop: 'გამეორება', failed: 'მუსიკის დაკვრა ვერ მოხერხდა.',
    device: 'ხმის შეცვლა შესაძლებელია ტელეფონის ღილაკებით.',
  },
  en: {
    label: 'Music preview', play: 'Play', pause: 'Pause', back: 'Back 10 seconds',
    forward: 'Forward 10 seconds', seek: 'Seek', volume: 'Volume', mute: 'Mute',
    unmute: 'Unmute', loop: 'Repeat', failed: 'Unable to play audio.',
    device: 'Use your device volume buttons.',
  },
  ru: {
    label: 'Предпрослушивание', play: 'Воспроизвести', pause: 'Пауза', back: 'Назад на 10 секунд',
    forward: 'Вперёд на 10 секунд', seek: 'Перемотка', volume: 'Громкость', mute: 'Выключить звук',
    unmute: 'Включить звук', loop: 'Повтор', failed: 'Не удалось воспроизвести аудио.',
    device: 'Используйте кнопки громкости телефона.',
  },
};

export function MusicPreviewPlayer({
  src, locale = 'ka', title, durationSec, coverUrl, compact = false,
}: MusicPreviewPlayerProps) {
  const copy = translations[locale.startsWith('ka') ? 'ka' : locale.startsWith('ru') ? 'ru' : 'en'];
  const audioRef = useRef<HTMLAudioElement>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const volumeRef = useRef(0.85);
  const previousVolumeRef = useRef(0.85);
  const [mode, setMode] = useState<VolumeMode>('native');
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(durationSec ?? 0);
  const [loop, setLoop] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [error, setError] = useState(false);

  // Feature detection: on iOS the setter exists, but reading it stays at 1.
  // Deferring src until detection also ensures correct crossOrigin BEFORE load.
  useEffect(() => {
    const probe = document.createElement('audio');
    setMode(supportsMediaElementVolume(probe) ? 'native' : getWebAudioConstructor() ? 'web-audio' : 'device');
    setReady(true);
    return () => {
      const ctx = contextRef.current;
      contextRef.current = null;
      gainRef.current = null;
      if (ctx) void ctx.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      try { audio.currentTime = 0; } catch { /* audio has no metadata yet */ }
    }
    setPlaying(false);
    setPosition(0);
    setDuration(durationSec ?? 0);
    setError(false);
  }, [src, durationSec]);

  const ensureGain = useCallback(() => {
    if (mode !== 'web-audio') return;
    const audio = audioRef.current;
    if (!audio) return;
    if (gainRef.current) return;
    const AudioContextClass = getWebAudioConstructor();
    if (!AudioContextClass) { setMode('device'); return; }

    let ctx: AudioContext | null = null;
    try {
      // This must run in a direct user interaction for iOS playback.
      ctx = new AudioContextClass();
      const source = ctx.createMediaElementSource(audio);
      const gain = ctx.createGain();
      source.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.value = volumeRef.current;
      contextRef.current = ctx;
      gainRef.current = gain;
    } catch {
      if (ctx) void ctx.close().catch(() => {});
      setMode('device');
    }
  }, [mode]);

  const setLevel = useCallback((requested: number) => {
    const next = Math.min(1, Math.max(0, Number.isFinite(requested) ? requested : 1));
    setVolume(next);
    volumeRef.current = next;
    if (next > 0) previousVolumeRef.current = next;
    const audio = audioRef.current;
    if (mode === 'native' && audio) {
      audio.volume = next;
    } else if (mode === 'web-audio') {
      ensureGain();
      if (gainRef.current) gainRef.current.gain.value = next;
    }
  }, [mode, ensureGain]);

  useEffect(() => {
    if (mode === 'native' && audioRef.current) audioRef.current.volume = volume;
    if (mode === 'web-audio' && gainRef.current) gainRef.current.gain.value = volume;
  }, [mode, volume, ready]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio || !ready) return;
    if (!audio.paused) { audio.pause(); return; }
    try {
      setError(false);
      if (mode === 'web-audio') {
        ensureGain();
        if (contextRef.current?.state === 'suspended') await contextRef.current.resume();
      }
      await audio.play();
    } catch {
      setPlaying(false);
      setError(true);
    }
  };

  const seek = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    const max = Number.isFinite(audio.duration) ? audio.duration : duration;
    const next = Math.max(0, Math.min(Math.max(0, max), seconds));
    try { audio.currentTime = next; setPosition(next); }
    catch { /* Ignore seeks before metadata is loaded. */ }
  };

  const actualDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const progress = actualDuration ? Math.min(100, position / actualDuration * 100) : 0;
  // Generic tool names are not track titles; omit instead of repeating "Music".
  const displayTitle = title && !/^(music|მუსიკა|музыка)$/i.test(title.trim()) ? title.trim() : null;
  const wasMuted = volume === 0;

  return (
    <section
      data-testid="music-preview-card"
      aria-label={copy.label}
      className="relative w-full min-w-0 overflow-hidden rounded-[24px] border border-white/[0.11] bg-[#0c111a] p-3.5 text-[#eaf5fc] shadow-[0_16px_40px_rgba(0,0,0,0.24)] sm:p-4"
    >
      <audio
        ref={audioRef}
        src={ready ? src : undefined}
        crossOrigin={mode === 'web-audio' ? 'anonymous' : undefined}
        data-testid="music-player"
        aria-label={copy.label}
        preload="metadata"
        loop={loop}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration);
        }}
        onError={() => { setPlaying(false); setError(true); }}
      />
      <div className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full bg-cyan-400/[0.055] blur-3xl" />

      <div className="relative flex min-w-0 items-center gap-4">
        <div className={'relative aspect-square shrink-0 overflow-hidden rounded-[20px] border border-cyan-200/15 bg-[#111d2c] shadow-[0_3px_24px_rgba(0,0,0,0.16)] ' + (compact ? 'w-[92px]' : 'w-[108px] sm:w-[120px]')}>
          {coverUrl ? (
            // Signed URLs should not be passed through Next image optimization.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_25%_20%,#284b64_0%,#111b2d_42%,#080e16_100%)]" aria-hidden="true">
              <div className={'relative flex h-[76%] w-[76%] items-center justify-center rounded-full border border-white/10 bg-[repeating-radial-gradient(circle_at_center,rgba(86,135,158,0.13)_0px,rgba(86,135,158,0.13)_1px,transparent_2px,transparent_8px)] shadow-[0_4px_17px_rgba(0,0,0,0.4)] ' + (playing ? 'music-disc-playing' : '')}>
                <div className="grid h-8 w-8 place-items-center rounded-full border border-cyan-200/20 bg-[#142d3c]">
                  <Music2 aria-hidden className="h-4 w-4 text-cyan-200" />
                </div>
              </div>
              <div className="pointer-events-none absolute left-0 top-0 h-1/2 w-full bg-gradient-to-br from-white/[0.09] to-transparent" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3">
          {displayTitle && <p className="w-full truncate text-center text-[13px] font-medium text-slate-200" title={displayTitle}>{displayTitle}</p>}
          <div className="flex w-full items-center justify-center gap-2.5">
            <button type="button" onClick={() => seek(position - 10)} aria-label={copy.back} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
              <SkipBack aria-hidden className="h-[19px] w-[19px]" />
            </button>
            <button type="button" data-testid="music-play-toggle" onClick={() => void toggle()} disabled={!ready} aria-label={playing ? copy.pause : copy.play} aria-pressed={playing} className="grid h-[58px] w-[58px] shrink-0 place-items-center rounded-full bg-[#52d9ed] text-[#081922] shadow-[0_3px_20px_rgba(51,199,224,0.22)] transition-[transform,background-color] hover:bg-[#76e6f4] active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:opacity-50">
              {playing ? <Pause aria-hidden className="h-6 w-6 fill-current" /> : <Play aria-hidden className="ml-0.5 h-6 w-6 fill-current" />}
            </button>
            <button type="button" onClick={() => seek(position + 10)} aria-label={copy.forward} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
              <SkipForward aria-hidden className="h-[19px] w-[19px]" />
            </button>
          </div>
        </div>
      </div>

      <div aria-hidden="true" className="mt-3.5 flex h-7 w-full items-center justify-center gap-[3px] overflow-hidden rounded-md">
        {WAVE.map((height, index) => (
          <span key={index} className="music-preview-bar min-w-0 flex-1 rounded-full bg-gradient-to-t from-[#176b80] via-[#34aabf] to-[#80e7f0]" style={{
            height: height + '%',
            transformOrigin: 'center',
            animationPlayState: playing ? 'running' : 'paused',
            animationDelay: '-' + (index % 13) * 0.09 + 's',
            opacity: index / WAVE.length <= progress / 100 ? 0.95 : 0.48,
          }} />
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span className="w-9 shrink-0 text-center text-[11px] tabular-nums text-slate-400">{clock(position)}</span>
        <input
          type="range" aria-label={copy.seek} min={0} max={Math.max(1, actualDuration)} step={0.1}
          value={Math.min(position, Math.max(1, actualDuration))}
          onChange={(e) => seek(Number(e.target.value))}
          className="min-w-0 flex-1 cursor-pointer accent-[#52d9ed]"
          style={{ background: 'linear-gradient(to right, #52d9ed ' + progress + '%, #354252 ' + progress + '%)' }}
        />
        <span className="w-9 shrink-0 text-center text-[11px] tabular-nums text-slate-400">{clock(actualDuration)}</span>
      </div>

      <div className="mt-2.5 flex min-h-11 items-center gap-2.5 border-t border-white/[0.06] pt-2.5">
        <button type="button" disabled={mode === 'device'} aria-label={wasMuted ? copy.unmute : copy.mute} onClick={() => setLevel(wasMuted ? previousVolumeRef.current : 0)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-400 transition-colors hover:bg-white/5 hover:text-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">
          {wasMuted ? <VolumeX aria-hidden className="h-[19px] w-[19px]" /> : <Volume2 aria-hidden className="h-[19px] w-[19px]" />}
        </button>
        {mode === 'device' ? (
          <span data-testid="music-device-volume" className="min-w-0 flex-1 text-[11px] text-slate-400">{copy.device}</span>
        ) : (
          <input
            data-testid="music-volume-slider"
            aria-label={copy.volume}
            type="range" min={0} max={1} step={0.01} value={volume}
            onPointerDown={() => { if (mode === 'web-audio') ensureGain(); }}
            onTouchStart={() => { if (mode === 'web-audio') ensureGain(); }}
            onChange={(e) => setLevel(Number(e.target.value))}
            className="min-w-0 flex-1 cursor-pointer accent-[#52d9ed]"
          />
        )}
        <button type="button" aria-label={copy.loop} aria-pressed={loop} onClick={() => setLoop((prev) => !prev)} className={'grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ' + (loop ? 'bg-cyan-400/10 text-cyan-200' : 'text-slate-500 hover:bg-white/5 hover:text-slate-200')}>
          <RotateCcw aria-hidden className="h-[19px] w-[19px]" />
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-amber-200">{copy.failed}</p>}
      <style jsx>{'@keyframes myavatar-music-wave { 0%, 100% { transform:scaleY(.48) } 50% { transform:scaleY(1) } } @keyframes myavatar-disc-spin { to { transform:rotate(360deg) } } .music-preview-bar { animation:myavatar-music-wave 1.35s ease-in-out infinite; } .music-disc-playing { animation:myavatar-disc-spin 9s linear infinite; } @media (prefers-reduced-motion:reduce) { .music-preview-bar,.music-disc-playing { animation:none!important; } }'}</style>
    </section>
  );
}
