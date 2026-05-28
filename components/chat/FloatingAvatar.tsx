'use client';

/**
 * FloatingAvatar — the v2 cyber-workspace avatar.
 *
 * Default: a small circular video widget locked at `fixed bottom-6 right-6 z-50`
 * (ambient muted loop). Click → smoothly expands face-to-face across the whole
 * viewport with sound; close → snaps back to the corner. Replaces the old
 * giant top avatar banner entirely. Renders a marine-orb fallback widget when no
 * avatar video asset is configured.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Volume2, VolumeX, Bot } from 'lucide-react';
import { resolveAvatarVideo } from '@/lib/avatar/video-config';

const { idleUrl: VIDEO_URL, poster: POSTER, hasVideo: HAS_VIDEO } = resolveAvatarVideo();

export function FloatingAvatar() {
  const [expanded, setExpanded] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const cornerRef = useRef<HTMLVideoElement | null>(null);
  const fullRef = useRef<HTMLVideoElement | null>(null);

  // Ambient muted loop on the corner widget.
  useEffect(() => {
    const v = cornerRef.current;
    if (!v) return;
    v.muted = true; v.loop = true;
    void Promise.resolve(v.play()).catch(() => { /* autoplay blocked — poster stays */ });
  }, [expanded]);

  // On expand, play full-screen with sound (the click is the user gesture).
  useEffect(() => {
    if (!expanded) { setSoundOn(false); return; }
    const v = fullRef.current;
    if (!v) return;
    v.loop = false;
    try { v.currentTime = 0; } catch { /* noop */ }
    v.muted = false;
    void Promise.resolve(v.play()).then(() => setSoundOn(true)).catch(() => {
      // Sound blocked → fall back to muted playback so the avatar still animates.
      v.muted = true;
      setSoundOn(false);
      void Promise.resolve(v.play()).catch(() => {});
    });
  }, [expanded]);

  const toggleSound = useCallback(() => {
    const v = fullRef.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted) void Promise.resolve(v.play()).catch(() => {});
    setSoundOn(!v.muted);
  }, []);

  return (
    <>
      {/* ── Corner widget ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {!expanded && (
          <motion.button
            type="button"
            key="corner"
            onClick={() => setExpanded(true)}
            aria-label="Open avatar"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="fixed bottom-6 right-6 z-50 h-16 w-16 rounded-full overflow-hidden border-2 border-cyan-400/50 shadow-[0_10px_36px_-8px_rgba(56,189,248,0.85)] active:scale-95 group"
          >
            {HAS_VIDEO ? (
              <video
                ref={cornerRef}
                src={VIDEO_URL}
                poster={POSTER}
                muted loop playsInline preload="metadata"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600">
                <Bot size={26} className="text-white" />
              </span>
            )}
            <span aria-hidden className="pointer-events-none absolute -inset-1 rounded-full ring-2 ring-cyan-400/30 animate-ping" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Full-screen face-to-face ───────────────────────────────────── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            key="full"
            initial={{ opacity: 0, scale: 0.2 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.2 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            style={{ transformOrigin: 'bottom right' }}
            className="fixed inset-0 z-[60] bg-[#030303] flex items-center justify-center"
          >
            {/* Strict 9:16 stage — full-bleed on mobile (inset-0), a centered
                vertical 9:16 box on desktop. object-contain so the executive
                figure (head + suit + tie) is never cropped or distorted. */}
            <div className="relative h-full w-full overflow-hidden md:h-[96vh] md:w-auto md:aspect-[9/16] md:rounded-[1.75rem] md:border md:border-white/10 md:shadow-[0_40px_140px_-30px_rgba(56,189,248,0.65)]">
              {HAS_VIDEO ? (
                <video
                  ref={fullRef}
                  src={VIDEO_URL}
                  poster={POSTER}
                  playsInline preload="auto"
                  onEnded={() => setSoundOn(false)}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-white/70">
                  <span className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600">
                    <Bot size={48} className="text-white" />
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Close avatar"
              className="absolute top-5 right-5 h-11 w-11 rounded-full bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-center text-white hover:bg-white/20 active:scale-90 transition"
            >
              <X size={20} />
            </button>
            {HAS_VIDEO && (
              <button
                type="button"
                onClick={toggleSound}
                aria-label={soundOn ? 'Mute' : 'Unmute'}
                className="absolute top-5 left-5 h-11 w-11 rounded-full bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-center text-white hover:bg-white/20 active:scale-90 transition"
              >
                {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
