'use client';

/**
 * CinematicEnvironment — Platform-wide immersive AI background system.
 *
 * Renders 4 layers:
 *  L1 — Deep base space (dark atmospheric gradients + noise)
 *  L2 — 4D geometric dimension (perspective cube frames via SVG)
 *  L3 — Atmospheric horizon (distant depth glow)
 *  L4 — Ambient particles (very sparse, slow, distant)
 *
 * Usage: Place once inside AppShell or wrap around page content.
 * Designed to be extremely lightweight — pure CSS + inline SVG.
 */

import { memo } from 'react';

interface CinematicEnvironmentProps {
  /** Intensity: 'subtle' for chat/service pages, 'full' for landing/hero */
  intensity?: 'subtle' | 'full';
  /** Show geometric grid overlay */
  showGeometry?: boolean;
  /** Show particle layer */
  showParticles?: boolean;
}

export const CinematicEnvironment = memo(function CinematicEnvironment({
  intensity = 'full',
  showGeometry = true,
  showParticles = true,
}: CinematicEnvironmentProps) {
  const isFull = intensity === 'full';

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }}>
      {/* ═══ LAYER 1: Deep Base Space ═══ */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 120% 80% at 50% -20%, rgba(8,20,40,0.9) 0%, transparent 70%),
            radial-gradient(ellipse 100% 60% at 50% 120%, rgba(6,15,35,0.6) 0%, transparent 60%),
            radial-gradient(ellipse 80% 80% at 20% 50%, rgba(4,12,28,0.3) 0%, transparent 50%),
            radial-gradient(ellipse 80% 80% at 80% 50%, rgba(6,14,32,0.3) 0%, transparent 50%),
            linear-gradient(180deg, #050810 0%, #0a0e18 30%, #080c14 70%, #040810 100%)
          `,
        }}
      />

      {/* Noise texture for depth */}
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '256px 256px',
        }}
      />

      {/* ═══ LAYER 2: 4D Geometric Dimension ═══ */}
      {showGeometry && (
        <div className="absolute inset-0" style={{ opacity: isFull ? 0.4 : 0.2 }}>
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 1200 800"
            preserveAspectRatio="xMidYMid slice"
            fill="none"
          >
            <defs>
              <linearGradient id="cg1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(34,211,238,0.15)" />
                <stop offset="100%" stopColor="rgba(34,211,238,0.02)" />
              </linearGradient>
              <linearGradient id="cg2" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgba(6,182,212,0.1)" />
                <stop offset="100%" stopColor="rgba(6,182,212,0.01)" />
              </linearGradient>
              <radialGradient id="cgFade" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="white" stopOpacity="1" />
                <stop offset="60%" stopColor="white" stopOpacity="0.6" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </radialGradient>
              <mask id="cgMask">
                <rect width="1200" height="800" fill="url(#cgFade)" />
              </mask>
            </defs>

            <g mask="url(#cgMask)">
              {/* Outer cube frame */}
              <rect x="200" y="140" width="800" height="520" rx="8" stroke="url(#cg1)" strokeWidth="0.5" opacity="0.4" />
              {/* Inner cube frame */}
              <rect x="340" y="220" width="520" height="360" rx="6" stroke="url(#cg2)" strokeWidth="0.5" opacity="0.35" />
              {/* Innermost frame */}
              <rect x="440" y="280" width="320" height="240" rx="4" stroke="url(#cg1)" strokeWidth="0.4" opacity="0.25" />

              {/* Perspective lines connecting the cube layers */}
              <line x1="200" y1="140" x2="340" y2="220" stroke="rgba(34,211,238,0.06)" strokeWidth="0.5" />
              <line x1="1000" y1="140" x2="860" y2="220" stroke="rgba(34,211,238,0.06)" strokeWidth="0.5" />
              <line x1="200" y1="660" x2="340" y2="580" stroke="rgba(6,182,212,0.05)" strokeWidth="0.5" />
              <line x1="1000" y1="660" x2="860" y2="580" stroke="rgba(6,182,212,0.05)" strokeWidth="0.5" />

              {/* Inner perspective lines */}
              <line x1="340" y1="220" x2="440" y2="280" stroke="rgba(34,211,238,0.04)" strokeWidth="0.4" />
              <line x1="860" y1="220" x2="760" y2="280" stroke="rgba(34,211,238,0.04)" strokeWidth="0.4" />
              <line x1="340" y1="580" x2="440" y2="520" stroke="rgba(6,182,212,0.03)" strokeWidth="0.4" />
              <line x1="860" y1="580" x2="760" y2="520" stroke="rgba(6,182,212,0.03)" strokeWidth="0.4" />

              {/* Horizontal structural planes */}
              <line x1="100" y1="400" x2="1100" y2="400" stroke="rgba(34,211,238,0.03)" strokeWidth="0.3" strokeDasharray="8 16" />
              <line x1="150" y1="300" x2="1050" y2="300" stroke="rgba(6,182,212,0.025)" strokeWidth="0.3" strokeDasharray="4 20" />
              <line x1="150" y1="500" x2="1050" y2="500" stroke="rgba(6,182,212,0.025)" strokeWidth="0.3" strokeDasharray="4 20" />

              {/* Vertical structural planes */}
              <line x1="600" y1="60" x2="600" y2="740" stroke="rgba(34,211,238,0.02)" strokeWidth="0.3" strokeDasharray="6 18" />
              <line x1="400" y1="100" x2="400" y2="700" stroke="rgba(6,182,212,0.015)" strokeWidth="0.3" strokeDasharray="4 22" />
              <line x1="800" y1="100" x2="800" y2="700" stroke="rgba(6,182,212,0.015)" strokeWidth="0.3" strokeDasharray="4 22" />

              {/* Corner accent marks */}
              <path d="M200 160 L200 140 L220 140" stroke="rgba(34,211,238,0.12)" strokeWidth="0.8" />
              <path d="M980 140 L1000 140 L1000 160" stroke="rgba(34,211,238,0.12)" strokeWidth="0.8" />
              <path d="M200 640 L200 660 L220 660" stroke="rgba(6,182,212,0.10)" strokeWidth="0.8" />
              <path d="M980 660 L1000 660 L1000 640" stroke="rgba(6,182,212,0.10)" strokeWidth="0.8" />
            </g>
          </svg>
        </div>
      )}

      {/* ═══ LAYER 3: Atmospheric Horizon ═══ */}
      <div
        className="absolute inset-0"
        style={{
          background: isFull
            ? `
              radial-gradient(ellipse 140% 40% at 50% 100%, rgba(34,211,238,0.06) 0%, transparent 60%),
              radial-gradient(ellipse 80% 30% at 50% 0%, rgba(34,211,238,0.04) 0%, transparent 50%),
              radial-gradient(ellipse 60% 50% at 10% 90%, rgba(6,182,212,0.03) 0%, transparent 40%),
              radial-gradient(ellipse 60% 50% at 90% 90%, rgba(8,145,178,0.03) 0%, transparent 40%)
            `
            : `
              radial-gradient(ellipse 120% 35% at 50% 100%, rgba(34,211,238,0.035) 0%, transparent 55%),
              radial-gradient(ellipse 60% 25% at 50% 0%, rgba(34,211,238,0.02) 0%, transparent 45%)
            `,
        }}
      />

      {/* ═══ LAYER 4: Sparse Ambient Particles (CSS-only) ═══ */}
      {showParticles && (
        <div className="absolute inset-0 cinematic-particles" style={{ opacity: isFull ? 0.6 : 0.35 }}>
          <div className="cinematic-particle" style={{ left: '15%', top: '20%', animationDelay: '0s', animationDuration: '18s' }} />
          <div className="cinematic-particle" style={{ left: '75%', top: '15%', animationDelay: '4s', animationDuration: '22s' }} />
          <div className="cinematic-particle" style={{ left: '45%', top: '70%', animationDelay: '8s', animationDuration: '20s' }} />
          <div className="cinematic-particle" style={{ left: '85%', top: '55%', animationDelay: '12s', animationDuration: '24s' }} />
          <div className="cinematic-particle" style={{ left: '25%', top: '80%', animationDelay: '6s', animationDuration: '19s' }} />
          <div className="cinematic-particle" style={{ left: '60%', top: '35%', animationDelay: '10s', animationDuration: '21s' }} />
        </div>
      )}
    </div>
  );
});
