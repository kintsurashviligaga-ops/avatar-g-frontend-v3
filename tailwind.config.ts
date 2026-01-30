import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Custom brand colors
        obsidian: '#05070A',
        silver: '#C0C0C0',
        'midnight-blue': '#1a2332',
        'deep-navy': '#0f1419',
        
        // System colors
        background: '#000000',
        foreground: '#ffffff',
        
        // Accent colors (cyan theme)
        cyan: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
          950: '#083344',
        },
      },
      fontFamily: {
        inter: ['var(--font-inter)', 'system-ui', '-apple-system', 'sans-serif'],
        orbitron: ['var(--font-orbitron)', 'sans-serif'],
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'bounce-slow': 'bounce 3s infinite',
      },
      transitionDuration: {
        '400': '400ms',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
  darkMode: 'class',
}

export default config
