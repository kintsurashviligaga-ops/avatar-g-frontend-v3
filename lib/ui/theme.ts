// lib/ui/theme.ts

/**
 * NOIR — Avatar G canonical dark theme tokens.
 * These values are aligned with the CSS custom properties in globals.css
 * (--app-bg, --app-accent, --app-danger, etc.).
 */
export const NOIR = {
  bg:            '#050510',
  bgPanel:       'rgba(255,255,255,0.04)',
  bgPanelHover:  'rgba(255,255,255,0.07)',
  border:        'rgba(255,255,255,0.08)',
  borderHover:   'rgba(255,255,255,0.18)',
  text:          '#ffffff',
  textMuted:     'rgba(255,255,255,0.5)',
  textDim:       'rgba(255,255,255,0.3)',
  accent:        '#7c5cfc',
  accentHover:   '#9b7fff',
  neon:          '#22d3ee',
  danger:        '#ff4466',
  success:       '#22c55e',
  warning:       '#f59e0b',
} as const

/** Semantic border-radius tokens */
export const RADIUS = {
  sm: '0.375rem',
  md: '0.75rem',
  lg: '1rem',
  xl: '1.5rem',
  full: '9999px',
} as const

/** Common glass-morphism styles (use as inline style objects) */
export const GLASS = {
  panel: {
    background: NOIR.bgPanel,
    border: `1px solid ${NOIR.border}`,
    borderRadius: RADIUS.lg,
    backdropFilter: 'blur(16px)',
  },
  card: {
    background: 'linear-gradient(135deg, rgba(20,28,46,0.72), rgba(14,20,36,0.5))',
    border: `1px solid rgba(124,92,252,0.20)`,
    borderRadius: RADIUS.xl,
    backdropFilter: 'blur(18px)',
    boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
  },
} as const
