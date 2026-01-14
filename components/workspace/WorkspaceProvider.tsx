'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'
import type { WorkspaceState, ServiceKey, ChatTab, ChatMessage, Asset, PipelineJob } from '@/lib/types'
import { generateId } from '@/lib/utils'

interface WorkspaceContextType extends WorkspaceState {
  setActiveService: (service: ServiceKey | null) => void
  setChatTab: (tab: ChatTab) => void
  addMessage: (message: Omit<ChatMessage, 'id' | 'createdAt'>) => void
  addAsset: (asset: Omit<Asset, 'id' | 'createdAt'>) => void
  addPipelineJob: (job: Omit<PipelineJob, 'id' | 'createdAt'>) => void
  updatePipelineJob: (id: string, updates: Partial<PipelineJob>) => void
  setDropdownSelection: (key: string, value: string) => void
  setIsRecording: (recording: boolean) => void
  clearMessages: () => void
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined)

const initialAssets: Asset[] = [
  {
    id: 'asset-1',
    type: 'image',
    title: 'Forest Texture Pack',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    sizeLabel: '24 MB',
    meta: { service: 'image' },
  },
  {
    id: 'asset-2',
    type: 'music',
    title: 'Ambient Soundscape',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    sizeLabel: '12 MB',
    meta: { service: 'music' },
  },
]

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<WorkspaceState>({
    activeService: null,
    chatTab: 'chat',
    messages: [{
      id: generateId(),
      role: 'system',
      text: 'Neural ecosystem initialized. Select a service to begin creating.',
      createdAt: new Date().toISOString(),
    }],
    assets: initialAssets,
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
    setState(prev => ({
      ...prev,
      assets: [...prev.assets, newAsset],
      storageUsed: prev.storageUsed + 1,
    }))
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
      pipelineJobs: prev.pipelineJobs.map(job =>
        job.id === id ? { ...job, ...updates } : job
      ),
    }))
  }, [])

  const setDropdownSelection = useCallback((key: string, value: string) => {
    setState(prev => ({
      ...prev,
      dropdownSelections: { ...prev.dropdownSelections, [key]: value },
    }))
  }, [])

  const setIsRecording = useCallback((recording: boolean) => {
    setState(prev => ({ ...prev, isRecording: recording }))
  }, [])

  const clearMessages = useCallback(() => {
    setState(prev => ({ ...prev, messages: [] }))
  }, [])

  return (
    <WorkspaceContext.Provider
      value={{
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
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider')
  }
  return context
      }
