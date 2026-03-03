'use client'

import { useState, useRef, useEffect } from 'react'
import { Camera, Sparkles } from 'lucide-react'

interface ServiceChatWidgetProps {
  serviceName: string
  agentId: string
  locale?: string
}

type Message = { role: 'user' | 'assistant'; content: string }

const LABELS: Record<string, { agent: string; placeholder: string; send: string; thinking: string }> = {
  en: { agent: 'Agent', placeholder: 'Ask about this service...', send: 'Send', thinking: 'Thinking...' },
  ka: { agent: 'აგენტი', placeholder: 'იკითხე ამ სერვისის შესახებ...', send: 'გაგზავნა', thinking: 'ფიქრობს...' },
  ru: { agent: 'Агент', placeholder: 'Спросите об этом сервисе...', send: 'Отправить', thinking: 'Думает...' },
}

export default function ServiceChatWidget({ serviceName, agentId, locale = 'ka' }: ServiceChatWidgetProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const label = LABELS[locale] ?? LABELS['en']!

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const userMsg: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].slice(-20).map(m => ({ role: m.role, content: m.content })),
          agentId,
          locale,
          context: serviceName,
        }),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const data = await res.json() as { reply?: string; error?: string }
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply ?? 'No response' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Floating Agent button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-24 right-6 z-40 flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-cyan-400 text-[#050510] font-bold text-sm px-5 py-3 rounded-full shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-all hover:scale-105"
        aria-label={`Open ${serviceName} agent chat`}
      >
        <span className="text-lg">◈</span>
        {label.agent} — {serviceName}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-40 right-6 z-50 w-[360px] sm:w-[400px] max-h-[500px] bg-[#0a0a1a] border border-white/[0.1] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <span className="text-cyan-400">◈</span>
              <span className="text-sm font-semibold text-white">{label.agent} — {serviceName}</span>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => navigator.mediaDevices.getUserMedia({ video: true }).catch(() => alert('Access denied'))}
                className="text-white/40 hover:text-cyan-400 transition-colors"
                title="Camera Access"
              >
                <Camera size={16} />
              </button>
              <button 
                 onClick={() => window.open('/services/agent-g', '_blank')}
                 className="text-white/40 hover:text-cyan-400 transition-colors"
                 title="Agent G Service"
              >
                <Sparkles size={16} />
              </button>
              <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white text-lg leading-none">✕</button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[340px]">
            {messages.length === 0 && (
              <p className="text-center text-white/20 text-sm py-8">
                {locale === 'ka' ? `იკითხე ${serviceName}-ის შესახებ...` : locale === 'ru' ? `Спросите об ${serviceName}...` : `Ask about ${serviceName}...`}
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-cyan-500/20 text-cyan-100'
                    : 'bg-white/[0.06] text-white/80'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/[0.06] text-white/40 px-3 py-2 rounded-xl text-sm animate-pulse">
                  {label.thinking}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-white/[0.08] p-3 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder={label.placeholder}
              className="flex-1 bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-cyan-400/40"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="bg-cyan-500 text-[#050510] font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-cyan-400 transition-colors disabled:opacity-30"
            >
              {label.send}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
