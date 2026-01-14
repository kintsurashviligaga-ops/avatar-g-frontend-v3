'use client'

import React, { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { useWorkspace } from './WorkspaceProvider'
import TopControlPanel from './TopControlPanel'
import LibraryPanel from './LibraryPanel'
import PipelinePanel from './PipelinePanel'
import WorldBuilder from './WorldBuilder'
import BusinessDashboard from './BusinessDashboard'
import WaveformMic from './WaveformMic'
import { formatDate, buildPrompt, getCrossServiceSuggestions } from '@/lib/utils'
import { services } from './Sidebar'

const ChatPanel: React.FC = () => {
  const {
    activeService,
    chatTab,
    setChatTab,
    messages,
    addMessage,
    dropdownSelections,
    isRecording,
    setIsRecording,
  } = useWorkspace()

  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const currentService = services.find(s => s.key === activeService)
  const suggestions = getCrossServiceSuggestions(activeService || '', dropdownSelections)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || !currentService) return

    const promptPreview = buildPrompt(currentService.title, input, dropdownSelections)

    addMessage({
      role: 'user',
      text: input,
      meta: {
        service: currentService.key,
        promptPreview,
        selections: { ...dropdownSelections },
      },
    })

    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: currentService.key,
          userText: input,
          selections: dropdownSelections,
        }),
      })

      const data = await response.json()

      addMessage({
        role: 'assistant',
        text: data.assistantText,
        meta: {
          service: currentService.key,
        },
      })
    } catch (error) {
      addMessage({
        role: 'assistant',
        text: 'Connection error. Please try again.',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleMicClick = () => {
    setIsRecording(!isRecording)
    
    if (!isRecording) {
      setTimeout(() => {
        setIsRecording(false)
        setInput('This is a test transcription from voice input.')
      }, 2000)
    }
  }

  if (activeService === 'game' && chatTab === 'chat') {
    return <WorldBuilder />
  }

  if (activeService === 'business' && chatTab === 'chat') {
    return <BusinessDashboard />
  }

  if (chatTab === 'library') {
    return <LibraryPanel />
  }

  if (chatTab === 'pipeline') {
    return <PipelinePanel />
  }

  return (
    <div className="flex-1 flex flex-col">
      <TopControlPanel />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages
            .filter(m => !m.meta?.service || m.meta.service === activeService || m.role === 'system')
            .map((message, index) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role !== 'user' && (
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-midnight-blue to-deep-navy flex items-center justify-center border border-silver/20">
                    <span className="text-sm font-bold text-silver">A</span>
                  </div>
                )}

                <div className={`flex flex-col gap-2 max-w-2xl ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`rounded-2xl px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-silver/90 text-obsidian'
                        : message.role === 'system'
                        ? 'glass-card border-silver/10 text-silver/70 text-sm'
                        : 'glass-panel text-silver'
                    }`}
                  >
                    <p className="text-sm leading-relaxed">{message.text}</p>
                    
                    {message.meta?.promptPreview && (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-silver/50 hover:text-silver/70">
                          View Prompt Preview
                        </summary>
                        <pre className="mt-2 p-2 bg-black/20 rounded text-xs overflow-x-auto">
                          {message.meta.promptPreview}
                        </pre>
                      </details>
                    )}
                  </div>
                  <span className="text-xs text-silver/40">{formatDate(message.createdAt)}</span>
                </div>

                {message.role === 'user' && (
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center border border-silver/20">
                    <span className="text-sm font-bold text-white">U</span>
                  </div>
                )}
              </motion.div>
            ))}
          
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-4 justify-start"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-midnight-blue to-deep-navy flex items-center justify-center border border-silver/20">
                <span className="text-sm font-bold text-silver">A</span>
              </div>
              <div className="glass-panel rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-silver/50 animate-pulse"></div>
                  <div className="w-2 h-2 rounded-full bg-silver/50 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 rounded-full bg-silver/50 animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </motion.div>
          )}

          {suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-xl p-4 border-blue-500/20"
            >
              <div className="flex items-start gap-3">
                <span className="text-xl">💡</span>
                <div>
                  <p className="text-xs font-semibold text-silver/70 mb-2">Cross-Service Suggestions</p>
                  <div className="space-y-1">
                    {suggestions.map((suggestion, i) => (
                      <p key={i} className="text-xs text-silver/60">{suggestion}</p>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="glass-panel border-t border-silver/10 p-4">
          <div className="flex gap-3">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,audio/*,video/*"
            />
            
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 w-10 h-10 glass-card rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <svg className="w-5 h-5 text-silver/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder={`Message ${currentService?.title || 'Avatar G'}...`}
              className="flex-1 glass-card px-4 py-3 text-sm text-silver placeholder-silver/30 focus:outline-none focus:ring-2 focus:ring-silver/20 rounded-lg"
              disabled={isLoading}
            />

            <WaveformMic isRecording={isRecording} onClick={handleMicClick} />

            <Button onClick={handleSend} disabled={!input.trim() || isLoading} size="lg">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChatPanel
