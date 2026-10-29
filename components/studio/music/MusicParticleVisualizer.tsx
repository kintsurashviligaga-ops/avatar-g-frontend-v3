'use client';

/**
 * Restrained, cinematic blue particle visualizer that follows ACTUAL
 * decoded song energy and onset transients via the media element clock.
 * Neither a fixed-BPM animation nor a media-element Web Audio connection.
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

type Particle = {
  angle: number;
  radial: number;
  phase: number;
  size: number;
  color: number;
  glint: boolean;
  drift: number;
};

function randomSequence(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const rand = randomSequence(0x2bc7318);
const PARTICLES: Particle[] = Array.from({ length: 1050 }, () => {
  const radial = Math.sqrt(rand());
  return {
    angle: rand() * Math.PI * 2,
    radial,
    phase: rand() * Math.PI * 2,
    size: 0.55 + Math.pow(rand(), 3) * 1.65,
    color: Math.floor(rand() * 4),
    glint: rand() > 0.985,
    drift: 0.4 + rand() * 0.8,
  };
});

export function MusicParticleVisualizer({ playing, compact = false, audioRef, beatTrack = null, seekVersion = 0 }: MusicParticleVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let visible = true;
    let width = 0;
    let height = 0;
    let raf = 0;
    let lastFrame = -1000;
    // Positions are computed from audio.currentTime, not elapsed wall time.
    // Pausing, seeking or network stalls cannot shift the visual off the beat.
    const reactive = !!beatTrack?.frames.length;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      draw();
    };

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.46;
      const time = audioRef?.current?.currentTime ?? 0;
      const meter = beatAtTime(beatTrack, time);
      const pulse = 1 + 0.07 * meter.bass + 0.17 * meter.beat;
      const intensity = reactive ? 0.54 + meter.energy * 0.20 + meter.beat * 0.30 : 0.45;

      // Soft two-tone light field stays within the four-point particle star.
      const aura = ctx.createRadialGradient(centerX, centerY, radius * 0.05, centerX, centerY, radius * 0.82);
      aura.addColorStop(0, 'rgba(3, 54, 111, ' + (0.07 + meter.beat * 0.10).toFixed(3) + ')');
      aura.addColorStop(0.55, 'rgba(0, 89, 220, ' + (0.06 + meter.bass * 0.09).toFixed(3) + ')');
      aura.addColorStop(1, 'rgba(0, 55, 135, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.84, 0, Math.PI * 2);
      ctx.fill();

      for (const p of PARTICLES) {
        const a = p.angle;
        // Cardinal tips create the four-armed diamond from the screenshot.
        const spike = 0.49 + 0.51 * Math.pow(Math.abs(Math.cos(2 * a)), 7);
        const jitter = reactive && !reducedMotion
          ? 0.008 * Math.sin(p.phase + time * (0.55 + p.drift)) * (meter.energy + meter.beat)
          : 0;
        const r = radius * spike * (0.16 + 0.86 * p.radial) * (1 + jitter) * pulse;
        const shear = reactive && !reducedMotion ? 0.005 * meter.energy * Math.sin(p.phase + time) : 0;
        const x = centerX + r * Math.cos(a + shear);
        const y = centerY + r * Math.sin(a + shear) * 0.91;
        const opacity = Math.min(1, (0.28 + 0.65 * p.radial) * intensity);
        const colors = [
          'rgba(7, 112, 255, ',
          'rgba(17, 183, 247, ',
          'rgba(79, 217, 255, ',
          'rgba(226, 250, 255, ',
        ];
        ctx.fillStyle = colors[p.color] + opacity.toFixed(2) + ')';
        ctx.beginPath();
        ctx.arc(x, y, p.size * (p.glint ? 1.32 : 1), 0, Math.PI * 2);
        ctx.fill();

        if (p.glint) {
          ctx.strokeStyle = 'rgba(145, 238, 255, ' + (opacity * 0.48).toFixed(2) + ')';
          ctx.lineWidth = 0.55;
          const length = p.size * 3.2;
          ctx.beginPath();
          ctx.moveTo(x - length, y);
          ctx.lineTo(x + length, y);
          ctx.moveTo(x, y - length);
          ctx.lineTo(x, y + length);
          ctx.stroke();
        }
      }
    }

    const animate = (stamp: number) => {
      if (!visible || document.hidden || reducedMotion || !playing || !reactive) return;
      // 30 fps cap keeps iPhone heat and battery use reasonable.
      if (stamp - lastFrame >= 32) {
        draw();
        lastFrame = stamp;
      }
      raf = requestAnimationFrame(animate);
    };
    resize();

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    const intersection = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((entries) => {
        visible = entries[0]?.isIntersecting ?? true;
        if (visible) {
          draw();
          cancelAnimationFrame(raf);
          if (playing && reactive && !reducedMotion && !document.hidden) raf = requestAnimationFrame(animate);
        } else {
          cancelAnimationFrame(raf);
        }
      }, { threshold: 0.01 }) : null;
    intersection?.observe(canvas);
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else if (playing && reactive && visible && !reducedMotion) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(animate);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (playing && reactive && !reducedMotion) raf = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
      intersection?.disconnect();
    };
  }, [playing, beatTrack, audioRef, seekVersion]);

  return (
    <div
      data-testid="music-equalizer"
      data-playing={playing ? 'true' : 'false'}
      aria-hidden="true"
      className={'pointer-events-none relative mx-auto w-full overflow-hidden ' + (compact ? 'max-w-[360px]' : 'max-w-[460px]')}
    >
      <div className="pointer-events-none absolute inset-[16%] rounded-full bg-[radial-gradient(circle,rgba(5,99,193,0.13),transparent_68%)] blur-2xl" />
      <canvas
        ref={canvasRef}
        data-testid="music-particle-canvas"
        className="relative block aspect-square h-auto w-full"
      />
    </div>
  );
}
