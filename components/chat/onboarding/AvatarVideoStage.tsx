'use client';

/**
 * AvatarVideoStage — premium glassmorphic talking-avatar viewport.
 *
 * Renders an idle cinematic loop and (optionally) a talking loop, cross-fading to
 * the talking layer while `speaking` is true so the avatar visibly "talks" in
 * sync with the premium Georgian audio lifecycle (play → talking, ended → idle).
 *
 * Sources are env-driven (NEXT_PUBLIC_AVATAR_*_VIDEO_URL); when none is configured
 * it gracefully falls back to the animated marine orb — so the experience is real
 * today and upgrades to a true video avatar the moment an asset URL is set.
 *
 * NOTE: this is lifecycle-synced (talks while audio plays), not phoneme-accurate
 * lip-sync — frame-accurate sync to arbitrary ElevenLabs audio needs a real-time
 * avatar engine (HeyGen/LiveKit), tracked separately.
 */

import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { resolveAvatarVideo } from '@/lib/avatar/video-config';

const { idleUrl: IDLE_URL, talkUrl: TALK_URL, poster: POSTER, hasVideo: HAS_VIDEO, hasTalkingLayer: HAS_TALK } = resolveAvatarVideo();

const PEAKS = [14, 20, 11, 22, 13, 18];

export function AvatarVideoStage({ speaking }: { speaking: boolean }) {
  const talkRef = useRef<HTMLVideoElement | null>(null);
  const reduceMotion = useReducedMotion();
  const hasVideo = HAS_VIDEO;

  // Drive the talking clip from the audio lifecycle. play() rejects ASYNC when
  // autoplay is blocked, so we must .catch() the promise — a try/catch alone
  // would leak an unhandled rejection to the console.
  useEffect(() => {
    if (!HAS_TALK) return;
    const t = talkRef.current;
    if (!t) return;
    if (speaking) {
      try { t.currentTime = 0; } catch { /* noop */ }
      void Promise.resolve(t.play()).catch(() => { /* autoplay blocked — orb/idle stays */ });
    } else {
      try { t.pause(); } catch { /* noop */ }
    }
  }, [speaking]);

  // Respect prefers-reduced-motion: hold a steady glow/orb instead of looping.
  const animate = speaking && !reduceMotion;

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="relative"
    >
      {/* Marine glow — intensifies while talking */}
      <motion.span
        aria-hidden className="absolute -inset-5 rounded-[2.25rem] blur-2xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.45), rgba(37,99,235,0.12) 60%, transparent 75%)' }}
        animate={animate ? { scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] } : { scale: 1, opacity: speaking ? 0.85 : 0.4 }}
        transition={{ duration: 1.6, repeat: animate ? Infinity : 0, ease: 'easeInOut' }}
      />

      {/* Glass-frame viewport */}
      <div className="avatar-video-viewport relative w-[clamp(176px,42vw,288px)] aspect-[3/4] rounded-[1.75rem] overflow-hidden border border-white/10 bg-black/40 backdrop-blur-xl shadow-[0_22px_70px_-20px_rgba(56,189,248,0.6)]">
        {hasVideo ? (
          <>
            <video
              src={IDLE_URL} poster={POSTER} autoPlay loop muted playsInline preload="auto"
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${speaking && HAS_TALK ? 'opacity-0' : 'opacity-100'}`}
            />
            {HAS_TALK && (
              <video
                ref={talkRef} src={TALK_URL} poster={POSTER} loop muted playsInline preload="auto"
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${speaking ? 'opacity-100' : 'opacity-0'}`}
              />
            )}
          </>
        ) : (
          // Graceful fallback — animated marine orb until a video asset URL is set.
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#04101c] to-[#02060d]">
            <motion.div
              className="h-28 w-28 rounded-full flex items-center justify-center bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 shadow-[0_0_50px_-8px_rgba(56,189,248,0.85)]"
              animate={animate ? { scale: [1, 1.06, 0.98, 1.04, 1] } : { scale: speaking ? 1.03 : 1 }}
              transition={{ duration: 0.9, repeat: animate ? Infinity : 0, ease: 'easeInOut' }}
            >
              <Sparkles size={40} className="text-white" />
            </motion.div>
          </div>
        )}

        {/* Talking soundwave overlay (lifecycle-synced) */}
        {speaking && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-end gap-[3px] h-5" aria-hidden>
            {PEAKS.map((peak, i) => (
              <motion.span
                key={i} className="w-[3px] rounded-full bg-gradient-to-t from-blue-500 to-cyan-300"
                initial={{ height: 4 }}
                animate={reduceMotion ? { height: Math.round(peak / 2) } : { height: [4, peak, 6, peak - 5, 4] }}
                transition={{ duration: 0.8, repeat: reduceMotion ? 0 : Infinity, ease: 'easeInOut', delay: i * 0.08 }}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
