'use client'

/**
 * components/landing/premium/HeroVideo.tsx
 * =========================================
 * Cinematic hero video player for the MyAvatar.ge landing page.
 *
 * Features:
 *   - Autoplay, muted, loop
 *   - Poster image loads before video
 *   - Play/Pause + Fullscreen controls
 *   - Responsive 16:9 container (max 1100px)
 *   - Lazy loading with preload="metadata"
 *   - No layout shift (aspect-ratio locked)
 *   - Language-switch safe (no text inside video)
 *   - Graceful fallback when video file is not yet available
 */

import { useRef, useState, useCallback, useEffect } from 'react'
import { Play, Pause, Maximize, Sparkles } from 'lucide-react'

const VIDEO_SRC = '/media/landing/myavatar-hero-video.mp4'
const POSTER_SRC = '/media/landing/myavatar-hero-poster.jpg'

export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [hasVideo, setHasVideo] = useState(false)
  const [loaded, setLoaded] = useState(false)

  /* Check if the video file exists */
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onCanPlay = () => { setHasVideo(true); setLoaded(true) }
    const onError = () => { setHasVideo(false); setLoaded(true) }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    v.addEventListener('canplay', onCanPlay)
    v.addEventListener('error', onError)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    // Timeout: if video doesn't load in 3s, show fallback
    const timer = setTimeout(() => { if (!hasVideo) setLoaded(true) }, 3000)
    return () => {
      v.removeEventListener('canplay', onCanPlay)
      v.removeEventListener('error', onError)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      clearTimeout(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v || !hasVideo) return
    if (v.paused) { v.play().catch(() => {}) } else { v.pause() }
  }, [hasVideo])

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      el.requestFullscreen().catch(() => {})
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full group"
      style={{ maxWidth: 1100, borderRadius: 16, overflow: 'hidden' }}
    >
      {/* 16:9 aspect ratio container — prevents layout shift */}
      <div className="relative w-full" style={{ aspectRatio: '16 / 9' }}>
        {/* Glow border */}
        <div
          className="absolute -inset-px rounded-[17px] pointer-events-none z-10"
          style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.15), rgba(99,102,241,0.10))',
            padding: 1,
            mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            maskComposite: 'exclude',
            WebkitMaskComposite: 'xor',
          }}
        />

        {/* Loading skeleton — shown before video or poster resolves */}
        {!loaded && (
          <div className="absolute inset-0 z-[5] flex items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <div className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
          </div>
        )}

        {/* Cinematic fallback poster — shown when video not available */}
        {loaded && !hasVideo && <CinematicPoster />}

        {/* Video element — hidden when no video */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover rounded-2xl"
          style={{ display: hasVideo ? undefined : 'none' }}
          src={VIDEO_SRC}
          poster={POSTER_SRC}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />

        {/* Controls overlay — visible on hover, only when video plays */}
        {hasVideo && (
          <div
            className="absolute inset-0 z-20 flex items-end justify-between px-4 pb-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none cursor-pointer"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 50%)' }}
            onClick={togglePlay}
          >
            <button
              onClick={(e) => { e.stopPropagation(); togglePlay() }}
              className="pointer-events-auto p-2.5 rounded-xl backdrop-blur-md transition-all hover:scale-105"
              style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff' }}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); toggleFullscreen() }}
              className="pointer-events-auto p-2.5 rounded-xl backdrop-blur-md transition-all hover:scale-105"
              style={{ backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff' }}
              aria-label="Fullscreen"
            >
              <Maximize className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Cinematic Poster Fallback ──────────────────────────── */

function CinematicPoster() {
  return (
    <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-6"
      style={{
        background: 'linear-gradient(135deg, #0a0a1a 0%, #0d1025 30%, #111340 60%, #0a0a1a 100%)',
        border: '1px solid rgba(99,102,241,0.15)',
      }}>
      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] pointer-events-none" style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.15) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[200px] pointer-events-none" style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,0.10) 0%, transparent 70%)', filter: 'blur(50px)' }} />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-4 px-6 text-center">
        {/* Agent G Icon */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.9), rgba(139,92,246,0.9))', boxShadow: '0 0 60px rgba(99,102,241,0.3), 0 0 120px rgba(139,92,246,0.15)' }}>
          <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
        </div>

        <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-tight">
          MyAvatar.ge
        </h3>
        <p className="text-sm sm:text-base text-white/50 max-w-md">
          AI Creation Platform — Powered by Agent G
        </p>

        {/* Service icons row */}
        <div className="flex items-center gap-3 mt-2">
          {['👤 Avatar', '🎬 Video', '🎵 Music', '🖼️ Poster', '🛒 Store', '🤖 Agent G'].map((s) => (
            <span key={s} className="text-[10px] sm:text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {s}
            </span>
          ))}
        </div>

        {/* Cinematic bar overlay */}
        <div className="flex items-center gap-2 mt-4">
          <div className="w-16 h-1 rounded-full" style={{ background: 'linear-gradient(to right, rgba(99,102,241,0.6), rgba(139,92,246,0.3))' }} />
          <span className="text-[10px] font-medium text-white/30 tracking-wider uppercase">Cinematic Preview</span>
          <div className="w-16 h-1 rounded-full" style={{ background: 'linear-gradient(to left, rgba(99,102,241,0.6), rgba(139,92,246,0.3))' }} />
        </div>
      </div>
    </div>
  )
}
