import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}', // ✅ დავამატეთ lib ფოლდერი
  ],
  theme: {
    extend: {
      colors: {
        obsidian: '#05070A',
        silver: '#C0C0C0',
        'midnight-blue': '#1a2332',
        'deep-navy': '#0f1419',
        // ✅ დავამატეთ ფონის ფერები
        background: '#000000',
        foreground: '#ffffff',
      },
      fontFamily: {
        // ✅ დავამატეთ ფონტები
        inter: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        orbitron: ['var(--font-orbitron)', 'sans-serif'],
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        // ✅ დავამატეთ ანიმაციები
        'spin-slow': 'spin 3s linear infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
  // ✅ დავამატეთ dark mode
  darkMode: 'class',
}

export default config
