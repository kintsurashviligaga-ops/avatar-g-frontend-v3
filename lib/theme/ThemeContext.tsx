'use client'

import { createContext, useContext, useEffect, type ReactNode } from 'react'

type Theme = 'dark'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Force dark — cinematic AI environment requires dark mode
    document.documentElement.setAttribute('data-theme', 'dark')
    document.documentElement.classList.add('dark')
    localStorage.setItem('myavatar-theme', 'dark')
  }, [])

  return (
    <ThemeContext.Provider value={{ theme: 'dark', toggleTheme: () => {}, setTheme: () => {} }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
