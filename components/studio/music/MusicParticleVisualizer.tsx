'use client';

/**
 * Decorative, responsive particle visualizer for a music preview.
 * Lightweight 2D canvas: deliberately independent of Web Audio/CORS, so private
 * signed music links play natively on iOS. Animation follows playback only.
 */
import { useEffect, useRef } from 'react';

export interface MusicParticleVisualizerProps {
  playing: boolean;
  compact?: boolean;
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
const PARTICLES: Particle[] = Array.from({ length: 1660 }, () => {
  const radial = Math.sqrt(rand());
  return {
    angle: rand() * Math.PI * 2,
    radial,
    phase: rand() * Math.PI * 2,
    size: 0.55 + Math.pow(rand(), 3) * 1.65,
    color: Math.floor(rand() * 4),
    glint: rand() > 0.975,
    drift: 0.4 + rand() * 0.8,
  };
});

export function MusicParticleVisualizer({ playing, compact = false }: MusicParticleVisualizerProps) {
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
    const born = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      draw(0);
    };

    function draw(seconds: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.46;
      const time = reducedMotion || !playing ? 0 : seconds;
      const pulse = 1 + 0.035 * Math.sin(time * 1.9);

      // Soft two-tone light field stays within the four-point particle star.
      const aura = ctx.createRadialGradient(centerX, centerY, radius * 0.05, centerX, centerY, radius * 0.82);
      aura.addColorStop(0, 'rgba(3, 54, 111, 0.20)');
      aura.addColorStop(0.55, 'rgba(0, 89, 220, 0.12)');
      aura.addColorStop(1, 'rgba(0, 55, 135, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.84, 0, Math.PI * 2);
      ctx.fill();

      for (const p of PARTICLES) {
        const a = p.angle;
        // Cardinal tips create the four-armed diamond from the screenshot.
        const spike = 0.49 + 0.51 * Math.pow(Math.abs(Math.cos(2 * a)), 7);
        const wobble = 1 + 0.037 * Math.sin(time * (0.75 + p.drift) + p.phase);
        const r = radius * spike * (0.16 + 0.86 * p.radial) * wobble * pulse;
        const shear = playing && !reducedMotion ? 0.007 * Math.sin(time * 0.6 + p.phase) : 0;
        const x = centerX + r * Math.cos(a + shear);
        const y = centerY + r * Math.sin(a + shear) * 0.91;
        const opacity = (0.36 + 0.55 * p.radial) * (0.87 + 0.13 * Math.sin(time * p.drift * 2 + p.phase));
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
      if (!visible || document.hidden || reducedMotion || !playing) return;
      // 30 fps cap keeps iPhone heat and battery use reasonable.
      if (stamp - lastFrame >= 32) {
        draw((stamp - born) / 1000);
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
          draw(0);
          if (playing && !reducedMotion) raf = requestAnimationFrame(animate);
        } else {
          cancelAnimationFrame(raf);
        }
      }, { threshold: 0.01 }) : null;
    intersection?.observe(canvas);
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else if (playing && visible && !reducedMotion) raf = requestAnimationFrame(animate);
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (playing && !reducedMotion) raf = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
      intersection?.disconnect();
    };
  }, [playing]);

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
