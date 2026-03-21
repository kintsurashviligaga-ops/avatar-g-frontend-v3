'use client'

/**
 * ServiceContext — Global service context provider.
 * Tracks the active service, recent outputs, and provides platform control helpers.
 * Used by ServiceChatLayout to make Agent G service-aware.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export interface ServiceOutput {
  id: string
  serviceId: string
  type: 'avatar' | 'image' | 'video' | 'music' | 'text' | 'workflow' | 'result'
  label: string
  preview?: string
  createdAt: string
}

export interface ServiceContextState {
  /** Currently active service slug */
  activeService: string | null
  /** Recent outputs from any service */
  recentOutputs: ServiceOutput[]
  /** Last service the user came from */
  previousService: string | null

  /** Set the active service */
  setActiveService: (serviceId: string) => void
  /** Add an output from a service */
  addOutput: (output: ServiceOutput) => void
  /** Get outputs that can be transferred to a target service */
  getTransferableOutputs: (targetService: string) => ServiceOutput[]
  /** Clear all context */
  reset: () => void
}

const ServiceContext = createContext<ServiceContextState | null>(null)

/** Maps which output types each service can accept as input */
const SERVICE_ACCEPTS: Record<string, string[]> = {
  avatar: ['image'],
  video: ['avatar', 'image', 'music', 'text'],
  image: ['avatar', 'text'],
  music: ['text', 'video'],
  text: ['image', 'video'],
  editing: ['video', 'image'],
  photo: ['image', 'avatar'],
  workflow: ['avatar', 'image', 'video', 'music', 'text'],
  'agent-g': ['avatar', 'image', 'video', 'music', 'text', 'workflow', 'result'],
  business: ['text', 'image'],
  shop: ['image', 'avatar', 'video'],
  media: ['image', 'video', 'music', 'text'],
}

export function ServiceContextProvider({ children }: { children: ReactNode }) {
  const [activeService, setActiveServiceRaw] = useState<string | null>(null)
  const [previousService, setPreviousService] = useState<string | null>(null)
  const [recentOutputs, setRecentOutputs] = useState<ServiceOutput[]>([])

  const setActiveService = useCallback((serviceId: string) => {
    setActiveServiceRaw(prev => {
      if (prev && prev !== serviceId) setPreviousService(prev)
      return serviceId
    })
  }, [])

  const addOutput = useCallback((output: ServiceOutput) => {
    setRecentOutputs(prev => [output, ...prev].slice(0, 20))
  }, [])

  const getTransferableOutputs = useCallback((targetService: string) => {
    const accepts = SERVICE_ACCEPTS[targetService] || []
    return recentOutputs.filter(o => accepts.includes(o.type))
  }, [recentOutputs])

  const reset = useCallback(() => {
    setActiveServiceRaw(null)
    setPreviousService(null)
    setRecentOutputs([])
  }, [])

  return (
    <ServiceContext.Provider value={{
      activeService, recentOutputs, previousService,
      setActiveService, addOutput, getTransferableOutputs, reset,
    }}>
      {children}
    </ServiceContext.Provider>
  )
}

export function useServiceContext() {
  const ctx = useContext(ServiceContext)
  if (!ctx) {
    // Return a noop version when outside provider (e.g., landing page)
    return {
      activeService: null,
      recentOutputs: [],
      previousService: null,
      setActiveService: () => {},
      addOutput: () => {},
      getTransferableOutputs: () => [],
      reset: () => {},
    } as ServiceContextState
  }
  return ctx
}
