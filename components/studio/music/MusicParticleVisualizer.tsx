'use client';

/**
 * The owner's smoke-orb animation, optimized as a seamless locally hosted MP4.
 * It replaces the old four-point diamond. The MP4 contains NO sound.
 *
 * Visual reaction is tied to the real decoded track (bass/beat/energy) at
 * audio.currentTime. The video itself is pre-rendered and does not encode
 * the track's frequency content; only the glow/scale/particle response is
 * truly beat-driven. No fake BPM and no createMediaElementSource CORS risks.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { beatAtTime, type BeatTrack } from './beatAnalysis';

export interface MusicParticleVisualizerProps {
  playing: boolean;
  compact?: boolean;
  audioRef?: RefObject<HTMLAudioElement>;
  beatTrack?: BeatTrack | null;
  seekVersion?: number;
}

const VISUAL_PATH = '/media/smoke-orb-preview.mp4';

export function MusicParticleVisualizer({
  playing, compact = false, audioRef, beatTrack = null, seekVersion = 0,
}: MusicParticleVisualizerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Video is a lightweight decor layer, never the source of audio.
  // It is muted and playsInline to keep native iPhone music playback intact.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (playing && !reduce) {
      const result = video.play();
      if (result && typeof result.catch === 'function') {
        void result.catch(() => { /* leave the last painted frame visible */ });
      }
    } else {
      video.pause();
    }
    return () => { video.pause(); };
  }, [playing]);

  // Deterministic seek behavior. The orb and audio use the same timeline,
  // even when the user drags the scrubber while the music is paused.
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef?.current;
    if (!video || !audio || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const desired = audio.currentTime % video.duration;
    if (Math.abs(desired - video.currentTime) > 0.1) {
      try { video.currentTime = desired; } catch { /* seekable metadata not ready */ }
    }
  }, [seekVersion, audioRef]);

  useEffect(() => {
    const visual = canvasRef.current;
    const orb = orbRef.current;
    const halo = haloRef.current;
    if (!visual || !orb || !halo) return;
    const ctx = visual.getContext('2d', { alpha: true });
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const reactive = !!beatTrack?.frames.length;
    let width = 1;
    let height = 1;
    let visible = true;
    let raf = 0;
    let last = -1000;

    const resize = () => {
      const rect = visual.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      if (ctx) {
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
        visual.width = Math.round(width * ratio);
        visual.height = Math.round(height * ratio);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
      renderBeat();
    };

    const renderBeat = () => {
      const time = audioRef?.current?.currentTime ?? 0;
      const { energy, bass, beat } = beatAtTime(beatTrack, time);
      // No predetermined fake beat for an unanalyzable signed track.
      const scale = reactive && !reduce ? 1 + 0.035 * bass + 0.065 * beat : 1;
      const brightness = reactive ? 0.76 + 0.12 * energy + 0.18 * beat : 0.83;
      const glow = reactive ? 0.05 + 0.08 * bass + 0.13 * beat : 0.035;
      orb.style.transform = 'translateZ(0) scale(' + scale.toFixed(3) + ')';
      orb.style.filter = 'hue-rotate(191deg) saturate(1.15) contrast(1.15) brightness(' + brightness.toFixed(3) + ')';
      halo.style.opacity = Math.min(0.7, glow * 3).toFixed(3);
      halo.style.transform = 'scale(' + (1 + bass * 0.09 + beat * 0.16).toFixed(3) + ')';

      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      if (!reactive || reduce) return;
      // A restrained ring of micro-glints, driven by authentic transients.
      const power = Math.max(0, beat * 0.72 + bass * 0.12);
      if (power < 0.03) return;
      const radius = Math.min(width, height) * (0.275 + power * 0.08);
      for (let i = 0; i < 56; i++) {
        const a = (Math.PI * 2 * i / 56) + 0.035 * Math.sin(time + i);
        const d = radius * (0.78 + 0.24 * Math.sin(i * 24.17 + time * 0.6));
        const x = width / 2 + d * Math.cos(a);
        const y = height / 2 + d * Math.sin(a);
        ctx.fillStyle = 'rgba(71,180,255,' + (power * (0.07 + (i % 5) * 0.016)).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x, y, i % 7 === 0 ? 1.4 : 0.75, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const frame = (stamp: number) => {
      if (!visible || document.hidden || !playing || reduce || !reactive) return;
      if (stamp - last >= 32) { renderBeat(); last = stamp; }
      raf = requestAnimationFrame(frame);
    };
    resize();
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(visual);
    const intersection = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(entries => {
        visible = entries[0]?.isIntersecting ?? true;
        cancelAnimationFrame(raf);
        if (visible) {
          renderBeat();
          if (playing && reactive && !reduce && !document.hidden) raf = requestAnimationFrame(frame);
        }
      }, { threshold: 0.01 }) : null;
    intersection?.observe(visual);
    const visibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && visible && playing && reactive && !reduce) raf = requestAnimationFrame(frame);
    };
    document.addEventListener('visibilitychange', visibility);
    if (playing && reactive && !reduce) raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      intersection?.disconnect();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [playing, beatTrack, audioRef, seekVersion]);

  return (
    <div
      data-testid="music-equalizer"
      data-playing={playing ? 'true' : 'false'}
      aria-hidden="true"
      className={'pointer-events-none relative mx-auto w-full overflow-hidden ' + (compact ? 'max-w-[268px]' : 'max-w-[318px] sm:max-w-[348px]')}
    >
      <div
        ref={haloRef}
        className="absolute inset-[22%] rounded-full bg-[radial-gradient(ellipse,rgba(17,108,231,0.25)_0%,rgba(12,57,132,0.06)_48%,transparent_74%)] blur-[25px]"
      />
      <div
        ref={orbRef}
        data-testid="music-smoke-orb"
        className="relative aspect-square w-full will-change-transform"
      >
        <div className="absolute inset-[6%] rounded-full bg-[radial-gradient(ellipse,rgba(18,50,101,0.13)_0%,transparent_65%)]" />
        <video
          data-testid="music-smoke-video"
          ref={videoRef}
          src={VISUAL_PATH}
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          tabIndex={-1}
          className="absolute inset-0 h-full w-full object-contain"
        />
      </div>
      <canvas
        ref={canvasRef}
        data-testid="music-particle-canvas"
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}
