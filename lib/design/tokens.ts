/**
 * Avatar G Design Tokens
 * Centralized design system for consistent UI/UX across the application
 * 
 * Usage:
 * import { colors, spacing, typography } from '@/lib/design/tokens'
 */

// ==========================================
// COLORS
// ==========================================
export const colors = {
  // Primary Gradient
  primary: {
    from: '#06B6D4', // cyan-400
    to: '#3B82F6', // blue-500
    dark: '#0891B2', // cyan-600
  },

  // Accent Colors
  accent: {
    red: '#EF4444',
    orange: '#F97316',
    yellow: '#FBBF24',
    green: '#10B981',
    purple: '#A855F7',
    pink: '#EC4899',
  },

  // Semantic Colors
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Neutrals
  neutral: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },

  // Background
  bg: {
    dark: '#05070A',
    darker: '#020304',
    card: '#0F1419',
    hover: '#1A1F2E',
  },

  // Text
  text: {
    primary: '#FFFFFF',
    secondary: '#A0AEC0',
    muted: '#718096',
    inverse: '#05070A',
  },

  // Borders
  border: {
    light: 'rgba(255, 255, 255, 0.1)',
    medium: 'rgba(255, 255, 255, 0.2)',
    dark: 'rgba(255, 255, 255, 0.05)',
  },

  // Gradients
  gradients: {
    cyanToBlue: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)',
    purpleToBlue: 'linear-gradient(135deg, #A855F7 0%, #3B82F6 100%)',
    orangeToRed: 'linear-gradient(135deg, #F97316 0%, #EF4444 100%)',
    greenToEmerald: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
  },
} as const;

// ==========================================
// SPACING
// ==========================================
export const spacing = {
  xs: '0.25rem', // 4px
  sm: '0.5rem', // 8px
  md: '1rem', // 16px
  lg: '1.5rem', // 24px
  xl: '2rem', // 32px
  '2xl': '2.5rem', // 40px
  '3xl': '3rem', // 48px
  '4xl': '4rem', // 64px
  '5xl': '5rem', // 80px
  '6xl': '6rem', // 96px
} as const;

// Container sizes
export const containers = {
  xs: '320px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// ==========================================
// TYPOGRAPHY
// ==========================================
export const typography = {
  // Font families
  fonts: {
    sans: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
  },

  // Font sizes (with line-height)
  sizes: {
    xs: { size: '0.75rem', lineHeight: '1rem' }, // 12px
    sm: { size: '0.875rem', lineHeight: '1.25rem' }, // 14px
    base: { size: '1rem', lineHeight: '1.5rem' }, // 16px
    lg: { size: '1.125rem', lineHeight: '1.75rem' }, // 18px
    xl: { size: '1.25rem', lineHeight: '1.75rem' }, // 20px
    '2xl': { size: '1.5rem', lineHeight: '2rem' }, // 24px
    '3xl': { size: '1.875rem', lineHeight: '2.25rem' }, // 30px
    '4xl': { size: '2.25rem', lineHeight: '2.5rem' }, // 36px
    '5xl': { size: '3rem', lineHeight: '1.2' }, // 48px
    '6xl': { size: '3.75rem', lineHeight: '1.2' }, // 60px
    '7xl': { size: '4.5rem', lineHeight: '1.2' }, // 72px
  },

  // Font weights
  weights: {
    thin: 100,
    extralight: 200,
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  },

  // Predefined text styles
  styles: {
    h1: {
      fontSize: '3.75rem', // 60px
      fontWeight: 700,
      lineHeight: '1.2',
      letterSpacing: '-0.02em',
    },
    h2: {
      fontSize: '2.25rem', // 36px
      fontWeight: 700,
      lineHeight: '1.3',
      letterSpacing: '-0.01em',
    },
    h3: {
      fontSize: '1.875rem', // 30px
      fontWeight: 600,
      lineHeight: '1.4',
    },
    h4: {
      fontSize: '1.5rem', // 24px
      fontWeight: 600,
      lineHeight: '1.5',
    },
    body: {
      fontSize: '1rem', // 16px
      fontWeight: 400,
      lineHeight: '1.6',
    },
    bodySmall: {
      fontSize: '0.875rem', // 14px
      fontWeight: 400,
      lineHeight: '1.5',
    },
    caption: {
      fontSize: '0.75rem', // 12px
      fontWeight: 400,
      lineHeight: '1.4',
    },
    button: {
      fontSize: '0.875rem', // 14px
      fontWeight: 600,
      lineHeight: '1.5',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    },
  },
} as const;

// ==========================================
// BORDER RADIUS
// ==========================================
export const radius = {
  none: '0',
  xs: '0.125rem', // 2px
  sm: '0.25rem', // 4px
  md: '0.375rem', // 6px
  lg: '0.5rem', // 8px
  xl: '0.75rem', // 12px
  '2xl': '1rem', // 16px
  '3xl': '1.5rem', // 24px
  full: '9999px',
} as const;

// ==========================================
// SHADOWS
// ==========================================
export const shadows = {
  none: 'none',
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',

  // Glow effects
  glow: {
    cyan: '0 0 30px rgba(6, 182, 212, 0.3)',
    blue: '0 0 30px rgba(59, 130, 246, 0.3)',
    purple: '0 0 30px rgba(168, 85, 247, 0.3)',
  },

  // Glass morphism
  glass: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
} as const;

// ==========================================
// ANIMATIONS
// ==========================================
export const animations = {
  // Durations (in milliseconds)
  duration: {
    fast: 100,
    base: 200,
    slow: 300,
    slower: 500,
    slowest: 700,
  },

  // Easing functions
  easing: {
    linear: 'linear',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    easeInCubic: 'cubic-bezier(0.32, 0, 0.67, 0)',
    easeOutCubic: 'cubic-bezier(0.33, 1, 0.68, 1)',
  },

  // Predefined animations for Framer Motion
  transitions: {
    base: { duration: 0.2, ease: 'easeOut' },
    slow: { duration: 0.5, ease: 'easeOut' },
    fast: { duration: 0.1 },
  },

  // Keyframe animations
  keyframes: {
    fadeIn: 'fadeIn 0.3s ease-in-out',
    fadeOut: 'fadeOut 0.3s ease-in-out',
    slideIn: 'slideIn 0.4s ease-out',
    slideOut: 'slideOut 0.4s ease-in',
    pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
    bounce: 'bounce 1s infinite',
    spin: 'spin 1s linear infinite',
    shimmer: 'shimmer 2s infinite',
  },
} as const;

// ==========================================
// Z-INDEX LAYER SYSTEM
// ==========================================
export const zIndex = {
  hide: '-1',
  base: '0',
  dropdown: '10',
  sticky: '20',
  fixed: '30',
  modalBackdrop: '40',
  modal: '50',
  popover: '60',
  tooltip: '70',
  notification: '80',
  loading: '90',
  debug: '999',
} as const;

// ==========================================
// BREAKPOINTS
// ==========================================
export const breakpoints = {
  xs: '320px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// ==========================================
// COMPONENT VARIANTS
// ==========================================
export const variants = {
  // Button variants
  button: {
    primary: {
      bg: colors.primary.from,
      hover: colors.primary.dark,
      text: colors.text.primary,
    },
    secondary: {
      bg: colors.neutral[800],
      hover: colors.neutral[700],
      text: colors.text.primary,
    },
    ghost: {
      bg: 'transparent',
      hover: colors.bg.hover,
      text: colors.text.primary,
    },
  },

  // Card variants
  card: {
    default: {
      bg: colors.bg.card,
      border: colors.border.light,
    },
    elevated: {
      bg: colors.bg.card,
      shadow: shadows.lg,
    },
    glass: {
      bg: 'rgba(255, 255, 255, 0.1)',
      shadow: shadows.glass,
      backdropFilter: 'blur(10px)',
    },
  },

  // Input variants
  input: {
    default: {
      bg: colors.bg.card,
      border: colors.border.light,
      text: colors.text.primary,
      placeholder: colors.text.muted,
    },
    error: {
      bg: colors.bg.card,
      border: colors.error,
      text: colors.text.primary,
    },
    success: {
      bg: colors.bg.card,
      border: colors.success,
      text: colors.text.primary,
    },
  },
} as const;

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
export const getContrastText = (bgColor: string): string => {
  // Simple contrast checker - returns dark or light text color
  return colors.text.primary;
};

export const withOpacity = (color: string, opacity: number): string => {
  // Helper function to add opacity to colors
  return `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
};

// ==========================================
// EXPORT ALL TOKENS
// ==========================================
export default {
  colors,
  spacing,
  containers,
  typography,
  radius,
  shadows,
  animations,
  zIndex,
  breakpoints,
  variants,
};
