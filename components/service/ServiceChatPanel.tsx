'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  agentId: string
  userId: string
  serviceId: string
  injectedMessage?: string
  onInjectedMessageConsumed?: () => void
}

export function ServiceChatPanel({ agentId, userId: _userId, serviceId: _serviceId, injectedMessage, onInjectedMessageConsumed }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! How can I help with your project?' },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (injectedMessage) {
      setInput(injectedMessage)
      onInjectedMessageConsumed?.()
    }
  }, [injectedMessage, onInjectedMessageConsumed])

  const send = async () => {
    if (!input.trim() || sending) return
    const userMessage = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setSending(true)

    try {
      const res = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          message: userMessage,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Chat failed')

      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Job ${data.jobId} created. Processing your request...` },
      ])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` },
      ])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-white/[0.06]">
        <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Chat</h3>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`text-sm px-3 py-2 rounded-xl max-w-[85%] ${
              msg.role === 'user'
                ? 'ml-auto bg-white/10 text-white'
                : 'mr-auto bg-white/[0.04] text-white/70'
            }`}
          >
            {msg.content}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/[0.06]">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Type a message..."
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="px-4 py-2 bg-white text-[#050510] text-sm font-semibold rounded-xl hover:bg-white/90 transition-colors disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
