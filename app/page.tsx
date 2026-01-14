'use client'

import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { WorkspaceState, ServiceKey, ChatTab, ChatMessage, Asset, PipelineJob } from '@/lib/types'
import { generateId } from '@/lib/utils'
import TopBar from '@/components/workspace/TopBar'
import Sidebar from '@/components/workspace/Sidebar'
import ChatPanel from '@/components/workspace/ChatPanel'

// Context
const WorkspaceContext = createContext<any>(undefined)

function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WorkspaceState>({
    activeService: null,
    chatTab: 'chat',
    messages: [{
      id: generateId(),
      role: 'system',
      text: 'Neural ecosystem initialized. Select a service to begin.',
      createdAt: new Date().toISOString(),
    }],
    assets: [
      {
        id: 'asset-1',
        type: 'image',
        title: 'Forest Texture Pack',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        sizeLabel: '24 MB',
        meta: { service: 'image' },
      },
    ],
    pipelineJobs: [],
    credits: 1250,
    storageUsed: 36,
    storageTotal: 100,
    dropdownSelections: {},
    isRecording: false,
  })

  const setActiveService = useCallback((service: ServiceKey | null) => {
    setState(prev => ({ ...prev, activeService: service, chatTab: 'chat', dropdownSelections: {} }))
  }, [])

  const setChatTab = useCallback((tab: ChatTab) => {
    setState(prev => ({ ...prev, chatTab: tab }))
  }, [])

  const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'createdAt'>) => {
    const newMessage: ChatMessage = {
      ...message,
      id: generateId(),
      createdAt: new Date().toISOString(),
    }
    setState(prev => ({ ...prev, messages: [...prev.messages, newMessage] }))
  }, [])

  const addAsset = useCallback((asset: Omit<Asset, 'id' | 'createdAt'>) => {
    const newAsset: Asset = {
      ...asset,
      id: generateId(),
      createdAt: new Date().toISOString(),
    }
    setState(prev => ({ ...prev, assets: [...prev.assets, newAsset], storageUsed: prev.storageUsed + 1 }))
  }, [])

  const addPipelineJob = useCallback((job: Omit<PipelineJob, 'id' | 'createdAt'>) => {
    const newJob: PipelineJob = {
      ...job,
      id: generateId(),
      createdAt: new Date().toISOString(),
    }
    setState(prev => ({ ...prev, pipelineJobs: [...prev.pipelineJobs, newJob] }))
  }, [])

  const updatePipelineJob = useCallback((id: string, updates: Partial<PipelineJob>) => {
    setState(prev => ({
      ...prev,
      pipelineJobs: prev.pipelineJobs.map(job => job.id === id ? { ...job, ...updates } : job),
    }))
  }, [])

  const setDropdownSelection = useCallback((key: string, value: string) => {
    setState(prev => ({ ...prev, dropdownSelections: { ...prev.dropdownSelections, [key]: value } }))
  }, [])

  const setIsRecording = useCallback((recording: boolean) => {
    setState(prev => ({ ...prev, isRecording: recording }))
  }, [])

  const clearMessages = useCallback(() => {
    setState(prev => ({ ...prev, messages: [] }))
  }, [])

  return (
    <WorkspaceContext.Provider value={{
      ...state,
      setActiveService,
      setChatTab,
      addMessage,
      addAsset,
      addPipelineJob,
      updatePipelineJob,
      setDropdownSelection,
      setIsRecording,
      clearMessages,
    }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return context
}

// Simple Service Grid Component (inline)
function SimpleServiceGrid() {
  const { setActiveService } = useWorkspace()
  
  const services = [
    { key: 'avatar' as ServiceKey, icon: '👤', title: 'Avatar Builder', subtitle: 'Digital Identity' },
    { key: 'voice' as ServiceKey, icon: '🎙️', title: 'Voice Lab', subtitle: 'Georgian Synthesis' },
    { key: 'image' as ServiceKey, icon: '🎨', title: 'Image Architect', subtitle: 'Visual Design' },
    { key: 'music' as ServiceKey, icon: '🎵', title: 'Music Studio', subtitle: 'Audio Composition' },
    { key: 'video' as ServiceKey, icon: '🎬', title: 'Video Cine-Lab', subtitle: 'Motion Pictures' },
    { key: 'game' as ServiceKey, icon: '🎮', title: 'Game Forge', subtitle: 'World Builder' },
    { key: 'production' as ServiceKey, icon: '⚡', title: 'AI Production', subtitle: 'Full Pipeline' },
    { key: 'business' as ServiceKey, icon: '💼', title: 'Business Agent', subtitle: 'Strategy Alpha' },
  ]

  return (
    <div className="w-full h-full overflow-y-auto bg-obsidian">
      <div className="w-full px-4 py-6">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-silver mb-2">Choose Your Service</h2>
          <p className="text-sm text-silver/50">Select an AI module to begin</p>
        </div>

        <div className="space-y-3 max-w-md mx-auto">
          {services.map((service) => (
            <button
              key={service.key}
              onClick={() => setActiveService(service.key)}
              className="w-full glass-card rounded-xl p-4 text-left active:bg-white/10 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg glass-panel flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">{service.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-silver truncate">{service.title}</h3>
                  <p className="text-xs text-silver/50 truncate">{service.subtitle}</p>
                </div>
                <svg className="w-5 h-5 text-silver/30 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// Splash Screen
function SplashScreen({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 800)
    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-obsidian flex items-center justify-center z-50"
    >
      <div className="text-center">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <div className="w-20 h-20 mx-auto rounded-xl bg-gradient-to-br from-midnight-blue to-deep-navy flex items-center justify-center border border-silver/20">
            <span className="text-3xl font-bold text-silver">A</span>
          </div>
        </motion.div>
        <motion.h1 initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="text-xl font-bold text-silver mt-4">
          Avatar G
        </motion.h1>
      </div>
    </motion.div>
  )
}

// Main Workspace
function WorkspaceContent() {
  const { activeService } = useWorkspace()

  return (
    <div className="h-screen flex flex-col bg-obsidian overflow-hidden">
      <TopBar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          {!activeService ? <SimpleServiceGrid /> : <ChatPanel />}
        </main>
      </div>
    </div>
  )
}

// Main Export
export default function HomePage() {
  const [showSplash, setShowSplash] = useState(true)

  return (
    <>
      <AnimatePresence>
        {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      </AnimatePresence>
      {!showSplash && (
        <WorkspaceProvider>
          <WorkspaceContent />
        </WorkspaceProvider>
      )}
    </>
  )
                                                      }
