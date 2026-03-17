'use client';

import { memo } from 'react';

interface CinematicEnvironmentProps {
  intensity?: 'subtle' | 'full';
  showGeometry?: boolean;
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
      {/* ═══ LAYER 1: Deep Base Space (OPAQUE — replaces body bg) ═══ */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 130% 80% at 50% -10%, #0c1a2e 0%, transparent 65%),
            radial-gradient(ellipse 100% 70% at 50% 110%, #081428 0%, transparent 55%),
            radial-gradient(ellipse 80% 80% at 15% 50%, #0a1225 0%, transparent 50%),
            radial-gradient(ellipse 80% 80% at 85% 50%, #0b1428 0%, transparent 50%),
            linear-gradient(180deg, #060c1a 0%, #0a1020 30%, #080e1c 70%, #050a14 100%)
          `,
        }}
      />

      {/* Noise texture for depth */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '256px 256px',
        }}
      />

      {/* ═══ LAYER 2: Geometric Grid ═══ */}
      {showGeometry && (
        <div className="absolute inset-0" style={{ opacity: isFull ? 1 : 0.5 }}>
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 1200 800"
            preserveAspectRatio="xMidYMid slice"
            fill="none"
          >
            <defs>
              <linearGradient id="cg1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.05" />
              </linearGradient>
              <linearGradient id="cg2" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.03" />
              </linearGradient>
              <radialGradient id="cgFade" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="white" stopOpacity="1" />
                <stop offset="50%" stopColor="white" stopOpacity="0.75" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </radialGradient>
              <mask id="cgMask">
                <rect width="1200" height="800" fill="url(#cgFade)" />
              </mask>
            </defs>

            <g mask="url(#cgMask)">
              {/* Outer cube frame */}
              <rect x="200" y="140" width="800" height="520" rx="8" stroke="url(#cg1)" strokeWidth="1" opacity="0.6" />
              {/* Inner cube frame */}
              <rect x="340" y="220" width="520" height="360" rx="6" stroke="url(#cg2)" strokeWidth="1" opacity="0.5" />
              {/* Innermost frame */}
              <rect x="440" y="280" width="320" height="240" rx="4" stroke="url(#cg1)" strokeWidth="0.8" opacity="0.4" />

              {/* Perspective lines connecting cube layers */}
              <line x1="200" y1="140" x2="340" y2="220" stroke="#22d3ee" strokeWidth="0.8" opacity="0.15" />
              <line x1="1000" y1="140" x2="860" y2="220" stroke="#22d3ee" strokeWidth="0.8" opacity="0.15" />
              <line x1="200" y1="660" x2="340" y2="580" stroke="#06b6d4" strokeWidth="0.8" opacity="0.12" />
              <line x1="1000" y1="660" x2="860" y2="580" stroke="#06b6d4" strokeWidth="0.8" opacity="0.12" />

              {/* Inner perspective lines */}
              <line x1="340" y1="220" x2="440" y2="280" stroke="#22d3ee" strokeWidth="0.6" opacity="0.1" />
              <line x1="860" y1="220" x2="760" y2="280" stroke="#22d3ee" strokeWidth="0.6" opacity="0.1" />
              <line x1="340" y1="580" x2="440" y2="520" stroke="#06b6d4" strokeWidth="0.6" opacity="0.08" />
              <line x1="860" y1="580" x2="760" y2="520" stroke="#06b6d4" strokeWidth="0.6" opacity="0.08" />

              {/* Horizontal structural lines */}
              <line x1="100" y1="400" x2="1100" y2="400" stroke="#22d3ee" strokeWidth="0.5" opacity="0.08" strokeDasharray="8 16" />
              <line x1="150" y1="300" x2="1050" y2="300" stroke="#06b6d4" strokeWidth="0.5" opacity="0.06" strokeDasharray="4 20" />
              <line x1="150" y1="500" x2="1050" y2="500" stroke="#06b6d4" strokeWidth="0.5" opacity="0.06" strokeDasharray="4 20" />

              {/* Vertical structural lines */}
              <line x1="600" y1="60" x2="600" y2="740" stroke="#22d3ee" strokeWidth="0.5" opacity="0.06" strokeDasharray="6 18" />
              <line x1="400" y1="100" x2="400" y2="700" stroke="#06b6d4" strokeWidth="0.5" opacity="0.05" strokeDasharray="4 22" />
              <line x1="800" y1="100" x2="800" y2="700" stroke="#06b6d4" strokeWidth="0.5" opacity="0.05" strokeDasharray="4 22" />

              {/* Corner accent marks — clearly visible */}
              <path d="M200 160 L200 140 L220 140" stroke="#22d3ee" strokeWidth="1.5" opacity="0.35" />
              <path d="M980 140 L1000 140 L1000 160" stroke="#22d3ee" strokeWidth="1.5" opacity="0.35" />
              <path d="M200 640 L200 660 L220 660" stroke="#06b6d4" strokeWidth="1.5" opacity="0.3" />
              <path d="M980 660 L1000 660 L1000 640" stroke="#06b6d4" strokeWidth="1.5" opacity="0.3" />
            </g>
          </svg>
        </div>
      )}

      {/* ═══ LAYER 3: Atmospheric Horizon Glow ═══ */}
      <div
        className="absolute inset-0"
        style={{
          background: isFull
            ? `
              radial-gradient(ellipse 140% 45% at 50% 100%, rgba(34,211,238,0.18) 0%, transparent 55%),
              radial-gradient(ellipse 90% 35% at 50% 0%, rgba(34,211,238,0.12) 0%, transparent 50%),
              radial-gradient(ellipse 60% 50% at 8% 85%, rgba(6,182,212,0.10) 0%, transparent 40%),
              radial-gradient(ellipse 60% 50% at 92% 85%, rgba(8,145,178,0.10) 0%, transparent 40%)
            `
            : `
              radial-gradient(ellipse 120% 35% at 50% 100%, rgba(34,211,238,0.10) 0%, transparent 55%),
              radial-gradient(ellipse 60% 25% at 50% 0%, rgba(34,211,238,0.06) 0%, transparent 45%)
            `,
        }}
      />

      {/* ═══ LAYER 4: Ambient Particles ═══ */}
      {showParticles && (
        <div className="absolute inset-0" style={{ opacity: isFull ? 1 : 0.5 }}>
          <div className="cinematic-particle" style={{ left: '12%', top: '18%', animationDelay: '0s', animationDuration: '16s' }} />
          <div className="cinematic-particle" style={{ left: '72%', top: '12%', animationDelay: '3s', animationDuration: '20s' }} />
          <div className="cinematic-particle" style={{ left: '42%', top: '68%', animationDelay: '7s', animationDuration: '18s' }} />
          <div className="cinematic-particle" style={{ left: '88%', top: '52%', animationDelay: '11s', animationDuration: '22s' }} />
          <div className="cinematic-particle" style={{ left: '22%', top: '78%', animationDelay: '5s', animationDuration: '17s' }} />
          <div className="cinematic-particle" style={{ left: '58%', top: '32%', animationDelay: '9s', animationDuration: '19s' }} />
          <div className="cinematic-particle" style={{ left: '35%', top: '45%', animationDelay: '2s', animationDuration: '21s' }} />
          <div className="cinematic-particle" style={{ left: '92%', top: '28%', animationDelay: '14s', animationDuration: '23s' }} />
        </div>
      )}
    </div>
  );
});
