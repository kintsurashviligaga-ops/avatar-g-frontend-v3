'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'

export type Theme = 'dark' | 'light'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  setTheme: (t: Theme) => void
}

const STORAGE_KEY = 'myavatar-theme'

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
})

/**
 * Applies the theme to <html>: the `data-theme` attribute drives the CSS-token
 * palettes in globals.css ([data-theme='dark'] / [data-theme='light']), and the
 * `.dark` / `.light` class keeps Tailwind's `dark:` variant (darkMode:'class')
 * in sync. We also flip the browser chrome color so the PWA status bar matches.
 */
function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  root.classList.toggle('dark', theme === 'dark')
  root.classList.toggle('light', theme === 'light')

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#000000' : '#ffffff')
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // SSR renders data-theme="dark"; keep the initial client state matching so
  // hydration never mismatches. The inline boot script in app/layout.tsx has
  // already applied the persisted theme before paint (no FOUC).
  const [theme, setThemeState] = useState<Theme>('dark')

  // Adopt whatever the boot script resolved (localStorage → system → dark).
  useEffect(() => {
    const stored = (typeof window !== 'undefined'
      ? (localStorage.getItem(STORAGE_KEY) as Theme | null)
      : null)
    const current =
      stored === 'light' || stored === 'dark'
        ? stored
        : (document.documentElement.getAttribute('data-theme') as Theme | null) || 'dark'
    setThemeState(current)
    applyTheme(current)
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    applyTheme(t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      /* private mode / storage disabled — runtime theme still applies */
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
