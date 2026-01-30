// lib/design-tokens.ts
export const tokens = {
  colors: {
    space: {
      black: '#05070A',
      deep: '#070A0F',
      glass: 'rgba(10, 20, 35, 0.55)',
    },
    cyan: {
      DEFAULT: '#22D3EE',
      soft: '#38BDF8',
      glow: 'rgba(34, 211, 238, 0.30)',
      dim: 'rgba(34, 211, 238, 0.12)',
    },
    silver: {
      primary: '#E5E7EB',
      muted: '#94A3B8',
      dim: 'rgba(229, 231, 235, 0.12)',
    },
    status: {
      online: '#10B981', // Soft green
    }
  },
  glass: {
    background: 'rgba(10, 20, 35, 0.40)',
    border: 'rgba(34, 211, 238, 0.25)',
    highlight: 'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
    blur: 'blur(20px) saturate(180%)',
  },
  shadows: {
    cyan: '0 0 40px rgba(34, 211, 238, 0.12)',
    cyanStrong: '0 0 60px rgba(34, 211, 238, 0.20)',
    inner: 'inset 0 1px 0 rgba(255, 255, 255, 0.10)',
  },
  radii: {
    cockpit: '28px',
    card: '22px',
    button: '16px',
  },
  animation: {
    slow: '4s ease-in-out infinite',
    gentle: '6s ease-in-out infinite',
  }
};
