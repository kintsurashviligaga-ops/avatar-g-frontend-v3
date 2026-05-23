'use client'

/**
 * PageEnvironment — Route-aware 4D geometric AI environment system.
 *
 * Each page in MyAvatar.ge feels like a different chamber of the same AI spaceship.
 * DISTINCT accent colors per mood — dramatically different visual identity per page.
 *
 * Color System:
 *   command    — Cyan (#22d3ee)    — Flagship, commanding
 *   intelligence — Electric Blue (#3b82f6) — AI depth
 *   identity   — Violet (#a78bfa)  — Creative personality
 *   cinema     — Amber (#f59e0b)   — Warm, cinematic
 *   gallery    — Rose (#22d3ee)    — Artistic, visual
 *   audio      — Emerald (#34d399) — Musical, organic
 *   knowledge  — Indigo (#818cf8)  — Cerebral, focused
 *   engine     — Orange (#fb923c)  — Energy, automation
 *   hub        — Cyan (#22d3ee)    — Unified entry
 *   vault      — Gold (#fbbf24)    — Secure, premium
 *   standard   — Cyan (#22d3ee)    — Neutral default
 */

import { memo, useMemo } from 'react'
import { usePathname } from 'next/navigation'

/* ══════════════════════════════════════════════
   MOOD SYSTEM
   ══════════════════════════════════════════════ */

export type EnvironmentMood =
  | 'command' | 'intelligence' | 'identity' | 'cinema' | 'gallery'
  | 'audio' | 'knowledge' | 'engine' | 'hub' | 'vault' | 'standard'

function detectMood(pathname: string | null): EnvironmentMood {
  if (!pathname) return 'standard'
  const p = pathname.replace(/^\/(en|ka|ru)/, '')
  if (p === '' || p === '/') return 'command'
  if (p === '/services' || p === '/services/') return 'hub'
  if (p.startsWith('/services/agent-g')) return 'intelligence'
  if (p.startsWith('/services/avatar')) return 'identity'
  if (p.startsWith('/services/video') || p.startsWith('/services/editing')) return 'cinema'
  if (p.startsWith('/services/image') || p.startsWith('/services/photo') || p.startsWith('/services/visual-intel')) return 'gallery'
  if (p.startsWith('/services/music')) return 'audio'
  if (p.startsWith('/services/text') || p.startsWith('/services/prompt')) return 'knowledge'
  if (p.startsWith('/services/workflow') || p.startsWith('/services/software')) return 'engine'
  if (p.startsWith('/auth') || p.startsWith('/login') || p.startsWith('/signup') || p.startsWith('/account')) return 'vault'
  return 'standard'
}

/* ══════════════════════════════════════════════
   MOOD CONFIGS — Distinct accent colors per mood
   ══════════════════════════════════════════════ */

interface MoodConfig {
  base: string
  glow: string
  geoOpacity: number
  geoHue: string
  geoHue2: string
  particleColor: string
  particleGlow: string
  particleOpacity: number
}

const MOODS: Record<EnvironmentMood, MoodConfig> = {
  /* ── Landing: Cyan flagship ── */
  command: {
    base: `
      radial-gradient(ellipse 140% 80% at 50% -15%, #0c1a2e 0%, transparent 60%),
      radial-gradient(ellipse 120% 60% at 50% 115%, #081a30 0%, transparent 50%),
      radial-gradient(ellipse 80% 80% at 10% 50%, #0a1225 0%, transparent 50%),
      radial-gradient(ellipse 80% 80% at 90% 50%, #0b1428 0%, transparent 50%),
      linear-gradient(180deg, #060c1a 0%, #0a1020 30%, #080e1c 70%, #050a14 100%)
    `,
    glow: `
      radial-gradient(ellipse 150% 50% at 50% 105%, rgba(34,211,238,0.25) 0%, transparent 55%),
      radial-gradient(ellipse 100% 40% at 50% -5%, rgba(34,211,238,0.18) 0%, transparent 50%),
      radial-gradient(ellipse 60% 50% at 5% 80%, rgba(6,182,212,0.15) 0%, transparent 40%),
      radial-gradient(ellipse 60% 50% at 95% 80%, rgba(8,145,178,0.15) 0%, transparent 40%)
    `,
    geoOpacity: 1,
    geoHue: '#22d3ee',
    geoHue2: '#06b6d4',
    particleColor: 'rgba(34, 211, 238, 0.8)',
    particleGlow: 'rgba(34, 211, 238, 0.5)',
    particleOpacity: 1,
  },

  /* ── Agent G: Electric Blue — AI depth ── */
  intelligence: {
    base: `
      radial-gradient(ellipse 100% 100% at 50% 50%, #060a1e 0%, transparent 70%),
      radial-gradient(ellipse 120% 60% at 50% 110%, #081030 0%, transparent 50%),
      radial-gradient(ellipse 60% 70% at 15% 40%, #0a1438 0%, transparent 45%),
      radial-gradient(ellipse 60% 70% at 85% 40%, #0a1438 0%, transparent 45%),
      linear-gradient(180deg, #040818 0%, #060d24 40%, #050a1e 80%, #030712 100%)
    `,
    glow: `
      radial-gradient(ellipse 100% 40% at 50% 100%, rgba(59,130,246,0.22) 0%, transparent 55%),
      radial-gradient(ellipse 60% 30% at 50% 0%, rgba(59,130,246,0.14) 0%, transparent 45%),
      radial-gradient(ellipse 40% 60% at 8% 50%, rgba(37,99,235,0.10) 0%, transparent 35%),
      radial-gradient(ellipse 40% 60% at 92% 50%, rgba(37,99,235,0.10) 0%, transparent 35%)
    `,
    geoOpacity: 0.8,
    geoHue: '#3b82f6',
    geoHue2: '#2563eb',
    particleColor: 'rgba(59, 130, 246, 0.8)',
    particleGlow: 'rgba(59, 130, 246, 0.5)',
    particleOpacity: 0.6,
  },

  /* ── Avatar: Violet — creative identity ── */
  identity: {
    base: `
      radial-gradient(ellipse 80% 90% at 50% 40%, #100a20 0%, transparent 65%),
      radial-gradient(ellipse 100% 50% at 50% 110%, #0e0820 0%, transparent 50%),
      radial-gradient(ellipse 50% 80% at 20% 50%, #12082e 0%, transparent 45%),
      radial-gradient(ellipse 50% 80% at 80% 50%, #12082e 0%, transparent 45%),
      linear-gradient(180deg, #08061a 0%, #0c0a1e 40%, #0a081c 80%, #060514 100%)
    `,
    glow: `
      radial-gradient(ellipse 70% 70% at 50% 35%, rgba(167,139,250,0.12) 0%, transparent 60%),
      radial-gradient(ellipse 120% 40% at 50% 100%, rgba(167,139,250,0.20) 0%, transparent 50%),
      radial-gradient(ellipse 40% 50% at 10% 40%, rgba(139,92,246,0.12) 0%, transparent 35%)
    `,
    geoOpacity: 0.7,
    geoHue: '#a78bfa',
    geoHue2: '#38bdf8',
    particleColor: 'rgba(167, 139, 250, 0.8)',
    particleGlow: 'rgba(167, 139, 250, 0.5)',
    particleOpacity: 0.7,
  },

  /* ── Video: Amber — cinematic warmth ── */
  cinema: {
    base: `
      radial-gradient(ellipse 130% 70% at 50% -10%, #1a140a 0%, transparent 60%),
      radial-gradient(ellipse 130% 70% at 50% 115%, #18120c 0%, transparent 55%),
      radial-gradient(ellipse 70% 90% at 10% 50%, #1a1008 0%, transparent 50%),
      radial-gradient(ellipse 70% 90% at 90% 50%, #1a1008 0%, transparent 50%),
      linear-gradient(180deg, #0a0806 0%, #120e08 35%, #0e0a06 65%, #080604 100%)
    `,
    glow: `
      radial-gradient(ellipse 140% 45% at 50% 100%, rgba(245,158,11,0.22) 0%, transparent 55%),
      radial-gradient(ellipse 100% 35% at 50% 0%, rgba(245,158,11,0.14) 0%, transparent 45%),
      radial-gradient(ellipse 50% 50% at 5% 85%, rgba(217,119,6,0.12) 0%, transparent 40%),
      radial-gradient(ellipse 50% 50% at 95% 85%, rgba(217,119,6,0.12) 0%, transparent 40%)
    `,
    geoOpacity: 0.9,
    geoHue: '#f59e0b',
    geoHue2: '#d97706',
    particleColor: 'rgba(245, 158, 11, 0.8)',
    particleGlow: 'rgba(245, 158, 11, 0.5)',
    particleOpacity: 0.8,
  },

  /* ── Image: Rose — artistic, visual ── */
  gallery: {
    base: `
      radial-gradient(ellipse 100% 80% at 50% 30%, #18081a 0%, transparent 65%),
      radial-gradient(ellipse 100% 50% at 50% 110%, #14061a 0%, transparent 50%),
      radial-gradient(ellipse 60% 60% at 15% 50%, #1a0a1c 0%, transparent 45%),
      radial-gradient(ellipse 60% 60% at 85% 50%, #1a0a1c 0%, transparent 45%),
      linear-gradient(180deg, #0a060c 0%, #0e0812 35%, #0c0710 65%, #08050a 100%)
    `,
    glow: `
      radial-gradient(ellipse 80% 60% at 50% 50%, rgba(244,114,182,0.10) 0%, transparent 65%),
      radial-gradient(ellipse 120% 35% at 50% 100%, rgba(244,114,182,0.20) 0%, transparent 50%),
      radial-gradient(ellipse 60% 30% at 50% 0%, rgba(236,72,153,0.12) 0%, transparent 40%)
    `,
    geoOpacity: 0.6,
    geoHue: '#22d3ee',
    geoHue2: '#06b6d4',
    particleColor: 'rgba(244, 114, 182, 0.8)',
    particleGlow: 'rgba(244, 114, 182, 0.5)',
    particleOpacity: 0.5,
  },

  /* ── Music: Emerald — organic, rhythmic ── */
  audio: {
    base: `
      radial-gradient(ellipse 120% 80% at 50% 60%, #081a10 0%, transparent 65%),
      radial-gradient(ellipse 100% 60% at 50% 110%, #0a1c14 0%, transparent 50%),
      radial-gradient(ellipse 80% 70% at 10% 60%, #0a1810 0%, transparent 50%),
      radial-gradient(ellipse 80% 70% at 90% 60%, #0a1810 0%, transparent 50%),
      linear-gradient(180deg, #040a06 0%, #06100a 40%, #050e08 70%, #040a06 100%)
    `,
    glow: `
      radial-gradient(ellipse 130% 50% at 50% 60%, rgba(52,211,153,0.14) 0%, transparent 60%),
      radial-gradient(ellipse 100% 30% at 50% 100%, rgba(52,211,153,0.22) 0%, transparent 55%),
      radial-gradient(ellipse 60% 40% at 15% 70%, rgba(16,185,129,0.10) 0%, transparent 40%),
      radial-gradient(ellipse 60% 40% at 85% 70%, rgba(16,185,129,0.10) 0%, transparent 40%)
    `,
    geoOpacity: 0.55,
    geoHue: '#34d399',
    geoHue2: '#10b981',
    particleColor: 'rgba(52, 211, 153, 0.8)',
    particleGlow: 'rgba(52, 211, 153, 0.5)',
    particleOpacity: 0.7,
  },

  /* ── Text: Indigo — cerebral, knowledge ── */
  knowledge: {
    base: `
      radial-gradient(ellipse 100% 80% at 50% 40%, #0a0c1e 0%, transparent 65%),
      radial-gradient(ellipse 80% 50% at 50% 110%, #0c0e24 0%, transparent 45%),
      linear-gradient(180deg, #06081a 0%, #0a0c1e 40%, #080a1c 70%, #050714 100%)
    `,
    glow: `
      radial-gradient(ellipse 80% 40% at 50% 100%, rgba(129,140,248,0.18) 0%, transparent 50%),
      radial-gradient(ellipse 60% 25% at 50% 0%, rgba(129,140,248,0.10) 0%, transparent 40%)
    `,
    geoOpacity: 0.45,
    geoHue: '#818cf8',
    geoHue2: '#6366f1',
    particleColor: 'rgba(129, 140, 248, 0.8)',
    particleGlow: 'rgba(129, 140, 248, 0.5)',
    particleOpacity: 0.4,
  },

  /* ── Workflow: Orange — energy, automation ── */
  engine: {
    base: `
      radial-gradient(ellipse 120% 70% at 50% 20%, #1a1208 0%, transparent 60%),
      radial-gradient(ellipse 110% 60% at 50% 110%, #18100a 0%, transparent 50%),
      radial-gradient(ellipse 70% 80% at 15% 50%, #1c1408 0%, transparent 50%),
      radial-gradient(ellipse 70% 80% at 85% 50%, #1c1408 0%, transparent 50%),
      linear-gradient(180deg, #0a0804 0%, #120e06 35%, #0e0a04 65%, #080604 100%)
    `,
    glow: `
      radial-gradient(ellipse 120% 45% at 50% 100%, rgba(251,146,60,0.22) 0%, transparent 55%),
      radial-gradient(ellipse 80% 35% at 50% 0%, rgba(251,146,60,0.14) 0%, transparent 45%),
      radial-gradient(ellipse 50% 40% at 10% 50%, rgba(234,88,12,0.10) 0%, transparent 35%),
      radial-gradient(ellipse 50% 40% at 90% 50%, rgba(234,88,12,0.10) 0%, transparent 35%)
    `,
    geoOpacity: 1,
    geoHue: '#fb923c',
    geoHue2: '#ea580c',
    particleColor: 'rgba(251, 146, 60, 0.8)',
    particleGlow: 'rgba(251, 146, 60, 0.5)',
    particleOpacity: 0.7,
  },

  /* ── Hub: Cyan services corridor ── */
  hub: {
    base: `
      radial-gradient(ellipse 130% 70% at 50% -10%, #0c1a2e 0%, transparent 55%),
      radial-gradient(ellipse 100% 60% at 50% 115%, #081428 0%, transparent 50%),
      radial-gradient(ellipse 80% 70% at 12% 50%, #0a1225 0%, transparent 45%),
      radial-gradient(ellipse 80% 70% at 88% 50%, #0b1428 0%, transparent 45%),
      linear-gradient(180deg, #060c1a 0%, #090f1e 35%, #080e1c 65%, #050a14 100%)
    `,
    glow: `
      radial-gradient(ellipse 130% 45% at 50% 100%, rgba(34,211,238,0.22) 0%, transparent 55%),
      radial-gradient(ellipse 80% 30% at 50% 0%, rgba(34,211,238,0.14) 0%, transparent 45%),
      radial-gradient(ellipse 50% 50% at 8% 80%, rgba(6,182,212,0.12) 0%, transparent 35%),
      radial-gradient(ellipse 50% 50% at 92% 80%, rgba(8,145,178,0.12) 0%, transparent 35%)
    `,
    geoOpacity: 0.85,
    geoHue: '#22d3ee',
    geoHue2: '#06b6d4',
    particleColor: 'rgba(34, 211, 238, 0.8)',
    particleGlow: 'rgba(34, 211, 238, 0.5)',
    particleOpacity: 0.9,
  },

  /* ── Vault: Gold — secure, premium ── */
  vault: {
    base: `
      radial-gradient(ellipse 80% 80% at 50% 50%, #14100a 0%, transparent 65%),
      radial-gradient(ellipse 100% 50% at 50% 110%, #120e08 0%, transparent 45%),
      linear-gradient(180deg, #0a0806 0%, #0e0c08 40%, #0c0a06 70%, #080604 100%)
    `,
    glow: `
      radial-gradient(ellipse 80% 40% at 50% 100%, rgba(251,191,36,0.18) 0%, transparent 50%),
      radial-gradient(ellipse 50% 25% at 50% 0%, rgba(251,191,36,0.10) 0%, transparent 40%)
    `,
    geoOpacity: 0.5,
    geoHue: '#fbbf24',
    geoHue2: '#f59e0b',
    particleColor: 'rgba(251, 191, 36, 0.8)',
    particleGlow: 'rgba(251, 191, 36, 0.5)',
    particleOpacity: 0.4,
  },

  /* ── Standard: Cyan default ── */
  standard: {
    base: `
      radial-gradient(ellipse 120% 70% at 50% -10%, #0c1a2e 0%, transparent 60%),
      radial-gradient(ellipse 100% 60% at 50% 110%, #081428 0%, transparent 50%),
      radial-gradient(ellipse 70% 70% at 15% 50%, #0a1225 0%, transparent 45%),
      radial-gradient(ellipse 70% 70% at 85% 50%, #0b1428 0%, transparent 45%),
      linear-gradient(180deg, #060c1a 0%, #090f1e 35%, #080e1c 65%, #050a14 100%)
    `,
    glow: `
      radial-gradient(ellipse 120% 40% at 50% 100%, rgba(34,211,238,0.16) 0%, transparent 55%),
      radial-gradient(ellipse 70% 30% at 50% 0%, rgba(34,211,238,0.10) 0%, transparent 45%)
    `,
    geoOpacity: 0.6,
    geoHue: '#22d3ee',
    geoHue2: '#06b6d4',
    particleColor: 'rgba(34, 211, 238, 0.8)',
    particleGlow: 'rgba(34, 211, 238, 0.5)',
    particleOpacity: 0.6,
  },
}

/* ══════════════════════════════════════════════
   GEOMETRY SVG — Mood-tinted structural frames
   ══════════════════════════════════════════════ */

function GeometryGrid({ mood, config }: { mood: EnvironmentMood; config: MoodConfig }) {
  const h1 = config.geoHue
  const h2 = config.geoHue2

  const showHorizon = mood === 'command' || mood === 'cinema' || mood === 'hub'
  const showPortal = mood === 'intelligence' || mood === 'identity'
  const showNetwork = mood === 'engine'
  const showWave = mood === 'audio'

  return (
    <div className="absolute inset-0" style={{ opacity: config.geoOpacity }}>
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <defs>
          <linearGradient id="pg1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={h1} stopOpacity="0.35" />
            <stop offset="100%" stopColor={h1} stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="pg2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={h2} stopOpacity="0.28" />
            <stop offset="100%" stopColor={h2} stopOpacity="0.04" />
          </linearGradient>
          <radialGradient id="pgFade" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="55%" stopColor="white" stopOpacity="0.7" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="pgMask">
            <rect width="1200" height="800" fill="url(#pgFade)" />
          </mask>
        </defs>

        <g mask="url(#pgMask)">
          {/* Core structural frames */}
          <rect x="200" y="140" width="800" height="520" rx="8" stroke="url(#pg1)" strokeWidth="1.2" opacity="0.6" />
          <rect x="340" y="220" width="520" height="360" rx="6" stroke="url(#pg2)" strokeWidth="1" opacity="0.5" />
          <rect x="440" y="280" width="320" height="240" rx="4" stroke="url(#pg1)" strokeWidth="0.8" opacity="0.35" />

          {/* Perspective lines */}
          <line x1="200" y1="140" x2="340" y2="220" stroke={h1} strokeWidth="0.8" opacity="0.15" />
          <line x1="1000" y1="140" x2="860" y2="220" stroke={h1} strokeWidth="0.8" opacity="0.15" />
          <line x1="200" y1="660" x2="340" y2="580" stroke={h2} strokeWidth="0.8" opacity="0.12" />
          <line x1="1000" y1="660" x2="860" y2="580" stroke={h2} strokeWidth="0.8" opacity="0.12" />
          <line x1="340" y1="220" x2="440" y2="280" stroke={h1} strokeWidth="0.6" opacity="0.10" />
          <line x1="860" y1="220" x2="760" y2="280" stroke={h1} strokeWidth="0.6" opacity="0.10" />
          <line x1="340" y1="580" x2="440" y2="520" stroke={h2} strokeWidth="0.6" opacity="0.08" />
          <line x1="860" y1="580" x2="760" y2="520" stroke={h2} strokeWidth="0.6" opacity="0.08" />

          {/* Guide lines */}
          <line x1="100" y1="400" x2="1100" y2="400" stroke={h1} strokeWidth="0.5" opacity="0.07" strokeDasharray="8 16" />
          <line x1="600" y1="60" x2="600" y2="740" stroke={h1} strokeWidth="0.5" opacity="0.06" strokeDasharray="6 18" />

          {/* Corner accents */}
          <path d="M200 160 L200 140 L220 140" stroke={h1} strokeWidth="1.8" opacity="0.35" />
          <path d="M980 140 L1000 140 L1000 160" stroke={h1} strokeWidth="1.8" opacity="0.35" />
          <path d="M200 640 L200 660 L220 660" stroke={h2} strokeWidth="1.8" opacity="0.30" />
          <path d="M980 660 L1000 660 L1000 640" stroke={h2} strokeWidth="1.8" opacity="0.30" />

          {/* ── Mood-specific geometry ── */}

          {showHorizon && (
            <>
              <line x1="0" y1="400" x2="1200" y2="400" stroke={h1} strokeWidth="0.5" opacity="0.10" strokeDasharray="12 20" />
              <line x1="150" y1="300" x2="1050" y2="300" stroke={h2} strokeWidth="0.5" opacity="0.07" strokeDasharray="4 22" />
              <line x1="150" y1="500" x2="1050" y2="500" stroke={h2} strokeWidth="0.5" opacity="0.07" strokeDasharray="4 22" />
              <line x1="400" y1="100" x2="400" y2="700" stroke={h2} strokeWidth="0.4" opacity="0.05" strokeDasharray="4 24" />
              <line x1="800" y1="100" x2="800" y2="700" stroke={h2} strokeWidth="0.4" opacity="0.05" strokeDasharray="4 24" />
            </>
          )}

          {showPortal && (
            <>
              <rect x="480" y="310" width="240" height="180" rx="3" stroke={h1} strokeWidth="0.7" opacity="0.22" />
              <rect x="520" y="340" width="160" height="120" rx="2" stroke={h2} strokeWidth="0.6" opacity="0.16" />
              <circle cx="600" cy="400" r="120" stroke={h1} strokeWidth="0.5" opacity="0.12" strokeDasharray="3 8" />
              <circle cx="600" cy="400" r="80" stroke={h2} strokeWidth="0.4" opacity="0.08" strokeDasharray="2 10" />
            </>
          )}

          {showNetwork && (
            <>
              <circle cx="300" cy="250" r="5" fill={h1} opacity="0.25" />
              <circle cx="900" cy="250" r="5" fill={h1} opacity="0.25" />
              <circle cx="300" cy="550" r="5" fill={h2} opacity="0.22" />
              <circle cx="900" cy="550" r="5" fill={h2} opacity="0.22" />
              <circle cx="600" cy="400" r="6" fill={h1} opacity="0.30" />
              <line x1="300" y1="250" x2="600" y2="400" stroke={h1} strokeWidth="0.6" opacity="0.14" strokeDasharray="6 10" />
              <line x1="900" y1="250" x2="600" y2="400" stroke={h1} strokeWidth="0.6" opacity="0.14" strokeDasharray="6 10" />
              <line x1="300" y1="550" x2="600" y2="400" stroke={h2} strokeWidth="0.5" opacity="0.10" strokeDasharray="6 10" />
              <line x1="900" y1="550" x2="600" y2="400" stroke={h2} strokeWidth="0.5" opacity="0.10" strokeDasharray="6 10" />
              <line x1="300" y1="250" x2="900" y2="550" stroke={h2} strokeWidth="0.4" opacity="0.07" strokeDasharray="4 14" />
              <line x1="900" y1="250" x2="300" y2="550" stroke={h2} strokeWidth="0.4" opacity="0.07" strokeDasharray="4 14" />
            </>
          )}

          {showWave && (
            <>
              <path d="M100 400 Q300 340, 500 400 T900 400 T1100 400" stroke={h1} strokeWidth="0.6" fill="none" opacity="0.14" />
              <path d="M100 370 Q350 300, 600 370 T1100 370" stroke={h2} strokeWidth="0.5" fill="none" opacity="0.10" />
              <path d="M100 430 Q350 500, 600 430 T1100 430" stroke={h2} strokeWidth="0.5" fill="none" opacity="0.10" />
              <path d="M100 350 Q400 280, 700 350 T1100 350" stroke={h1} strokeWidth="0.3" fill="none" opacity="0.06" />
              <path d="M100 450 Q400 520, 700 450 T1100 450" stroke={h1} strokeWidth="0.3" fill="none" opacity="0.06" />
            </>
          )}
        </g>
      </svg>
    </div>
  )
}

/* ══════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════ */

interface PageEnvironmentProps {
  mood?: EnvironmentMood
  reduced?: boolean
}

export const PageEnvironment = memo(function PageEnvironment({
  mood: moodOverride,
  reduced = false,
}: PageEnvironmentProps) {
  const pathname = usePathname()
  const mood = moodOverride ?? detectMood(pathname)
  const config = useMemo(() => MOODS[mood], [mood])

  const particleStyle = (left: string, top: string, delay: string, dur: string) => ({
    left, top,
    animationDelay: delay,
    animationDuration: dur,
    background: config.particleColor,
    boxShadow: `0 0 10px ${config.particleGlow}, 0 0 20px ${config.particleGlow}`,
  })

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }}>
      {/* ═══ LAYER 1: Deep Base Space ═══ */}
      <div className="absolute inset-0" style={{ background: config.base }} />

      {/* Noise texture */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '256px 256px',
        }}
      />

      {/* ═══ LAYER 2: Geometric Grid (mood-specific) ═══ */}
      {!reduced && <GeometryGrid mood={mood} config={config} />}

      {/* ═══ LAYER 3: Atmospheric Glow (animated breathing) ═══ */}
      <div
        className="absolute inset-0 env-glow-breathe"
        style={{ background: reduced ? MOODS.standard.glow : config.glow }}
      />

      {/* ═══ LAYER 4: Ambient Particles (mood-colored) ═══ */}
      {!reduced && (
        <div className="absolute inset-0" style={{ opacity: config.particleOpacity }}>
          <div className="cinematic-particle" style={particleStyle('12%', '18%', '0s', '16s')} />
          <div className="cinematic-particle" style={particleStyle('72%', '12%', '3s', '20s')} />
          <div className="cinematic-particle" style={particleStyle('42%', '68%', '7s', '18s')} />
          <div className="cinematic-particle" style={particleStyle('88%', '52%', '11s', '22s')} />
          <div className="cinematic-particle" style={particleStyle('22%', '78%', '5s', '17s')} />
          <div className="cinematic-particle" style={particleStyle('58%', '32%', '9s', '19s')} />
          <div className="cinematic-particle" style={particleStyle('35%', '45%', '2s', '21s')} />
          <div className="cinematic-particle" style={particleStyle('92%', '28%', '14s', '23s')} />
        </div>
      )}
    </div>
  )
})

/**
 * Service-specific environment style for fullscreen workspace overlays.
 */
export function getServiceEnvironmentStyle(serviceId: string): React.CSSProperties {
  const moodMap: Record<string, EnvironmentMood> = {
    'agent-g': 'intelligence',
    'avatar': 'identity',
    'video': 'cinema',
    'editing': 'cinema',
    'image': 'gallery',
    'photo': 'gallery',
    'visual-intel': 'gallery',
    'music': 'audio',
    'text': 'knowledge',
    'prompt': 'knowledge',
    'workflow': 'engine',
    'software': 'engine',
    'business': 'standard',
    'shop': 'standard',
    'tourism': 'standard',
    'media': 'cinema',
  }

  const mood = moodMap[serviceId] || 'standard'
  const config = MOODS[mood]

  return {
    background: config.base,
  }
}

export { detectMood, MOODS }
