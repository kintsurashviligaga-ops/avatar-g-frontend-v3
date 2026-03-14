'use client';

/**
 * components/landing/premium/PromoVideo.tsx
 * ==========================================
 * Vertical (9:16) promotional video player for the MyAvatar.ge landing page.
 *
 * Features:
 *   - 9:16 vertical aspect ratio for social media style
 *   - Autoplay, muted, loop with play/pause toggle
 *   - Elegant cinematic fallback poster when video unavailable
 *   - Phone-frame presentation style
 *   - Lazy loading
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Sparkles } from 'lucide-react';

const VIDEO_SRC = '/media/promo/myavatar-promo-ad.mp4';

export function PromoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [hasVideo, setHasVideo] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onCanPlay = () => { setHasVideo(true); setLoaded(true); };
    const onError = () => { setHasVideo(false); setLoaded(true); };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener('canplay', onCanPlay);
    v.addEventListener('error', onError);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    const timer = setTimeout(() => { if (!hasVideo) setLoaded(true); }, 3000);
    return () => {
      v.removeEventListener('canplay', onCanPlay);
      v.removeEventListener('error', onError);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || !hasVideo) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, [hasVideo]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  return (
    <section className="relative py-16 sm:py-24 overflow-hidden">
      {/* Background ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[800px]"
          style={{ background: 'radial-gradient(ellipse 50% 50%, rgba(34,211,238,0.06) 0%, transparent 70%)', filter: 'blur(80px)' }} />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6">
        {/* Section header */}
        <div className="text-center mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
            style={{ backgroundColor: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.15)' }}>
            <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--color-accent)' }} />
            <span className="text-xs font-semibold tracking-wider uppercase" style={{ color: 'var(--color-accent)' }}>
              Platform Preview
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight mb-3"
            style={{ color: 'var(--color-text)' }}>
            See It In Action
          </h2>
          <p className="text-sm sm:text-base max-w-lg mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
            Watch how MyAvatar.ge transforms your ideas into professional AI-powered content
          </p>
        </div>

        {/* Video container — phone-frame style */}
        <div className="flex justify-center">
          <div className="relative group" style={{ width: 'min(320px, 80vw)' }}>
            {/* Phone frame glow */}
            <div className="absolute -inset-3 rounded-[2.5rem] pointer-events-none opacity-60"
              style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.15), rgba(6,182,212,0.08), rgba(34,211,238,0.10))', filter: 'blur(20px)' }} />

            {/* Phone frame */}
            <div className="relative rounded-[2rem] overflow-hidden"
              style={{
                aspectRatio: '9 / 16',
                border: '2px solid rgba(34,211,238,0.15)',
                boxShadow: '0 0 60px rgba(34,211,238,0.08), 0 25px 50px rgba(0,0,0,0.4)',
                backgroundColor: '#0a0a1a',
              }}>

              {/* Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 z-30 w-24 h-5 rounded-b-xl"
                style={{ backgroundColor: '#0a0a1a' }} />

              {/* Loading spinner */}
              {!loaded && (
                <div className="absolute inset-0 z-20 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
                    style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
                </div>
              )}

              {/* Cinematic poster fallback */}
              {loaded && !hasVideo && <PromoPoster />}

              {/* Video */}
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ display: hasVideo ? undefined : 'none' }}
                src={VIDEO_SRC}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
              />

              {/* Controls overlay */}
              {hasVideo && (
                <div className="absolute inset-0 z-20 flex items-end justify-between p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 40%)' }}
                  onClick={togglePlay}>
                  <button
                    onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                    className="p-2 rounded-xl backdrop-blur-md transition-all hover:scale-105"
                    style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff' }}
                    aria-label={playing ? 'Pause' : 'Play'}>
                    {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                    className="p-2 rounded-xl backdrop-blur-md transition-all hover:scale-105"
                    style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff' }}
                    aria-label={muted ? 'Unmute' : 'Mute'}>
                    {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </div>

            {/* Bottom reflection */}
            <div className="absolute -bottom-4 left-4 right-4 h-8 rounded-b-[2rem] opacity-30"
              style={{ background: 'linear-gradient(to bottom, rgba(34,211,238,0.06), transparent)', filter: 'blur(8px)' }} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Cinematic Poster Fallback ───────────────────────────── */

function PromoPoster() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6"
      style={{ background: 'linear-gradient(180deg, #0a0a1a 0%, #0d1025 40%, #111340 70%, #0a0a1a 100%)' }}>
      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(34,211,238,0.18) 0%, transparent 70%)', filter: 'blur(40px)' }} />

      {/* Logo */}
      <div className="relative z-10 w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.9), rgba(6,182,212,0.9))', boxShadow: '0 0 40px rgba(34,211,238,0.3)' }}>
        <Sparkles className="w-7 h-7 text-white" />
      </div>

      <div className="relative z-10 text-center">
        <h3 className="text-lg font-bold text-white tracking-tight mb-1">MyAvatar.ge</h3>
        <p className="text-xs text-white/40">AI Creation Platform</p>
      </div>

      {/* Fake video timeline */}
      <div className="relative z-10 w-full max-w-[200px] mt-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(34,211,238,0.15)' }}>
            <Play className="w-3 h-3 text-white/60" />
          </div>
          <div className="flex-1 h-1 rounded-full bg-white/10">
            <div className="h-full w-1/3 rounded-full" style={{ background: 'linear-gradient(to right, rgba(34,211,238,0.6), rgba(6,182,212,0.3))' }} />
          </div>
          <span className="text-[10px] text-white/30 tabular-nums">0:08</span>
        </div>
      </div>

      {/* CTA text */}
      <p className="relative z-10 text-xs font-medium text-white/25 tracking-wider uppercase mt-2">
        Promotional Video
      </p>
    </div>
  );
}
