'use client'

import { createContext, useContext } from 'react'

/**
 * ShellContainerContext — Provides a portal target ref for service chat layouts.
 * When inside UnifiedServiceShell, service chat renders into this container
 * instead of portaling to document.body (which would cover the dock/topbar).
 */
interface ShellContainerContextValue {
  /** If true, we're inside the unified shell — don't portal to body */
  insideShell: boolean
  /** Ref to the content container element for inline rendering */
  containerRef: React.RefObject<HTMLDivElement | null> | null
}

const ShellContainerContext = createContext<ShellContainerContextValue>({
  insideShell: false,
  containerRef: null,
})

export function ShellContainerProvider({
  containerRef,
  children,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
  children: React.ReactNode
}) {
  return (
    <ShellContainerContext.Provider value={{ insideShell: true, containerRef }}>
      {children}
    </ShellContainerContext.Provider>
  )
}

export function useShellContainer() {
  return useContext(ShellContainerContext)
}
