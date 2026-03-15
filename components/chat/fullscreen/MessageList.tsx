'use client'

/**
 * MessageList — renders all chat messages with auto-scroll.
 * Supports user bubbles, agent bubbles, system status cards, and result cards.
 */

import { useRef, useEffect } from 'react'
import type { FCMessage } from './types'
import { UserBubble } from './UserBubble'
import { AgentBubble } from './AgentBubble'
import { SystemStatusCard } from './SystemStatusCard'
import { ResultCard } from './ResultCard'

interface Props {
  messages: FCMessage[]
}

export function MessageList({ messages }: Props) {
  const endRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, messages[messages.length - 1]?.role === 'agent' ? (messages[messages.length - 1] as { text?: string }).text : ''])

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
      <div className="max-w-2xl mx-auto space-y-3 sm:space-y-4">
        {messages.map(msg => {
          switch (msg.role) {
            case 'user':
              return <UserBubble key={msg.id} message={msg} />
            case 'agent':
              return <AgentBubble key={msg.id} message={msg} />
            case 'system':
              return <SystemStatusCard key={msg.id} message={msg} />
            case 'result':
              return <ResultCard key={msg.id} message={msg} />
            default:
              return null
          }
        })}
        <div ref={endRef} />
      </div>
    </div>
  )
}
