'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTheme } from '@/lib/theme/ThemeContext'

interface ThemeToggleProps {
  /** Accessible label (localized by the caller). */
  label?: string
  className?: string
}

/**
 * Dark/light theme toggle. Reads + flips the theme via ThemeContext (which
 * persists to localStorage and syncs the data-theme attribute + .dark/.light
 * class). Renders nothing meaningful until mounted to avoid an icon flash that
 * disagrees with the boot-script-resolved theme.
 */
export function ThemeToggle({ label = 'Toggle theme', className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      aria-pressed={!isDark}
      className={
        className ||
        'h-9 w-9 rounded-full flex items-center justify-center transition active:scale-95 text-app-muted hover:text-app-text hover:bg-app-elevated/60'
      }
    >
      {/* Show the icon for the theme you'd switch TO. Until mounted, default to
          the moon (matches the dark default) so SSR and first paint agree. */}
      {mounted && isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}

export default ThemeToggle
