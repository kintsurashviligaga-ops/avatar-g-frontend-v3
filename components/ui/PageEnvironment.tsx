'use client'

/**
 * PageEnvironment — Route-aware 4D geometric AI environment system.
 *
 * Replaces the single generic CinematicEnvironment with per-page atmospheric moods.
 * Each page in MyAvatar.ge feels like a different chamber of the same AI spaceship,
 * sharing a unified visual language but with purpose-specific atmosphere.
 *
 * Structure:
 *   Layer 1 — Deep space base (per-mood gradients)
 *   Layer 2 — Noise texture (shared)
 *   Layer 3 — Geometric grid (per-mood SVG)
 *   Layer 4 — Atmospheric glow (per-mood)
 *   Layer 5 — Particles (shared, intensity varies)
 */

import { memo, useMemo } from 'react'
import { usePathname } from 'next/navigation'

/* ══════════════════════════════════════════════
   MOOD SYSTEM — Each page type gets a mood
   ══════════════════════════════════════════════ */

export type EnvironmentMood =
  | 'command'      // Landing page — entry deck, broad & impressive
  | 'intelligence' // Agent G chat — AI command room, focused & deep
  | 'identity'     // Avatar service — digital identity lab
  | 'cinema'       // Video service — production bay
  | 'gallery'      // Image service — rendering chamber
  | 'audio'        // Music service — synthesis room
  | 'knowledge'    // Text service — writing chamber
  | 'engine'       // Workflow — systems engine room
  | 'hub'          // Services index — access corridor
  | 'vault'        // Account/auth — secure area
  | 'standard'     // Default for other pages

/** Map route patterns → moods */
function detectMood(pathname: string | null): EnvironmentMood {
  if (!pathname) return 'standard'
  const p = pathname.replace(/^\/(en|ka|ru)/, '')

  // Landing page
  if (p === '' || p === '/') return 'command'

  // Services index
  if (p === '/services' || p === '/services/') return 'hub'

  // Agent G
  if (p.startsWith('/services/agent-g')) return 'intelligence'

  // Service-specific
  if (p.startsWith('/services/avatar')) return 'identity'
  if (p.startsWith('/services/video') || p.startsWith('/services/editing')) return 'cinema'
  if (p.startsWith('/services/image') || p.startsWith('/services/photo') || p.startsWith('/services/visual-intel')) return 'gallery'
  if (p.startsWith('/services/music')) return 'audio'
  if (p.startsWith('/services/text') || p.startsWith('/services/prompt')) return 'knowledge'
  if (p.startsWith('/services/workflow') || p.startsWith('/services/software')) return 'engine'

  // Auth / account
  if (p.startsWith('/auth') || p.startsWith('/login') || p.startsWith('/signup') || p.startsWith('/account')) return 'vault'

  // Pricing / about / etc → standard
  return 'standard'
}

/* ══════════════════════════════════════════════
   MOOD CONFIGS — Visual parameters per mood
   ══════════════════════════════════════════════ */

interface MoodConfig {
  base: string        // Layer 1: deep space gradients
  glow: string        // Layer 4: atmospheric glow
  geoOpacity: number  // Geometry layer opacity
  geoHue: string      // Primary hue for geometry lines
  geoHue2: string     // Secondary hue
  particleOpacity: number
  /** Extra geometry SVG elements (mood-specific structural accents) */
  extraGeo?: string
}

const MOODS: Record<EnvironmentMood, MoodConfig> = {
  /* ── Landing: Entry deck — broad, impressive, cinematic horizon ── */
  command: {
    base: `
      radial-gradient(ellipse 140% 80% at 50% -15%, #0c1a2e 0%, transparent 60%),
      radial-gradient(ellipse 120% 60% at 50% 115%, #081a30 0%, transparent 50%),
      radial-gradient(ellipse 80% 80% at 10% 50%, #0a1225 0%, transparent 50%),
      radial-gradient(ellipse 80% 80% at 90% 50%, #0b1428 0%, transparent 50%),
      linear-gradient(180deg, #060c1a 0%, #0a1020 30%, #080e1c 70%, #050a14 100%)
    `,
    glow: `
      radial-gradient(ellipse 150% 50% at 50% 105%, rgba(34,211,238,0.20) 0%, transparent 55%),
      radial-gradient(ellipse 100% 40% at 50% -5%, rgba(34,211,238,0.14) 0%, transparent 50%),
      radial-gradient(ellipse 60% 50% at 5% 80%, rgba(6,182,212,0.12) 0%, transparent 40%),
      radial-gradient(ellipse 60% 50% at 95% 80%, rgba(8,145,178,0.12) 0%, transparent 40%)
    `,
    geoOpacity: 1,
    geoHue: '#22d3ee',
    geoHue2: '#06b6d4',
    particleOpacity: 1,
  },

  /* ── Agent G: AI command room — focused, darker center, depth on edges ── */
  intelligence: {
    base: `
      radial-gradient(ellipse 100% 100% at 50% 50%, #080e1c 0%, transparent 70%),
      radial-gradient(ellipse 120% 60% at 50% 110%, #061020 0%, transparent 50%),
      radial-gradient(ellipse 60% 70% at 15% 40%, #0a1425 0%, transparent 45%),
      radial-gradient(ellipse 60% 70% at 85% 40%, #0a1428 0%, transparent 45%),
      linear-gradient(180deg, #050a16 0%, #070d1a 40%, #060b18 80%, #040812 100%)
    `,
    glow: `
      radial-gradient(ellipse 100% 40% at 50% 100%, rgba(34,211,238,0.14) 0%, transparent 55%),
      radial-gradient(ellipse 60% 30% at 50% 0%, rgba(34,211,238,0.08) 0%, transparent 45%),
      radial-gradient(ellipse 40% 60% at 8% 50%, rgba(6,182,212,0.06) 0%, transparent 35%),
      radial-gradient(ellipse 40% 60% at 92% 50%, rgba(8,145,178,0.06) 0%, transparent 35%)
    `,
    geoOpacity: 0.7,
    geoHue: '#22d3ee',
    geoHue2: '#0891b2',
    particleOpacity: 0.5,
  },

  /* ── Avatar: Identity lab — refined, portrait-centric, holographic framing ── */
  identity: {
    base: `
      radial-gradient(ellipse 80% 90% at 50% 40%, #0a1225 0%, transparent 65%),
      radial-gradient(ellipse 100% 50% at 50% 110%, #081020 0%, transparent 50%),
      radial-gradient(ellipse 50% 80% at 20% 50%, #0c1428 0%, transparent 45%),
      radial-gradient(ellipse 50% 80% at 80% 50%, #0b1428 0%, transparent 45%),
      linear-gradient(180deg, #060c1a 0%, #080e1c 40%, #070d1a 80%, #050a14 100%)
    `,
    glow: `
      radial-gradient(ellipse 70% 70% at 50% 35%, rgba(34,211,238,0.06) 0%, transparent 60%),
      radial-gradient(ellipse 120% 40% at 50% 100%, rgba(34,211,238,0.12) 0%, transparent 50%),
      radial-gradient(ellipse 40% 50% at 10% 40%, rgba(6,182,212,0.08) 0%, transparent 35%)
    `,
    geoOpacity: 0.6,
    geoHue: '#22d3ee',
    geoHue2: '#06b6d4',
    particleOpacity: 0.6,
  },

  /* ── Video: Production bay — cinematic, motion-inspired depth ── */
  cinema: {
    base: `
      radial-gradient(ellipse 130% 70% at 50% -10%, #0e1a30 0%, transparent 60%),
      radial-gradient(ellipse 130% 70% at 50% 115%, #0a1528 0%, transparent 55%),
      radial-gradient(ellipse 70% 90% at 10% 50%, #0c1830 0%, transparent 50%),
      radial-gradient(ellipse 70% 90% at 90% 50%, #0d1830 0%, transparent 50%),
      linear-gradient(180deg, #060c1a 0%, #0a1222 35%, #08101e 65%, #050a14 100%)
    `,
    glow: `
      radial-gradient(ellipse 140% 45% at 50% 100%, rgba(34,211,238,0.16) 0%, transparent 55%),
      radial-gradient(ellipse 100% 35% at 50% 0%, rgba(34,211,238,0.10) 0%, transparent 45%),
      radial-gradient(ellipse 50% 50% at 5% 85%, rgba(6,182,212,0.09) 0%, transparent 40%),
      radial-gradient(ellipse 50% 50% at 95% 85%, rgba(8,145,178,0.09) 0%, transparent 40%)
    `,
    geoOpacity: 0.8,
    geoHue: '#22d3ee',
    geoHue2: '#06b6d4',
    particleOpacity: 0.7,
  },

  /* ── Image: Visual rendering chamber — clean, gallery-like ── */
  gallery: {
    base: `
      radial-gradient(ellipse 100% 80% at 50% 30%, #0a1225 0%, transparent 65%),
      radial-gradient(ellipse 100% 50% at 50% 110%, #081020 0%, transparent 50%),
      radial-gradient(ellipse 60% 60% at 15% 50%, #0a1225 0%, transparent 45%),
      radial-gradient(ellipse 60% 60% at 85% 50%, #0a1225 0%, transparent 45%),
      linear-gradient(180deg, #060c1a 0%, #090f1e 35%, #080e1c 65%, #050a14 100%)
    `,
    glow: `
      radial-gradient(ellipse 80% 60% at 50% 50%, rgba(34,211,238,0.04) 0%, transparent 65%),
      radial-gradient(ellipse 120% 35% at 50% 100%, rgba(34,211,238,0.12) 0%, transparent 50%),
      radial-gradient(ellipse 60% 30% at 50% 0%, rgba(34,211,238,0.08) 0%, transparent 40%)
    `,
    geoOpacity: 0.5,
    geoHue: '#22d3ee',
    geoHue2: '#06b6d4',
    particleOpacity: 0.4,
  },

  /* ── Music: Audio synthesis room — softer, ambient, waveform-inspired ── */
  audio: {
    base: `
      radial-gradient(ellipse 120% 80% at 50% 60%, #08101e 0%, transparent 65%),
      radial-gradient(ellipse 100% 60% at 50% 110%, #0a1428 0%, transparent 50%),
      radial-gradient(ellipse 80% 70% at 10% 60%, #0a1225 0%, transparent 50%),
      radial-gradient(ellipse 80% 70% at 90% 60%, #0a1225 0%, transparent 50%),
      linear-gradient(180deg, #050a16 0%, #080e1c 40%, #070d1a 70%, #050a14 100%)
    `,
    glow: `
      radial-gradient(ellipse 130% 50% at 50% 60%, rgba(34,211,238,0.08) 0%, transparent 60%),
      radial-gradient(ellipse 100% 30% at 50% 100%, rgba(6,182,212,0.14) 0%, transparent 55%),
      radial-gradient(ellipse 60% 40% at 15% 70%, rgba(34,211,238,0.06) 0%, transparent 40%),
      radial-gradient(ellipse 60% 40% at 85% 70%, rgba(8,145,178,0.06) 0%, transparent 40%)
    `,
    geoOpacity: 0.45,
    geoHue: '#06b6d4',
    geoHue2: '#0891b2',
    particleOpacity: 0.7,
  },

  /* ── Text: Knowledge chamber — calm, readable, focused ── */
  knowledge: {
    base: `
      radial-gradient(ellipse 100% 80% at 50% 40%, #080e1c 0%, transparent 65%),
      radial-gradient(ellipse 80% 50% at 50% 110%, #081020 0%, transparent 45%),
      linear-gradient(180deg, #060c1a 0%, #080e1c 40%, #070d1a 70%, #050a14 100%)
    `,
    glow: `
      radial-gradient(ellipse 80% 40% at 50% 100%, rgba(34,211,238,0.10) 0%, transparent 50%),
      radial-gradient(ellipse 60% 25% at 50% 0%, rgba(34,211,238,0.06) 0%, transparent 40%)
    `,
    geoOpacity: 0.35,
    geoHue: '#22d3ee',
    geoHue2: '#06b6d4',
    particleOpacity: 0.3,
  },

  /* ── Workflow: Systems engine room — interconnected, operational ── */
  engine: {
    base: `
      radial-gradient(ellipse 120% 70% at 50% 20%, #0c1830 0%, transparent 60%),
      radial-gradient(ellipse 110% 60% at 50% 110%, #0a1428 0%, transparent 50%),
      radial-gradient(ellipse 70% 80% at 15% 50%, #0c1a30 0%, transparent 50%),
      radial-gradient(ellipse 70% 80% at 85% 50%, #0c1a30 0%, transparent 50%),
      linear-gradient(180deg, #060c1a 0%, #0a1222 35%, #08101e 65%, #050a14 100%)
    `,
    glow: `
      radial-gradient(ellipse 120% 45% at 50% 100%, rgba(34,211,238,0.16) 0%, transparent 55%),
      radial-gradient(ellipse 80% 35% at 50% 0%, rgba(34,211,238,0.10) 0%, transparent 45%),
      radial-gradient(ellipse 50% 40% at 10% 50%, rgba(6,182,212,0.08) 0%, transparent 35%),
      radial-gradient(ellipse 50% 40% at 90% 50%, rgba(8,145,178,0.08) 0%, transparent 35%)
    `,
    geoOpacity: 0.9,
    geoHue: '#22d3ee',
    geoHue2: '#0891b2',
    particleOpacity: 0.6,
  },

  /* ── Hub: Services corridor — wide, navigational ── */
  hub: {
    base: `
      radial-gradient(ellipse 130% 70% at 50% -10%, #0c1a2e 0%, transparent 55%),
      radial-gradient(ellipse 100% 60% at 50% 115%, #081428 0%, transparent 50%),
      radial-gradient(ellipse 80% 70% at 12% 50%, #0a1225 0%, transparent 45%),
      radial-gradient(ellipse 80% 70% at 88% 50%, #0b1428 0%, transparent 45%),
      linear-gradient(180deg, #060c1a 0%, #090f1e 35%, #080e1c 65%, #050a14 100%)
    `,
    glow: `
      radial-gradient(ellipse 130% 45% at 50% 100%, rgba(34,211,238,0.15) 0%, transparent 55%),
      radial-gradient(ellipse 80% 30% at 50% 0%, rgba(34,211,238,0.10) 0%, transparent 45%),
      radial-gradient(ellipse 50% 50% at 8% 80%, rgba(6,182,212,0.08) 0%, transparent 35%),
      radial-gradient(ellipse 50% 50% at 92% 80%, rgba(8,145,178,0.08) 0%, transparent 35%)
    `,
    geoOpacity: 0.75,
    geoHue: '#22d3ee',
    geoHue2: '#06b6d4',
    particleOpacity: 0.8,
  },

  /* ── Vault: Auth / account — secure, contained ── */
  vault: {
    base: `
      radial-gradient(ellipse 80% 80% at 50% 50%, #080e1c 0%, transparent 65%),
      radial-gradient(ellipse 100% 50% at 50% 110%, #081020 0%, transparent 45%),
      linear-gradient(180deg, #050a16 0%, #070d1a 40%, #060b18 70%, #040812 100%)
    `,
    glow: `
      radial-gradient(ellipse 80% 40% at 50% 100%, rgba(34,211,238,0.10) 0%, transparent 50%),
      radial-gradient(ellipse 50% 25% at 50% 0%, rgba(34,211,238,0.05) 0%, transparent 40%)
    `,
    geoOpacity: 0.4,
    geoHue: '#22d3ee',
    geoHue2: '#0891b2',
    particleOpacity: 0.3,
  },

  /* ── Standard: Default — balanced, neutral spacecraft corridor ── */
  standard: {
    base: `
      radial-gradient(ellipse 120% 70% at 50% -10%, #0c1a2e 0%, transparent 60%),
      radial-gradient(ellipse 100% 60% at 50% 110%, #081428 0%, transparent 50%),
      radial-gradient(ellipse 70% 70% at 15% 50%, #0a1225 0%, transparent 45%),
      radial-gradient(ellipse 70% 70% at 85% 50%, #0b1428 0%, transparent 45%),
      linear-gradient(180deg, #060c1a 0%, #090f1e 35%, #080e1c 65%, #050a14 100%)
    `,
    glow: `
      radial-gradient(ellipse 120% 40% at 50% 100%, rgba(34,211,238,0.12) 0%, transparent 55%),
      radial-gradient(ellipse 70% 30% at 50% 0%, rgba(34,211,238,0.08) 0%, transparent 45%)
    `,
    geoOpacity: 0.6,
    geoHue: '#22d3ee',
    geoHue2: '#06b6d4',
    particleOpacity: 0.6,
  },
}

/* ══════════════════════════════════════════════
   GEOMETRY SVG — Shared structure, mood-tinted
   ══════════════════════════════════════════════ */

function GeometryGrid({ mood, config }: { mood: EnvironmentMood; config: MoodConfig }) {
  const h1 = config.geoHue
  const h2 = config.geoHue2

  // Mood-specific geometry emphasis
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
            <stop offset="0%" stopColor={h1} stopOpacity="0.30" />
            <stop offset="100%" stopColor={h1} stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id="pg2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={h2} stopOpacity="0.22" />
            <stop offset="100%" stopColor={h2} stopOpacity="0.03" />
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
          {/* Core structural frames — shared across all moods */}
          <rect x="200" y="140" width="800" height="520" rx="8" stroke="url(#pg1)" strokeWidth="1" opacity="0.5" />
          <rect x="340" y="220" width="520" height="360" rx="6" stroke="url(#pg2)" strokeWidth="1" opacity="0.4" />
          <rect x="440" y="280" width="320" height="240" rx="4" stroke="url(#pg1)" strokeWidth="0.8" opacity="0.3" />

          {/* Perspective lines */}
          <line x1="200" y1="140" x2="340" y2="220" stroke={h1} strokeWidth="0.8" opacity="0.12" />
          <line x1="1000" y1="140" x2="860" y2="220" stroke={h1} strokeWidth="0.8" opacity="0.12" />
          <line x1="200" y1="660" x2="340" y2="580" stroke={h2} strokeWidth="0.8" opacity="0.10" />
          <line x1="1000" y1="660" x2="860" y2="580" stroke={h2} strokeWidth="0.8" opacity="0.10" />
          <line x1="340" y1="220" x2="440" y2="280" stroke={h1} strokeWidth="0.6" opacity="0.08" />
          <line x1="860" y1="220" x2="760" y2="280" stroke={h1} strokeWidth="0.6" opacity="0.08" />
          <line x1="340" y1="580" x2="440" y2="520" stroke={h2} strokeWidth="0.6" opacity="0.06" />
          <line x1="860" y1="580" x2="760" y2="520" stroke={h2} strokeWidth="0.6" opacity="0.06" />

          {/* Structural guide lines */}
          <line x1="100" y1="400" x2="1100" y2="400" stroke={h1} strokeWidth="0.5" opacity="0.06" strokeDasharray="8 16" />
          <line x1="600" y1="60" x2="600" y2="740" stroke={h1} strokeWidth="0.5" opacity="0.05" strokeDasharray="6 18" />

          {/* Corner accents */}
          <path d="M200 160 L200 140 L220 140" stroke={h1} strokeWidth="1.5" opacity="0.30" />
          <path d="M980 140 L1000 140 L1000 160" stroke={h1} strokeWidth="1.5" opacity="0.30" />
          <path d="M200 640 L200 660 L220 660" stroke={h2} strokeWidth="1.5" opacity="0.25" />
          <path d="M980 660 L1000 660 L1000 640" stroke={h2} strokeWidth="1.5" opacity="0.25" />

          {/* ── Mood-specific geometry ── */}

          {/* Command/Hub: Horizon lines — expansive feel */}
          {showHorizon && (
            <>
              <line x1="0" y1="400" x2="1200" y2="400" stroke={h1} strokeWidth="0.4" opacity="0.08" strokeDasharray="12 20" />
              <line x1="150" y1="300" x2="1050" y2="300" stroke={h2} strokeWidth="0.4" opacity="0.05" strokeDasharray="4 22" />
              <line x1="150" y1="500" x2="1050" y2="500" stroke={h2} strokeWidth="0.4" opacity="0.05" strokeDasharray="4 22" />
              <line x1="400" y1="100" x2="400" y2="700" stroke={h2} strokeWidth="0.4" opacity="0.04" strokeDasharray="4 24" />
              <line x1="800" y1="100" x2="800" y2="700" stroke={h2} strokeWidth="0.4" opacity="0.04" strokeDasharray="4 24" />
            </>
          )}

          {/* Intelligence/Identity: Concentric portal — focused depth */}
          {showPortal && (
            <>
              <rect x="480" y="310" width="240" height="180" rx="3" stroke={h1} strokeWidth="0.6" opacity="0.18" />
              <rect x="520" y="340" width="160" height="120" rx="2" stroke={h2} strokeWidth="0.5" opacity="0.12" />
              <circle cx="600" cy="400" r="120" stroke={h1} strokeWidth="0.4" opacity="0.08" strokeDasharray="3 8" />
            </>
          )}

          {/* Engine: Network nodes — interconnected systems */}
          {showNetwork && (
            <>
              <circle cx="300" cy="250" r="4" fill={h1} opacity="0.20" />
              <circle cx="900" cy="250" r="4" fill={h1} opacity="0.20" />
              <circle cx="300" cy="550" r="4" fill={h2} opacity="0.18" />
              <circle cx="900" cy="550" r="4" fill={h2} opacity="0.18" />
              <circle cx="600" cy="400" r="5" fill={h1} opacity="0.25" />
              <line x1="300" y1="250" x2="600" y2="400" stroke={h1} strokeWidth="0.5" opacity="0.10" strokeDasharray="6 10" />
              <line x1="900" y1="250" x2="600" y2="400" stroke={h1} strokeWidth="0.5" opacity="0.10" strokeDasharray="6 10" />
              <line x1="300" y1="550" x2="600" y2="400" stroke={h2} strokeWidth="0.5" opacity="0.08" strokeDasharray="6 10" />
              <line x1="900" y1="550" x2="600" y2="400" stroke={h2} strokeWidth="0.5" opacity="0.08" strokeDasharray="6 10" />
              <line x1="300" y1="250" x2="900" y2="550" stroke={h2} strokeWidth="0.3" opacity="0.05" strokeDasharray="4 14" />
              <line x1="900" y1="250" x2="300" y2="550" stroke={h2} strokeWidth="0.3" opacity="0.05" strokeDasharray="4 14" />
            </>
          )}

          {/* Audio: Wave-inspired curves */}
          {showWave && (
            <>
              <path d="M100 400 Q300 350, 500 400 T900 400 T1100 400" stroke={h1} strokeWidth="0.5" fill="none" opacity="0.10" />
              <path d="M100 380 Q350 320, 600 380 T1100 380" stroke={h2} strokeWidth="0.4" fill="none" opacity="0.07" />
              <path d="M100 420 Q350 480, 600 420 T1100 420" stroke={h2} strokeWidth="0.4" fill="none" opacity="0.07" />
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
  /** Override auto-detection */
  mood?: EnvironmentMood
  /** Reduce visuals for fullscreen chat overlays */
  reduced?: boolean
}

export const PageEnvironment = memo(function PageEnvironment({
  mood: moodOverride,
  reduced = false,
}: PageEnvironmentProps) {
  const pathname = usePathname()
  const mood = moodOverride ?? detectMood(pathname)
  const config = useMemo(() => MOODS[mood], [mood])

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

      {/* ═══ LAYER 3: Atmospheric Glow ═══ */}
      <div
        className="absolute inset-0"
        style={{ background: reduced ? MOODS.standard.glow : config.glow }}
      />

      {/* ═══ LAYER 4: Ambient Particles ═══ */}
      {!reduced && (
        <div className="absolute inset-0" style={{ opacity: config.particleOpacity }}>
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
  )
})

/**
 * Service-specific environment for portal-rendered workspace pages.
 * Returns the mood-appropriate background CSS for a service's fullscreen overlay.
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
