'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Camera, Sparkles, X } from 'lucide-react'

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
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const cameraVideoRef = useRef<HTMLVideoElement>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const label = LABELS[locale] ?? LABELS['en']!

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const stopCamera = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach(t => t.stop())
    cameraStreamRef.current = null
    setCameraOn(false)
  }, [])

  useEffect(() => { return () => { stopCamera() } }, [stopCamera])

  const toggleCamera = useCallback(async () => {
    if (cameraOn) { stopCamera(); return }
    setCameraError(null)
    try {
      if (typeof window !== 'undefined' && !window.isSecureContext && !window.location.hostname.includes('localhost')) {
        setCameraError('Camera requires a secure (HTTPS) connection.')
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera is not supported in this browser.')
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      cameraStreamRef.current = stream
      setCameraOn(true)
      setTimeout(() => {
        const vid = cameraVideoRef.current
        if (vid) {
          vid.muted = true
          vid.playsInline = true
          vid.srcObject = stream
          vid.play().catch(() => undefined)
        }
      }, 0)
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraError('Camera permission denied. Enable it in your browser settings.')
      } else if (name === 'NotFoundError') {
        setCameraError('No camera found on this device.')
      } else {
        setCameraError('Camera unavailable. Please try again.')
      }
    }
  }, [cameraOn, stopCamera])

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
                onClick={() => void toggleCamera()}
                className={`transition-colors ${
                  cameraOn
                    ? 'text-cyan-400'
                    : 'text-white/40 hover:text-cyan-400'
                }`}
                title={cameraOn ? 'Close Camera' : 'Camera'}
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

          {/* Camera panel */}
          {(cameraOn || cameraError) && (
            <div className="border-b border-white/[0.08] p-2 space-y-2">
              {cameraOn && (
                <div className="relative rounded-xl overflow-hidden border border-cyan-400/[0.22] shadow-[0_0_20px_rgba(34,211,238,0.10)]">
                  <video
                    ref={cameraVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full max-h-36 object-cover rounded-xl"
                  />
                  <button
                    onClick={stopCamera}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/70 border border-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors backdrop-blur-sm"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/70 border border-red-400/40 px-2 py-0.5 text-[9px] font-semibold text-red-200 backdrop-blur-sm">
                    <span className="w-1 h-1 rounded-full bg-red-400 animate-pulse" />
                    REC
                  </span>
                </div>
              )}
              {cameraError && (
                <p className="text-xs text-red-300/80 px-1">{cameraError}</p>
              )}
            </div>
          )}

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
