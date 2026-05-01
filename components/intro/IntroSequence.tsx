'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Particle ─────────────────────────────────────────────────────────────────

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  angle: number;
  speed: number;
  opacity: number;
}

const PARTICLE_COLORS = [
  '#00d4ff', '#6366f1', '#22d3ee', '#818cf8',
  '#0ea5e9', '#a78bfa', '#38bdf8', '#c084fc',
  '#ffffff',
];

function generateParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: 50 + (Math.random() - 0.5) * 4,
    y: 50 + (Math.random() - 0.5) * 4,
    size: Math.random() * 4 + 1,
    color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)] ?? '#00d4ff',
    angle: Math.random() * 360,
    speed: 20 + Math.random() * 55,
    opacity: 0.4 + Math.random() * 0.6,
  }));
}

// ─── Logo letters ─────────────────────────────────────────────────────────────

const LOGO_CHARS = ['M', 'y', 'A', 'v', 'a', 't', 'a', 'r', '.', 'g', 'e'];
const TAGLINE = 'ხელოვნური ინტელექტი · შენი სამსახურში';

// ─── IntroSequence ─────────────────────────────────────────────────────────────

interface IntroSequenceProps {
  onComplete: () => void;
}

export default function IntroSequence({ onComplete }: IntroSequenceProps) {
  const [phase, setPhase] = useState<'particles' | 'logo' | 'tagline' | 'scanlines' | 'iris' | 'done'>('particles');
  const [particles] = useState(() => generateParticles(72));
  const [irisScale, setIrisScale] = useState(0);
  const _animFrameRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const irisRef = useRef<number>(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setPhase('logo'), 300));
    timers.push(setTimeout(() => setPhase('tagline'), 1800));
    timers.push(setTimeout(() => setPhase('scanlines'), 2800));
    timers.push(setTimeout(() => setPhase('iris'), 3600));
    timers.push(setTimeout(() => {
      setPhase('done');
      onComplete();
    }, 5200));

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  // Iris wipe animation via rAF
  useEffect(() => {
    if (phase !== 'iris') return;
    startRef.current = performance.now();
    const DURATION = 1600;

    const animate = (now: number) => {
      const t = Math.min((now - startRef.current) / DURATION, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setIrisScale(ease);
      if (t < 1) {
        irisRef.current = requestAnimationFrame(animate);
      }
    };
    irisRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(irisRef.current);
  }, [phase]);

  if (phase === 'done') return null;

  return (
    <motion.div
      className="fixed inset-0 z-[9999] overflow-hidden flex items-center justify-center select-none"
      style={{ background: '#00000f' }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* ── Radial glow ──────────────────────────────────────────────── */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === 'particles' ? 0 : 0.6 }}
        transition={{ duration: 1.2 }}
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(99,102,241,0.18) 0%, rgba(0,212,255,0.10) 40%, transparent 70%)',
        }}
      />

      {/* ── Particles ────────────────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {particles.map(p => {
          const rad = (p.angle * Math.PI) / 180;
          const dx = Math.cos(rad) * p.speed;
          const dy = Math.sin(rad) * p.speed;
          return (
            <motion.div
              key={p.id}
              className="absolute rounded-full"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
                boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
              }}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
              animate={{
                x: `${dx}vw`,
                y: `${dy}vh`,
                opacity: [0, p.opacity, p.opacity * 0.6, 0],
                scale: [0, 1.2, 1, 0],
              }}
              transition={{
                duration: 2.8 + Math.random() * 1.2,
                delay: Math.random() * 0.4,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
            />
          );
        })}
      </div>

      {/* ── Center content ───────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col items-center gap-5">
        {/* Logo letter-by-letter */}
        <div className="flex items-baseline gap-0 leading-none">
          {LOGO_CHARS.map((char, i) => {
            const isCapital = char === char.toUpperCase() && char !== '.';
            const isDot = char === '.';
            return (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
                animate={phase !== 'particles'
                  ? { opacity: 1, y: 0, filter: 'blur(0px)' }
                  : { opacity: 0, y: 18, filter: 'blur(8px)' }
                }
                transition={{
                  delay: 0.04 * i,
                  duration: 0.45,
                  ease: [0.34, 1.56, 0.64, 1],
                }}
                style={{
                  fontFamily: 'var(--font-syne, var(--font-ui), system-ui)',
                  fontSize: isDot ? 'clamp(28px, 6vw, 52px)' : 'clamp(36px, 8vw, 72px)',
                  fontWeight: isCapital ? 800 : 400,
                  letterSpacing: '-0.02em',
                  color: isCapital
                    ? '#00d4ff'
                    : isDot
                    ? 'rgba(255,255,255,0.4)'
                    : '#ffffff',
                  textShadow: isCapital
                    ? '0 0 24px rgba(0,212,255,0.6), 0 0 48px rgba(0,212,255,0.3)'
                    : 'none',
                  lineHeight: 1,
                }}
              >
                {char}
              </motion.span>
            );
          })}
        </div>

        {/* Georgian tagline */}
        <motion.p
          initial={{ opacity: 0, y: 10, letterSpacing: '0.3em' }}
          animate={['tagline', 'scanlines', 'iris'].includes(phase)
            ? { opacity: 0.7, y: 0, letterSpacing: '0.18em' }
            : { opacity: 0, y: 10, letterSpacing: '0.3em' }
          }
          transition={{ duration: 0.9, ease: 'easeOut' }}
          style={{
            fontFamily: "'Noto Sans Georgian', system-ui, sans-serif",
            fontSize: 'clamp(11px, 2vw, 14px)',
            color: 'rgba(255,255,255,0.65)',
            textTransform: 'uppercase',
          }}
        >
          {TAGLINE}
        </motion.p>

        {/* Cyan accent bar */}
        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={phase !== 'particles'
            ? { scaleX: 1, opacity: 1 }
            : { scaleX: 0, opacity: 0 }
          }
          transition={{ delay: 0.5, duration: 0.7, ease: [0.34, 1.56, 0.64, 1] }}
          style={{
            height: 2,
            width: 120,
            background: 'linear-gradient(90deg, transparent, #00d4ff, #6366f1, transparent)',
            borderRadius: 999,
          }}
        />
      </div>

      {/* ── Scan lines ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {['scanlines', 'iris'].includes(phase) && (
          <motion.div
            className="absolute inset-0 pointer-events-none z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 4px)',
              backgroundSize: '100% 4px',
            }}
          >
            {/* Moving scan beam */}
            <motion.div
              className="absolute left-0 right-0 h-8 pointer-events-none"
              style={{
                background: 'linear-gradient(180deg, transparent, rgba(0,212,255,0.07), transparent)',
              }}
              animate={{ top: ['-5%', '105%'] }}
              transition={{ duration: 1.2, ease: 'linear', repeat: 1 }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Iris wipe ────────────────────────────────────────────────── */}
      {phase === 'iris' && (
        <motion.div
          className="absolute inset-0 pointer-events-none z-30"
          style={{
            background: '#0a0a0f',
            WebkitMaskImage: `radial-gradient(circle at 50% 50%, transparent ${irisScale * 100}%, black ${irisScale * 100 + 0.5}%)`,
            maskImage: `radial-gradient(circle at 50% 50%, transparent ${irisScale * 100}%, black ${irisScale * 100 + 0.5}%)`,
          }}
        />
      )}

      {/* ── Corner decorations ───────────────────────────────────────── */}
      {(['logo', 'tagline', 'scanlines'] as const).map(p => p).includes(phase as 'logo' | 'tagline' | 'scanlines') && (
        <>
          {[
            { top: 12, left: 12, borderTop: '1px solid', borderLeft: '1px solid' },
            { top: 12, right: 12, borderTop: '1px solid', borderRight: '1px solid' },
            { bottom: 12, left: 12, borderBottom: '1px solid', borderLeft: '1px solid' },
            { bottom: 12, right: 12, borderBottom: '1px solid', borderRight: '1px solid' },
          ].map((style, i) => (
            <motion.div
              key={i}
              className="absolute pointer-events-none"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 0.35, scale: 1 }}
              transition={{ delay: 0.6 + i * 0.1 }}
              style={{
                ...style,
                width: 28,
                height: 28,
                borderColor: '#00d4ff',
              }}
            />
          ))}
        </>
      )}
    </motion.div>
  );
}
