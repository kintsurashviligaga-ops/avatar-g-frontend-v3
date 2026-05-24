'use client';

/**
 * AvatarVideoStage — cinematic onboarding intro player.
 *
 * Plays the real, professionally-voiced Georgian brand film (audio + burned-in
 * captions) inside a glassmorphic widescreen frame. Browsers block autoplay WITH
 * sound, so we:
 *   1. autoplay MUTED + loop as an ambient teaser (captions still convey meaning),
 *   2. expose a prominent "ხმით ნახვა" (watch with sound) control — the first user
 *      gesture unmutes and restarts from the top so the full Georgian voice plays,
 *   3. on end, return to the muted ambient loop.
 *
 * Source is env-driven (NEXT_PUBLIC_AVATAR_*); when none is configured it falls
 * back to the animated marine orb. NO neutral/robotic TTS is used — the voice is
 * the real recording embedded in the film.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Sparkles, Volume2, VolumeX, Play } from 'lucide-react';
import { resolveAvatarVideo } from '@/lib/avatar/video-config';

const { idleUrl: VIDEO_URL, poster: POSTER, hasVideo: HAS_VIDEO } = resolveAvatarVideo();

const PEAKS = [14, 22, 12, 24, 15, 20, 13];

/**
 * `cinematic` — large, for the full-screen onboarding gate.
 * `anchor`    — compact, for the persistent central host at the top of the chat.
 */
export interface AvatarVideoStageProps {
  variant?: 'cinematic' | 'anchor';
}

export function AvatarVideoStage({ variant = 'cinematic' }: AvatarVideoStageProps = {}) {
  const anchor = variant === 'anchor';
  const frameWidth = anchor ? 'w-[clamp(120px,30vw,168px)]' : 'w-[clamp(220px,58vw,300px)]';
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reduceMotion = useReducedMotion();
  const [soundOn, setSoundOn] = useState(false);

  // Ambient muted autoplay on mount (browser-allowed).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.loop = true;
    void Promise.resolve(v.play()).catch(() => { /* autoplay blocked — poster stays */ });
  }, []);

  const enableSound = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.loop = false;
    try { v.currentTime = 0; } catch { /* noop */ }
    void Promise.resolve(v.play()).catch(() => { /* keep muted state if blocked */ });
    setSoundOn(true);
  }, []);

  const muteBackToAmbient = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.loop = true;
    void Promise.resolve(v.play()).catch(() => { /* noop */ });
    setSoundOn(false);
  }, []);

  const toggleSound = useCallback(() => {
    if (soundOn) muteBackToAmbient();
    else enableSound();
  }, [soundOn, enableSound, muteBackToAmbient]);

  const onEnded = useCallback(() => {
    // Voice finished → return to ambient muted loop.
    muteBackToAmbient();
  }, [muteBackToAmbient]);

  const glowActive = soundOn && !reduceMotion;

  return (
    <motion.div
      initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`relative ${frameWidth}`}
    >
      {/* Marine glow — intensifies while the voice plays */}
      <motion.span
        aria-hidden className="absolute -inset-5 rounded-[2.5rem] blur-2xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.42), rgba(37,99,235,0.12) 60%, transparent 75%)' }}
        animate={glowActive ? { scale: [1, 1.05, 1], opacity: [0.65, 1, 0.65] } : { scale: 1, opacity: soundOn ? 0.8 : 0.4 }}
        transition={{ duration: 1.8, repeat: glowActive ? Infinity : 0, ease: 'easeInOut' }}
      />

      {/* Glass-frame portrait avatar viewport — anchor variant is hard-capped at
          40vh so it stays a proud central host without ever crowding the chat. */}
      <div className={`avatar-video-viewport group relative w-full aspect-[9/16] rounded-[1.5rem] overflow-hidden border border-white/10 bg-black/50 backdrop-blur-xl shadow-[0_28px_90px_-24px_rgba(56,189,248,0.6)] ${anchor ? 'max-h-[40vh]' : ''}`}>
        {HAS_VIDEO ? (
          <>
            <video
              ref={videoRef} src={VIDEO_URL} poster={POSTER}
              playsInline preload="metadata"
              onEnded={onEnded} onClick={toggleSound}
              className="absolute inset-0 h-full w-full object-cover cursor-pointer"
            />

            {/* Tap-to-unmute overlay — only while ambient/muted */}
            {!soundOn && (
              <button
                type="button" onClick={enableSound}
                aria-label="watch with sound"
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-t from-black/55 via-black/10 to-black/20 transition-opacity"
              >
                <span className={`flex items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 shadow-[0_10px_40px_-8px_rgba(56,189,248,0.9)] transition-transform group-hover:scale-105 active:scale-95 ${anchor ? 'h-11 w-11' : 'h-16 w-16'}`}>
                  <Play size={anchor ? 20 : 30} className="ml-0.5 fill-white text-white" />
                </span>
                {!anchor && (
                  <span className="rounded-full bg-black/50 px-3 py-1 text-[12px] font-semibold text-white/90 backdrop-blur-sm">
                    ▶ ხმით ნახვა
                  </span>
                )}
              </button>
            )}

            {/* Sound toggle — top-right while playing with sound */}
            {soundOn && (
              <button
                type="button" onClick={toggleSound}
                aria-label="toggle sound"
                className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white/90 backdrop-blur-md transition hover:bg-black/65 active:scale-95"
              >
                <Volume2 size={16} />
              </button>
            )}

            {/* Ambient (muted) badge */}
            {!soundOn && (
              <span className="pointer-events-none absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white/70 backdrop-blur-md">
                <VolumeX size={16} />
              </span>
            )}
          </>
        ) : (
          // Graceful fallback — animated marine orb until a video asset URL is set.
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#04101c] to-[#02060d]">
            <motion.div
              className="h-28 w-28 rounded-full flex items-center justify-center bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 shadow-[0_0_50px_-8px_rgba(56,189,248,0.85)]"
              animate={reduceMotion ? { scale: 1 } : { scale: [1, 1.05, 0.98, 1.03, 1] }}
              transition={{ duration: 2.4, repeat: reduceMotion ? 0 : Infinity, ease: 'easeInOut' }}
            >
              <Sparkles size={40} className="text-white" />
            </motion.div>
          </div>
        )}

        {/* Soundwave overlay while the voice plays */}
        {soundOn && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 flex items-end gap-[3px] h-5" aria-hidden>
            {PEAKS.map((peak, i) => (
              <motion.span
                key={i} className="w-[3px] rounded-full bg-gradient-to-t from-blue-500 to-cyan-300"
                initial={{ height: 4 }}
                animate={reduceMotion ? { height: Math.round(peak / 2) } : { height: [4, peak, 6, peak - 5, 4] }}
                transition={{ duration: 0.8, repeat: reduceMotion ? 0 : Infinity, ease: 'easeInOut', delay: i * 0.07 }}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
