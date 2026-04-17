'use client'

/**
 * AgentGChatInterface — Dedicated chat interface for Agent G.
 * Shows message bubbles, service routing visualization,
 * job creation status, and real-time updates.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { AgentIndicator } from '@/components/ui/AgentIndicator'

type Message = {
  id: string
  role: 'user' | 'agent'
  content: string
  timestamp: Date
  jobs?: JobInfo[]
}

type JobInfo = {
  id: string
  service: string
  serviceIcon: string
  status: 'queued' | 'processing' | 'done' | 'failed'
}

interface AgentGChatInterfaceProps {
  locale: string
  initialQuery?: string
}

export function AgentGChatInterface({ locale, initialQuery }: AgentGChatInterfaceProps) {
  const t = useTranslations('agentG')
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'agent',
      content: t('welcome'),
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState(initialQuery ?? '')
  const [isThinking, setIsThinking] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isThinking])

  // Auto-submit initial query
  useEffect(() => {
    if (initialQuery?.trim()) {
      handleSend(initialQuery.trim())
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || isThinking) return

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: msg,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsThinking(true)

    // Simulate Agent G response (replace with real API call to /api/agent)
    await new Promise(r => setTimeout(r, 1500))

    const agentResponse: Message = {
      id: `agent-${Date.now()}`,
      role: 'agent',
      content: `I'll help you with "${msg}". Let me route this to the appropriate service.`,
      timestamp: new Date(),
      jobs: [
        {
          id: `job-${Date.now()}`,
          service: 'image',
          serviceIcon: '🖼️',
          status: 'queued',
        },
      ],
    }

    setMessages(prev => [...prev, agentResponse])
    setIsThinking(false)
  }, [input, isThinking])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--color-bg-deep, #0a0a0f)' }}>
      {/* Header */}
      <div
        className="shrink-0 flex items-center gap-3 px-5 py-3"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
          style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(124,58,237,0.15))' }}
        >
          🤖
        </div>
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
            {t('title')}
            <AgentIndicator status={isThinking ? 'working' : 'idle'} />
          </h2>
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{t('subtitle')}</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map(msg => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className="max-w-[80%] rounded-2xl px-4 py-3 space-y-2"
                style={{
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg, rgba(0,212,255,0.12), rgba(124,58,237,0.12))'
                    : 'var(--color-bg-card)',
                  border: `1px solid ${msg.role === 'user' ? 'rgba(0,212,255,0.2)' : 'var(--color-border)'}`,
                }}
              >
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text)' }}>
                  {msg.content}
                </p>

                {/* Job routing cards */}
                {msg.jobs?.map(job => (
                  <div
                    key={job.id}
                    className="flex items-center gap-3 rounded-xl px-3 py-2 mt-2"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)' }}
                    data-testid="agent-job-status"
                  >
                    <span className="text-lg">{job.serviceIcon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium capitalize" style={{ color: 'var(--color-text)' }}>
                        {t('routingTo')} {job.service}
                      </p>
                      <p className="text-[10px]" style={{ color: 'var(--color-muted)' }}>
                        {t('jobCreated')}
                      </p>
                    </div>
                    <StatusBadge status={job.status} locale={locale} />
                  </div>
                ))}

                <p className="text-[10px]" style={{ color: 'var(--color-muted)' }}>
                  {msg.timestamp.toLocaleTimeString(locale === 'ka' ? 'ka-GE' : locale === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Thinking indicator */}
        {isThinking && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div
              className="rounded-2xl px-4 py-3 flex items-center gap-2"
              style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-[#00d4ff] animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-[#00d4ff] animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-[#00d4ff] animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{t('thinking')}</span>
            </div>
          </motion.div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 px-5 py-4" style={{ borderTop: '1px solid var(--color-border)' }}>
        <div
          className="relative rounded-2xl border transition-all duration-300 focus-within:border-[rgba(0,212,255,0.35)] focus-within:shadow-[0_0_24px_rgba(0,212,255,0.08)]"
          style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('inputPlaceholder')}
            rows={1}
            disabled={isThinking}
            className="w-full bg-transparent resize-none px-4 py-3 pr-14 text-sm outline-none disabled:opacity-50"
            style={{ color: 'var(--color-text)', minHeight: 48, maxHeight: 120 }}
            data-testid="command-bar-input"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isThinking}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 hover:brightness-110 active:scale-95 disabled:opacity-30"
            style={{ background: 'linear-gradient(135deg, #00d4ff, #7c3aed)', color: '#fff' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
          </button>
        </div>
      </div>
    </div>
  )
}
