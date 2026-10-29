'use client';

/**
 * Lightweight, code-rendered organic smoke sphere for Music Studio.
 *
 * Inspired by the owner's smoky orb reference: volumetric specks, floating
 * wisps, soft blue-white bloom and organic turbulence (not a star, equalizer,
 * pre-recorded MP4, or fake percussive loop).
 *
 * Movement follows the HTMLAudioElement.currentTime clock, so pause, seek,
 * background stalls and resumed playback cannot desynchronize the illustration.
 * Real PCM beats/bass modulate its brightness and breathing radius only when
 * beatTrack is available. Native signed audio playback remains untouched.
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

type Speck = {
  a: number;
  r: number;
  depth: number;
  speed: number;
  seed: number;
  size: number;
  tone: number;
};

function seededRandom(seed: number) {
  let x = seed >>> 0;
  return () => ((x = (1664525 * x + 1013904223) >>> 0) / 4294967296);
}

const rand = seededRandom(0x452aceaf);
// Radial randomization puts a dense luminous cloud in the middle and tapered
// filaments outside, rather than a symmetrical diamond or a mechanical ring.
const SPECKS: Speck[] = Array.from({ length: 680 }, () => ({
  a: rand() * Math.PI * 2,
  r: Math.pow(rand(), 0.67),
  depth: rand() * 2 - 1,
  speed: 0.45 + rand() * 0.75,
  seed: rand() * Math.PI * 2,
  size: 0.6 + Math.pow(rand(), 2.8) * 1.6,
  tone: Math.floor(rand() * 4),
})).sort((a, b) => a.depth - b.depth);

const COLORS = [
  [31, 103, 193],   // deep cobalt
  [82, 158, 218],   // muted azure
  [162, 208, 238],  // ice
  [218, 226, 242],  // cool off-white
] as const;

export function MusicParticleVisualizer({
  playing, compact = false, audioRef, beatTrack = null, seekVersion = 0,
}: MusicParticleVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const reactive = !!beatTrack?.frames.length;
    let width = 1;
    let height = 1;
    let visible = true;
    let raf = 0;
    let lastFrame = -1000;

    // The sprite atlas gives each particle a soft optical falloff, with
    // fewer expensive shadows/gradients during actual animation.
    const sprites = COLORS.map(([r, g, b]) => {
      const sprite = document.createElement('canvas');
      sprite.width = 32;
      sprite.height = 32;
      const brush = sprite.getContext('2d');
      if (brush) {
        const glow = brush.createRadialGradient(16, 16, 0, 16, 16, 15);
        glow.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',0.95)');
        glow.addColorStop(0.17, 'rgba(' + r + ',' + g + ',' + b + ',0.48)');
        glow.addColorStop(0.50, 'rgba(' + r + ',' + g + ',' + b + ',0.15)');
        glow.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
        brush.fillStyle = glow;
        brush.fillRect(0, 0, 32, 32);
      }
      return sprite;
    });

    function paint() {
      if (!ctx) return;
      const t = audioRef?.current?.currentTime ?? 0;
      const meter = beatAtTime(beatTrack, t);
      const bass = reactive ? meter.bass : 0;
      const beat = reactive ? meter.beat : 0;
      const energy = reactive ? meter.energy : 0;
      const cx = width / 2;
      const cy = height / 2;
      const base = Math.min(width, height) * 0.355;
      const swell = 1 + 0.045 * bass + 0.085 * beat;

      ctx.clearRect(0, 0, width, height);

      // Underpainting: multiple transparent, overlapping washes yield a smoky
      // shape without bright turquoise bars, harsh borders or a solid disc.
      const cloud = ctx.createRadialGradient(cx, cy, base * 0.05, cx, cy, base * 1.4);
      cloud.addColorStop(0, 'rgba(29,47,85,0.29)');
      cloud.addColorStop(0.36, 'rgba(13,39,81,0.15)');
      cloud.addColorStop(0.66, 'rgba(16,45,91,' + (0.07 + 0.08 * bass).toFixed(3) + ')');
      cloud.addColorStop(1, 'rgba(9,25,56,0)');
      ctx.fillStyle = cloud;
      ctx.beginPath();
      ctx.arc(cx, cy, base * 1.4, 0, Math.PI * 2);
      ctx.fill();

      // Transparent threads with continuously varying curvature make the orb
      // resemble swirling smoke instead of a rigid audio frequency diagram.
      for (let k = 0; k < 22; k++) {
        const phase = k * 2.39996323;
        const u = t * (0.09 + (k % 5) * 0.016) + phase;
        const rr = base * (0.28 + 0.54 * ((k * 13 % 23) / 23)) * swell;
        const x = cx + rr * Math.cos(u);
        const y = cy + rr * Math.sin(u) * 0.82;
        const curl = base * (0.25 + (k % 3) * 0.075);
        ctx.strokeStyle = k % 4 === 0
          ? 'rgba(183,210,234,' + (0.043 + beat * 0.018).toFixed(3) + ')'
          : 'rgba(61,126,203,' + (0.049 + energy * 0.035).toFixed(3) + ')';
        ctx.lineWidth = k % 5 === 0 ? 1.05 : 0.72;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(
          x + curl * Math.cos(u + 1.2),
          y + curl * Math.sin(u + 1.2),
          cx + rr * Math.cos(u + 2.8) * 0.5,
          cy + rr * Math.sin(u + 2.8) * 0.62,
          cx + rr * Math.cos(u + 3.9) * 0.74,
          cy + rr * Math.sin(u + 3.9) * 0.64,
        );
        ctx.stroke();
      }

      // Depth-sorted cloud, gently twisting with multiple non-commensurate
      // rates. Size & opacity vary with depth and distance, not random flicker.
      for (const p of SPECKS) {
        const twist = t * 0.085 * p.speed * (p.depth > 0 ? 1 : -0.5);
        const angle = p.a + twist
          + Math.sin(p.seed + t * 0.17 + p.r * 3.5) * 0.16;
        const turbulence = 1
          + 0.105 * Math.sin(p.seed + t * 0.28 + p.depth * 3)
          + 0.055 * Math.sin(2 * angle + t * 0.13);
        const r = base * (0.13 + 0.94 * p.r) * turbulence * swell;
        const x = cx + Math.cos(angle) * r + p.depth * base * 0.15;
        const y = cy + Math.sin(angle) * r * (0.79 + 0.12 * Math.cos(p.seed + t * 0.10));
        const perspective = 0.75 + (p.depth + 1) * 0.25;
        const alpha = Math.min(0.75, (0.16 + 0.42 * p.r) * perspective * (0.82 + energy * 0.18 + beat * 0.18));
        const px = p.size * (1.1 + 0.7 * perspective);
        const sprite = sprites[p.tone]!;
        if (sprite.width && sprite.height) {
          ctx.globalAlpha = alpha;
          ctx.drawImage(sprite, x - px * 4, y - px * 4, px * 8, px * 8);
        }
      }
      ctx.globalAlpha = 1;

      // A few fine highlights create spatial depth without strobing.
      for (let k = 0; k < 28; k++) {
        const p = SPECKS[(k * 23 + 7) % SPECKS.length]!;
        const a = p.a + t * 0.11 * p.speed;
        const r = base * (0.27 + p.r * 0.7) * swell;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a) * 0.8;
        ctx.beginPath();
        ctx.arc(x, y, k % 7 === 0 ? 0.9 : 0.55, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(228,237,250,' + (0.17 + beat * 0.08).toFixed(3) + ')';
        ctx.fill();
      }
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const ratio = Math.min(window.devicePixelRatio || 1, 1.65);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      paint();
    };

    const frame = (stamp: number) => {
      if (!visible || document.hidden || !playing || reduce) return;
      // ~25 FPS on mobile: the cloud changes slowly, so 60 FPS is unnecessary.
      if (stamp - lastFrame >= 39) {
        paint();
        lastFrame = stamp;
      }
      raf = requestAnimationFrame(frame);
    };

    const requestNext = () => {
      cancelAnimationFrame(raf);
      if (playing && visible && !document.hidden && !reduce) {
        raf = requestAnimationFrame(frame);
      }
    };

    resize();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    const intersection = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(entries => {
        visible = entries[0]?.isIntersecting ?? true;
        if (visible) paint();
        requestNext();
      }, { threshold: 0.01 })
      : null;
    intersection?.observe(canvas);
    const visibility = () => {
      if (!document.hidden) paint();
      requestNext();
    };
    document.addEventListener('visibilitychange', visibility);
    requestNext();

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      intersection?.disconnect();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [playing, audioRef, beatTrack, seekVersion]);

  return (
    <div
      data-testid="music-equalizer"
      data-playing={playing ? 'true' : 'false'}
      data-renderer="organic-canvas"
      aria-hidden="true"
      className={'pointer-events-none relative mx-auto w-full overflow-hidden ' +
        (compact ? 'max-w-[268px]' : 'max-w-[318px] sm:max-w-[348px]')}
    >
      <div data-testid="music-smoke-orb" className="relative aspect-square w-full">
        <canvas
          data-testid="music-particle-canvas"
          ref={canvasRef}
          className="absolute inset-0 block h-full w-full"
        />
      </div>
    </div>
  );
}
