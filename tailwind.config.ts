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
          black: '#050510',
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
        orbitSlow: 'orbit 40s linear infinite',
        orbitMid: 'orbit 28s linear infinite',
        orbitSlowRev: 'orbitReverse 44s linear infinite',
        orbitSlowMobile: 'orbit 80s linear infinite',
        orbitMidMobile: 'orbit 56s linear infinite',
        orbitSlowRevMobile: 'orbitReverse 88s linear infinite',
        floatSoft: 'floatSoft 5s ease-in-out infinite',
        'gradient-x': 'gradient-x 8s ease infinite',
        'shimmer': 'shimmer 2.5s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'slide-up': 'slide-up 0.6s ease-out forwards',
        'slide-up-delay-1': 'slide-up 0.6s ease-out 0.1s forwards',
        'slide-up-delay-2': 'slide-up 0.6s ease-out 0.2s forwards',
        'slide-up-delay-3': 'slide-up 0.6s ease-out 0.3s forwards',
        'slide-up-delay-4': 'slide-up 0.6s ease-out 0.4s forwards',
        'scale-in': 'scale-in 0.5s ease-out forwards',
        'aurora': 'aurora 12s ease-in-out infinite alternate',
        'float-slow': 'floatSlow 8s ease-in-out infinite',
        'particle-drift': 'particle-drift 20s linear infinite',
        'ring-pulse': 'ring-pulse 4s ease-in-out infinite',
        'text-glow': 'text-glow 3s ease-in-out infinite',
        'border-glow': 'border-glow 4s ease-in-out infinite',
        'meteor': 'meteor 8s linear infinite',
        'spin-slow': 'spin 12s linear infinite',
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
        orbit: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        orbitReverse: {
          '0%': { transform: 'rotate(360deg)' },
          '100%': { transform: 'rotate(0deg)' },
        },
        floatSoft: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'gradient-x': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(34,211,238,0.15), 0 0 60px rgba(34,211,238,0.05)' },
          '50%': { boxShadow: '0 0 40px rgba(34,211,238,0.3), 0 0 80px rgba(34,211,238,0.12)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        aurora: {
          '0%': { backgroundPosition: '0% 50%', opacity: '0.5' },
          '50%': { backgroundPosition: '100% 50%', opacity: '0.8' },
          '100%': { backgroundPosition: '0% 50%', opacity: '0.5' },
        },
        floatSlow: {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '33%': { transform: 'translateY(-12px) rotate(1deg)' },
          '66%': { transform: 'translateY(4px) rotate(-1deg)' },
        },
        'particle-drift': {
          '0%': { transform: 'translateY(0) translateX(0)', opacity: '0' },
          '10%': { opacity: '1' },
          '90%': { opacity: '1' },
          '100%': { transform: 'translateY(-100vh) translateX(100px)', opacity: '0' },
        },
        'ring-pulse': {
          '0%, 100%': { opacity: '0.3', transform: 'scale(1)' },
          '50%': { opacity: '0.6', transform: 'scale(1.02)' },
        },
        'text-glow': {
          '0%, 100%': { textShadow: '0 0 20px rgba(34,211,238,0.3), 0 0 40px rgba(34,211,238,0.1)' },
          '50%': { textShadow: '0 0 30px rgba(34,211,238,0.5), 0 0 60px rgba(34,211,238,0.2)' },
        },
        'border-glow': {
          '0%, 100%': { borderColor: 'rgba(34,211,238,0.2)' },
          '50%': { borderColor: 'rgba(34,211,238,0.5)' },
        },
        meteor: {
          '0%': { transform: 'translateX(-100%) translateY(-100%) rotate(45deg)', opacity: '0' },
          '5%': { opacity: '1' },
          '15%': { transform: 'translateX(100vw) translateY(100vh) rotate(45deg)', opacity: '0' },
          '100%': { transform: 'translateX(100vw) translateY(100vh) rotate(45deg)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
  safelist: [
    'animate-[orbit_28s_linear_infinite]',
    'animate-[orbit_40s_linear_infinite]',
    'animate-[orbit_56s_linear_infinite]',
    'animate-[orbit_80s_linear_infinite]',
    'animate-[orbitReverse_44s_linear_infinite]',
    'animate-[orbitReverse_88s_linear_infinite]',
    'motion-reduce:animate-none',
  ],
}
export default config
