'use client'

import { useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

type Attachment = {
  id: string
  name: string
  type: string
  size: number
}

export default function AIProductionPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'user',
      content: 'Of course. Please send over the documies visuals in your summary.',
      timestamp: new Date(Date.now() - 120000)
    },
    {
      id: '2',
      role: 'user',
      content: 'Here are the reports. Please include data visuals in your summary.',
      timestamp: new Date(Date.now() - 60000)
    },
    {
      id: '3',
      role: 'assistant',
      content: "Understood. I'll generate a strategic summary with charts & graphs.",
      timestamp: new Date()
    }
  ])
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 112) + 'px'
    }
  }, [input])

  const handleSend = () => {
    if (!input.trim() && attachments.length === 0) return
    
    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }
    
    setMessages(prev => [...prev, newMessage])
    setInput('')
    setAttachments([])
    
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Processing your request...',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, aiResponse])
    }, 800)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const newAttachments = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      type: file.type,
      size: file.size
    }))
    setAttachments(prev => [...prev, ...newAttachments])
  }

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="min-h-screen bg-[#0a0e14] pb-24">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.08),transparent_50%)] pointer-events-none" />
      
      <div className="relative min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center px-3 py-6">
          <div className="w-full max-w-2xl flex flex-col h-[calc(100dvh-120px)] min-h-0">
            
            <div className="bg-gradient-to-b from-[#2a2e3a] to-[#23272f] border border-white/10 rounded-t-2xl px-5 py-4 flex items-center justify-between shrink-0 shadow-lg">
              <button
                onClick={() => router.push('/')}
                className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-colors active:scale-95"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              
              <div className="flex-1 px-4">
                <h1 className="text-base font-semibold text-white tracking-wide">Avatar G</h1>
                <p className="text-xs text-white/50 tracking-wider">Executive AI Console</p>
              </div>
              
              <div className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-medium text-emerald-400">Active</span>
              </div>
            </div>

            <div className="flex-1 min-h-0 bg-[#1a1e28] border-x border-white/5 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className="bg-[#23272f] border border-white/5 rounded-xl px-4 py-3 shadow-sm"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-white/90">
                        {msg.role === 'user' ? 'User' : 'Avatar G'}
                      </span>
                      <span className="text-white/30">›</span>
                      <span className="text-xs text-white/40">You</span>
                      <span className="text-white/30">›</span>
                    </div>
                    <p className="text-sm text-white/85 leading-relaxed break-words">{msg.content}</p>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="shrink-0 bg-[#1a1e28] border-x border-b border-white/10 rounded-b-2xl shadow-xl">
              {attachments.length > 0 && (
                <div className="px-4 pt-3 pb-2">
                  <div className="flex flex-wrap gap-2 max-h-16 overflow-y-auto">
                    {attachments.map((att) => (
                      <div
                        key={att.id}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white/70 max-w-full min-w-0"
                      >
                        <span className="truncate">{att.name}</span>
                        <button
                          onClick={() => removeAttachment(att.id)}
                          className="shrink-0 w-4 h-4 flex items-center justify-center text-white/50 hover:text-white/90 hover:bg-white/10 rounded transition-colors"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="px-3 py-3 flex items-end gap-2 min-w-0">
                <div className="shrink-0 flex gap-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-10 h-10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/5 rounded-xl border border-white/10 transition-all active:scale-95"
                    aria-label="Attach file"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  </button>
                  
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    className="w-10 h-10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/5 rounded-xl border border-white/10 transition-all active:scale-95"
                    aria-label="Attach image"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </button>
                  
                  <button
                    className="w-10 h-10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/5 rounded-xl border border-white/10 transition-all active:scale-95"
                    aria-label="Voice input"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    placeholder="Ask Avatar G anything..."
                    rows={1}
                    className="w-full min-h-[40px] max-h-28 px-4 py-2.5 bg-[#23272f] border border-white/10 rounded-xl text-sm text-white placeholder-white/40 resize-none outline-none focus:border-white/20 transition-colors overflow-y-auto"
                    style={{ scrollbarWidth: 'thin' }}
                  />
                </div>

                <button
                  onClick={handleSend}
                  disabled={!input.trim() && attachments.length === 0}
                  className="shrink-0 w-10 h-10 flex items-center justify-center bg-gradient-to-br from-violet-500 to-blue-500 text-white rounded-xl shadow-lg disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-violet-500/25 transition-all active:scale-95"
                  aria-label="Send message"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[#0a0e14] via-[#0a0e14] to-transparent pt-8 pb-4 px-3">
          <div className="grid grid-cols-4 gap-2 max-w-2xl mx-auto">
            {[
              { name: 'Avatar\nBuilder', emoji: '🧍', color: 'from-cyan-500/20 to-blue-500/20', border: 'cyan-500/30', href: '/avatar-builder' },
              { name: 'Music\nStudio', emoji: '🎵', color: 'from-pink-500/20 to-purple-500/20', border: 'pink-500/30', href: '/music-studio' },
              { name: 'Image\nArchitect', emoji: '🖼', color: 'from-amber-500/20 to-orange-500/20', border: 'amber-500/30', href: '/image-architect' },
              { name: 'Video\nCine-Lab', emoji: '🎬', color: 'from-violet-500/20 to-purple-500/20', border: 'violet-500/30', href: '/video-cine-lab' },
              { name: 'Business\nAgent', emoji: '🏢', color: 'from-emerald-500/20 to-teal-500/20', border: 'emerald-500/30', href: '/business-agent' },
              { name: 'Game\nForge', emoji: '🎮', color: 'from-red-500/20 to-rose-500/20', border: 'red-500/30', href: '/game-forge' },
              { name: 'Voice\nLab', emoji: '🎙', color: 'from-blue-500/20 to-indigo-500/20', border: 'blue-500/30', href: '/voice-lab' },
              { name: 'Prompt\nBuilder', emoji: '✨', color: 'from-yellow-500/20 to-amber-500/20', border: 'yellow-500/30', href: '/prompt-builder' },
            ].map((service, i) => (
              <button
                key={i}
                onClick={() => router.push(service.href)}
                className={`aspect-square bg-gradient-to-br ${service.color} backdrop-blur-sm border border-${service.border} rounded-xl flex flex-col items-center justify-center gap-1 hover:scale-105 transition-transform active:scale-95 shadow-lg`}
              >
                <span className="text-2xl">{service.emoji}</span>
                <span className="text-[9px] text-white/70 font-medium text-center leading-tight whitespace-pre-line">{service.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
