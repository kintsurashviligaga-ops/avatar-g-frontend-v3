import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-ui)', 'Noto Sans Georgian', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        'app-bg': 'rgb(var(--app-bg) / <alpha-value>)',
        'app-surface': 'rgb(var(--app-surface) / <alpha-value>)',
        'app-elevated': 'rgb(var(--app-elevated) / <alpha-value>)',
        'app-border': 'rgb(var(--app-border) / <alpha-value>)',
        'app-text': 'rgb(var(--app-text) / <alpha-value>)',
        'app-muted': 'rgb(var(--app-muted) / <alpha-value>)',
        'app-accent': 'rgb(var(--app-accent) / <alpha-value>)',
        'app-neon': 'rgb(var(--app-neon) / <alpha-value>)',
        'app-success': 'rgb(var(--app-success) / <alpha-value>)',
        'app-warning': 'rgb(var(--app-warning) / <alpha-value>)',
        'app-danger': 'rgb(var(--app-danger) / <alpha-value>)',
        space: {
          black: '#05070A',
          dark: '#0A1423',
        },
        cyan: {
          400: '#22D3EE',
          500: '#06B6D4',
          600: '#0891B2',
        },
        silver: {
          100: '#F5F5F5',
          300: '#C0C0C0',
          400: '#A0A0A0',
          500: '#808080',
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        glass: '0 8px 40px rgba(0,0,0,0.35)',
        neon: '0 0 0 1px rgba(34, 211, 238, 0.25), 0 0 32px rgba(34, 211, 238, 0.2)',
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.15rem',
        '3xl': '1.5rem',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'fade-in': 'fade-in 240ms ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
export default config
