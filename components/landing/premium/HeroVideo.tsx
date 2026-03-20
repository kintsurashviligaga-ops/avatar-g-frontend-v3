'use client'

/**
 * HeroVideo — Full functional cinematic video player.
 * Features: play/pause, mute/unmute, volume slider, progress bar,
 * time display, fullscreen, poster fallback.
 */

import { useRef, useState, useCallback, useEffect } from 'react'
import { Play, Pause, Maximize, Minimize, Volume2, VolumeX, Sparkles } from 'lucide-react'

const VIDEO_SRC = '/media/landing/myavatar-hero-video.mp4'
const POSTER_SRC = '/media/landing/myavatar-hero-poster.jpg'

function formatTime(s: number) {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [volume, setVolume] = useState(0.7)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [hasVideo, setHasVideo] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Detect video availability */
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onCanPlay = () => { setHasVideo(true); setLoaded(true); setDuration(v.duration || 0) }
    const onLoadedData = () => { setHasVideo(true); setLoaded(true); setDuration(v.duration || 0) }
    const onError = () => { setHasVideo(false); setLoaded(true) }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onTime = () => {
      if (!v.duration) return
      setCurrentTime(v.currentTime)
      setProgress((v.currentTime / v.duration) * 100)
    }
    const onDurationChange = () => setDuration(v.duration || 0)
    // If video is already loaded (cached), detect immediately
    if (v.readyState >= 2) {
      setHasVideo(true); setLoaded(true); setDuration(v.duration || 0)
    }
    v.addEventListener('canplay', onCanPlay)
    v.addEventListener('loadeddata', onLoadedData)
    v.addEventListener('error', onError)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('durationchange', onDurationChange)
    // Try to play (muted autoplay is allowed on most browsers)
    v.play().catch(() => {})
    const timer = setTimeout(() => { if (!hasVideo) setLoaded(true) }, 5000)
    return () => {
      v.removeEventListener('canplay', onCanPlay)
      v.removeEventListener('loadeddata', onLoadedData)
      v.removeEventListener('error', onError)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('durationchange', onDurationChange)
      clearTimeout(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Fullscreen change listener */
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  /* Auto-hide controls */
  const flashControls = useCallback(() => {
    setShowControls(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setShowControls(false), 3000)
  }, [])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v || !hasVideo) return
    if (v.paused) { v.play().catch(() => {}) } else { v.pause() }
    flashControls()
  }, [hasVideo, flashControls])

  const toggleMute = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
    if (!v.muted) { v.volume = volume }
    flashControls()
  }, [volume, flashControls])

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current
    if (!v) return
    const val = parseFloat(e.target.value)
    v.volume = val
    v.muted = val === 0
    setVolume(val)
    setMuted(val === 0)
    flashControls()
  }, [flashControls])

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current
    const bar = progressRef.current
    if (!v || !bar || !v.duration) return
    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    v.currentTime = ratio * v.duration
    flashControls()
  }, [flashControls])

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      el.requestFullscreen().catch(() => {})
    }
  }, [])

  const controlsVisible = showControls || !playing

  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full group"
      style={{ maxWidth: 1100, borderRadius: 16, overflow: 'hidden' }}
      onMouseMove={flashControls}
      onMouseEnter={flashControls}
    >
      <div className="relative w-full" style={{ aspectRatio: '16 / 9' }}>
        {/* Glow border */}
        <div
          className="absolute -inset-px rounded-[17px] pointer-events-none z-10"
          style={{
            background: 'linear-gradient(135deg, rgba(34,211,238,0.25), rgba(6,182,212,0.15), rgba(34,211,238,0.10))',
            padding: 1,
            mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            maskComposite: 'exclude',
            WebkitMaskComposite: 'xor',
          }}
        />

        {/* Loading skeleton */}
        {!loaded && (
          <div className="absolute inset-0 z-[5] flex items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <div className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
          </div>
        )}

        {/* Fallback poster */}
        {loaded && !hasVideo && <CinematicPoster />}

        {/* Video element */}
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
          preload="auto"
        />

        {/* Click-to-play overlay area */}
        {hasVideo && (
          <div
            className="absolute inset-0 z-20 cursor-pointer"
            onClick={togglePlay}
          />
        )}

        {/* ── Controls bar ── */}
        {hasVideo && (
          <div
            className="absolute bottom-0 left-0 right-0 z-30 transition-all duration-300"
            style={{
              opacity: controlsVisible ? 1 : 0,
              transform: controlsVisible ? 'translateY(0)' : 'translateY(8px)',
              pointerEvents: controlsVisible ? 'auto' : 'none',
              background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.35) 60%, transparent 100%)',
            }}
          >
            {/* Progress bar */}
            <div
              ref={progressRef}
              className="relative w-full h-6 flex items-center px-4 cursor-pointer group/progress"
              onClick={handleProgressClick}
            >
              <div className="w-full h-1 group-hover/progress:h-1.5 rounded-full transition-all" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                <div
                  className="h-full rounded-full relative"
                  style={{
                    width: `${progress}%`,
                    background: 'linear-gradient(90deg, #0891b2, #22d3ee)',
                    boxShadow: '0 0 8px rgba(34,211,238,0.4)',
                  }}
                >
                  {/* Thumb dot */}
                  <div
                    className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity"
                    style={{ backgroundColor: '#22d3ee', boxShadow: '0 0 6px #22d3ee' }}
                  />
                </div>
              </div>
            </div>

            {/* Button row */}
            <div className="flex items-center justify-between px-4 pb-3 pt-0.5">
              <div className="flex items-center gap-2">
                {/* Play / Pause */}
                <button
                  onClick={(e) => { e.stopPropagation(); togglePlay() }}
                  className="p-2 rounded-lg transition-all hover:scale-110 active:scale-95"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
                  aria-label={playing ? 'Pause' : 'Play'}
                >
                  {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>

                {/* Mute / Unmute */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleMute() }}
                  className="p-2 rounded-lg transition-all hover:scale-110 active:scale-95"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                >
                  {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>

                {/* Volume slider */}
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={muted ? 0 : volume}
                  onChange={handleVolumeChange}
                  onClick={(e) => e.stopPropagation()}
                  className="w-16 sm:w-20 h-1 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #22d3ee ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.15) ${(muted ? 0 : volume) * 100}%)`,
                    accentColor: '#22d3ee',
                  }}
                  aria-label="Volume"
                />

                {/* Time display */}
                <span className="text-[11px] font-mono tabular-nums ml-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              {/* Fullscreen */}
              <button
                onClick={(e) => { e.stopPropagation(); toggleFullscreen() }}
                className="p-2 rounded-lg transition-all hover:scale-110 active:scale-95"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
                aria-label="Fullscreen"
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {/* Center play button when paused */}
        {hasVideo && !playing && (
          <div className="absolute inset-0 z-[25] flex items-center justify-center pointer-events-none">
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              <Play className="w-7 h-7 sm:w-9 sm:h-9 text-white ml-1" />
            </div>
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
        border: '1px solid rgba(34,211,238,0.15)',
      }}>
      {/* Ambient glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] pointer-events-none" style={{ background: 'radial-gradient(ellipse, rgba(34,211,238,0.15) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[200px] pointer-events-none" style={{ background: 'radial-gradient(ellipse, rgba(6,182,212,0.10) 0%, transparent 70%)', filter: 'blur(50px)' }} />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-4 px-6 text-center">
        {/* Agent G Icon */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.9), rgba(6,182,212,0.9))', boxShadow: '0 0 60px rgba(34,211,238,0.3), 0 0 120px rgba(6,182,212,0.15)' }}>
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
          <div className="w-16 h-1 rounded-full" style={{ background: 'linear-gradient(to right, rgba(34,211,238,0.6), rgba(6,182,212,0.3))' }} />
          <span className="text-[10px] font-medium text-white/30 tracking-wider uppercase">Cinematic Preview</span>
          <div className="w-16 h-1 rounded-full" style={{ background: 'linear-gradient(to left, rgba(34,211,238,0.6), rgba(6,182,212,0.3))' }} />
        </div>
      </div>
    </div>
  )
}
