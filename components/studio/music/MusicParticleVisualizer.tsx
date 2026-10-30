'use client';

/**
 * MYAVATAR fluid-silk visualizer.
 *
 * Three real PCM band envelopes modulate a softly illuminated liquid membrane:
 * low = volume/depth, mid = membrane turbulence, high = fine shimmer.
 * Beat peaks add a restrained expansion, never a fake timed pulse. The audio
 * element stays native and untouched (especially important for signed iOS URLs).
 *
 * A slow NON-beat ambient drift is decorative even before playback; when the
 * storage origin disallows PCM decoding it continues without claiming beat sync.
 * No MP4, WebAudio routing, WebGL dependency or equalizer bars.
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

type Particle = { a: number; radius: number; depth: number; size: number; seed: number; tone: number };
const TAU = Math.PI * 2;

function rng(seed: number) {
  let state = seed >>> 0;
  return () => ((state = (1664525 * state + 1013904223) >>> 0) / 4294967296);
}

const random = rng(0x3fa67321);
const PARTICLES: Particle[] = Array.from({ length: 170 }, () => ({
  a: random() * TAU,
  radius: Math.sqrt(random()),
  depth: random() * 2 - 1,
  size: 0.4 + random() * 1.1,
  seed: random() * TAU,
  tone: Math.floor(random() * 3),
}));

function smooth(from: number, target: number, delta: number) {
  // Fast attack, calm release. Frame-rate independent and bounded for tab resume.
  const speed = target > from ? 15 : 5.8;
  return from + (target - from) * (1 - Math.exp(-speed * Math.min(delta, 0.10)));
}

export function MusicParticleVisualizer({
  playing, compact = false, audioRef, beatTrack = null, seekVersion = 0,
}: MusicParticleVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const reactive = !!beatTrack?.frames.length;
    let width = 1;
    let height = 1;
    let visible = true;
    let raf = 0;
    let lastTick = 0;
    let lastPaint = 0;
    let drift = 0;
    const level = { bass: 0, mid: 0, high: 0, beat: 0, energy: 0 };

    function draw() {
      if (!ctx) return;
      const audioTime = audioRef?.current?.currentTime ?? 0;
      const t = audioTime * 0.38 + drift * 0.18;
      const cx = width * 0.5;
      const cy = height * 0.49;
      const size = Math.min(width, height);
      const r = size * 0.317;
      const inhale = 1 + 0.060 * level.bass + 0.072 * level.beat;
      const turbulence = 0.018 + 0.043 * level.mid;
      const high = level.high;
      ctx.clearRect(0, 0, width, height);

      // A near-invisible atmospheric halo instead of an opaque circular badge.
      const haze = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 1.55);
      haze.addColorStop(0, 'rgba(57,71,130,' + (0.12 + level.bass * 0.08).toFixed(3) + ')');
      haze.addColorStop(0.45, 'rgba(34,65,118,0.075)');
      haze.addColorStop(1, 'rgba(15,30,60,0)');
      ctx.fillStyle = haze;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.55, 0, TAU);
      ctx.fill();

      // Three offset translucent membranes form a silky, iridescent body.
      // Each contour is continuously curved through many close samples, not bars.
      for (let layer = 2; layer >= 0; layer--) {
        const phase = t * (0.28 + layer * 0.08) + layer * 2.15;
        const radius = r * (1.02 - layer * 0.115) * inhale;
        ctx.beginPath();
        for (let i = 0; i <= 96; i++) {
          const a = i / 96 * TAU;
          const wave =
            Math.sin(a * 3 + phase) * (0.048 + turbulence) +
            Math.sin(a * 5 - phase * 0.66 + layer * 1.5) * (0.026 + level.mid * 0.025) +
            Math.cos(a * 2 + phase * 0.45) * 0.028;
          const rr = radius * (1 + wave);
          const x = cx + Math.cos(a + phase * 0.02) * rr;
          const y = cy + Math.sin(a) * rr * (0.89 + layer * 0.025);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        const light = ctx.createRadialGradient(
          cx - radius * 0.32, cy - radius * 0.41, radius * 0.04,
          cx + radius * 0.10, cy + radius * 0.10, radius * 1.35,
        );
        if (layer === 2) {
          light.addColorStop(0, 'rgba(159,153,218,0.29)');
          light.addColorStop(0.43, 'rgba(61,77,156,0.23)');
          light.addColorStop(1, 'rgba(36,45,91,0.015)');
        } else if (layer === 1) {
          light.addColorStop(0, 'rgba(185,208,241,0.28)');
          light.addColorStop(0.48, 'rgba(75,119,179,0.17)');
          light.addColorStop(1, 'rgba(35,63,104,0.025)');
        } else {
          light.addColorStop(0, 'rgba(218,226,241,0.22)');
          light.addColorStop(0.43, 'rgba(132,151,217,0.14)');
          light.addColorStop(1, 'rgba(46,69,133,0.025)');
        }
        ctx.fillStyle = light;
        ctx.fill();
      }

      // Floating silk ribbons: partial orbital paths with tapering opacity.
      // Highlights follow real mids/highs but never jitter or strobe.
      for (let ribbon = 0; ribbon < 7; ribbon++) {
        const phase = t * (0.26 + ribbon * 0.017) + ribbon * 1.91;
        const opacity = 0.055 + (ribbon % 3) * 0.027 + level.mid * 0.055;
        const gradient = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
        gradient.addColorStop(0, 'rgba(167,156,228,0)');
        gradient.addColorStop(0.32, 'rgba(178,167,232,' + opacity.toFixed(3) + ')');
        gradient.addColorStop(0.64, 'rgba(188,218,243,' + Math.min(0.25, opacity * 1.3).toFixed(3) + ')');
        gradient.addColorStop(1, 'rgba(99,142,220,0)');
        ctx.beginPath();
        for (let i = 0; i <= 100; i++) {
          const a = (i / 100 * 1.67 + ribbon * 0.31) * Math.PI;
          const flow = Math.sin(a * 3.5 + phase) * (0.055 + level.mid * 0.055);
          const rr = r * (0.58 + ribbon * 0.063 + flow) * inhale;
          const x = cx + Math.cos(a + phase * 0.16) * rr;
          const y = cy + Math.sin(a + phase * 0.10) * rr * (0.68 + ribbon * 0.038);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = gradient;
        ctx.lineWidth = ribbon % 3 === 0 ? 1.65 : 0.9;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Two understated energy contours, subtly lifted by actual bass/onsets.
      for (let band = 0; band < 2; band++) {
        const outline = ctx.createLinearGradient(cx - r, cy + r, cx + r, cy - r);
        outline.addColorStop(0, 'rgba(141,129,214,0)');
        outline.addColorStop(0.36, 'rgba(146,171,228,' + (0.10 + level.beat * 0.11).toFixed(3) + ')');
        outline.addColorStop(0.7, 'rgba(220,232,248,' + (0.11 + level.bass * 0.08).toFixed(3) + ')');
        outline.addColorStop(1, 'rgba(88,113,190,0)');
        ctx.strokeStyle = outline;
        ctx.lineWidth = band === 0 ? 1.4 : 0.75;
        ctx.beginPath();
        for (let i = 0; i <= 120; i++) {
          const a = i / 120 * TAU;
          const ripple = Math.sin(a * 4 - t * 0.57 + band * 2.3) * (0.016 + level.mid * 0.025);
          const rr = r * (0.96 + band * 0.17 + ripple) * inhale;
          const x = cx + Math.cos(a) * rr;
          const y = cy + Math.sin(a) * rr * 0.89;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }

      // Delicate floating dust, brighter only when the actual upper band rises.
      for (const p of PARTICLES) {
        const a = p.a + t * (0.022 + p.depth * 0.012);
        const radius = r * (0.24 + p.radius * 1.10) * inhale;
        const x = cx + Math.cos(a) * radius + Math.sin(t * 0.32 + p.seed) * r * 0.025;
        const y = cy + Math.sin(a) * radius * 0.84 + Math.cos(t * 0.18 + p.seed) * r * 0.02;
        const alpha = Math.min(0.42, (0.07 + p.radius * 0.13) * (0.65 + (p.depth + 1) * 0.22) + high * 0.09);
        ctx.fillStyle = p.tone === 0
          ? 'rgba(177,170,227,' + alpha.toFixed(3) + ')'
          : p.tone === 1
            ? 'rgba(191,216,239,' + alpha.toFixed(3) + ')'
            : 'rgba(236,238,248,' + alpha.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(x, y, p.size * (0.8 + p.depth * 0.19), 0, TAU);
        ctx.fill();
      }

      // A small restrained bloom centered behind Play/Pause.
      const pearl = ctx.createRadialGradient(cx - r * 0.04, cy - r * 0.12, 0, cx, cy, r * 0.54);
      pearl.addColorStop(0, 'rgba(194,212,252,' + (0.13 + level.energy * 0.08).toFixed(3) + ')');
      pearl.addColorStop(1, 'rgba(120,141,211,0)');
      ctx.fillStyle = pearl;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.54, 0, TAU);
      ctx.fill();
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function frame(timestamp: number) {
      if (!visible || document.hidden || reducedMotion) return;
      const delta = lastTick ? Math.min(0.10, (timestamp - lastTick) / 1000) : 0.033;
      lastTick = timestamp;
      drift += delta * (playing ? 1 : 0.23);
      const meter = reactive && playing
        ? beatAtTime(beatTrack, audioRef?.current?.currentTime ?? 0)
        : { bass: 0, mid: 0, high: 0, beat: 0, energy: 0 };
      level.bass = smooth(level.bass, meter.bass, delta);
      level.mid = smooth(level.mid, meter.mid, delta);
      level.high = smooth(level.high, meter.high, delta);
      level.beat = smooth(level.beat, meter.beat, delta);
      level.energy = smooth(level.energy, meter.energy, delta);
      // 28 FPS active, 10 FPS ambient: intentionally capped on mobile.
      if (timestamp - lastPaint >= (playing ? 35 : 100)) {
        draw();
        lastPaint = timestamp;
      }
      raf = requestAnimationFrame(frame);
    }

    function restart() {
      cancelAnimationFrame(raf);
      lastTick = 0; // avoid a large delta when returning to a backgrounded tab
      if (visible && !document.hidden && !reducedMotion) raf = requestAnimationFrame(frame);
    }

    // A seek while paused should still reveal the exact decoded-track moment
    // rather than a fabricated clock-based beat. Idle drift remains decorative.
    if (reactive) Object.assign(level, beatAtTime(beatTrack, audioRef?.current?.currentTime ?? 0));
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);
    const io = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(entries => {
        visible = entries[0]?.isIntersecting ?? true;
        if (visible) draw();
        restart();
      }, { threshold: 0.01 })
      : null;
    io?.observe(canvas);
    const onVisibility = () => { if (!document.hidden) draw(); restart(); };
    document.addEventListener('visibilitychange', onVisibility);
    restart();

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [playing, audioRef, beatTrack, seekVersion]);

  return (
    <div
      data-testid="music-equalizer"
      data-playing={playing ? 'true' : 'false'}
      data-renderer="fluid-silk-canvas"
      data-audio-reactive={beatTrack?.frames.length ? 'ready' : 'ambient-only'}
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
