'use client'

/**
 * LandingChatSection — embedded Agent G chat panel for the landing page.
 *
 * This is the main entry point to Agent G on the homepage.
 * Shows as a contained section with welcome state, quick actions, and 
 * a functional composer. When the user sends a message, it expands to
 * show the conversation inline. Has a "Go fullscreen" button to navigate 
 * to the dedicated Agent G page.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { CHAT_LABELS, QUICK_ACTIONS, type ChatLocale } from './config'
import type {
  FCMessage,
  FCUserMessage,
  FCAgentMessage,
  FCSystemMessage,
  FCAttachment,
  VoiceStatus,
} from './types'
import { MessageList } from './MessageList'
import { UploadPreviewTray } from './UploadPreviewTray'
import { ChatComposer } from './ChatComposer'

/* ── helpers ── */
const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()

function detectAttachmentKind(mime: string): FCAttachment['kind'] {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'document'
}

type ApiReply = {
  reply: string
  tone?: { mood: string; confidence: number }
  meta?: { detectedEmotion: string; styleHints: string[]; voiceHint: string }
}

const SECTION_LABELS = {
  en: {
    eyebrow: 'AI Assistant',
    title: 'Talk to Agent G',
    sub: 'Your AI coordinator — ask anything, create content, or let Agent G handle complex multi-service tasks for you.',
    fullscreen: 'Open fullscreen',
  },
  ka: {
    eyebrow: 'AI ასისტენტი',
    title: 'ესაუბრეთ Agent G-ს',
    sub: 'თქვენი AI კოორდინატორი — იკითხეთ რაც გსურთ, შექმენით კონტენტი ან მიანდეთ Agent G-ს რთული ამოცანები.',
    fullscreen: 'სრულ ეკრანზე',
  },
  ru: {
    eyebrow: 'AI Ассистент',
    title: 'Поговорите с Agent G',
    sub: 'Ваш AI-координатор — задавайте вопросы, создавайте контент или поручите Agent G сложные задачи.',
    fullscreen: 'На весь экран',
  },
} as const

export function LandingChatSection() {
  const router = useRouter()
  const pathname = usePathname()
  const { language } = useLanguage()
  const lang = (language as ChatLocale) || 'en'
  const labels = CHAT_LABELS[lang] || CHAT_LABELS.en
  const section = SECTION_LABELS[lang] || SECTION_LABELS.en

  /* ── state ── */
  const [messages, setMessages] = useState<FCMessage[]>([])
  const [composerText, setComposerText] = useState('')
  const [attachments, setAttachments] = useState<FCAttachment[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle')
  const [speechModeOn, setSpeechModeOn] = useState(false)
  const [sessionId] = useState(() => uid())

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const speechSynth = typeof window !== 'undefined' ? window.speechSynthesis : null

  const locale = pathname?.startsWith('/en') ? 'en' : pathname?.startsWith('/ru') ? 'ru' : 'ka'
  const hasMessages = messages.length > 0

  /* ── SEND FLOW ── */
  const sendMessage = useCallback(async (text: string, files: FCAttachment[]) => {
    if (!text.trim() && files.length === 0) return

    const userMsg: FCUserMessage = {
      id: uid(), role: 'user', text: text.trim(), attachments: files, createdAt: now(), status: 'sending',
    }
    const systemMsg: FCSystemMessage = {
      id: uid(), role: 'system', statusType: 'processing', text: labels.processing, createdAt: now(),
    }

    setMessages(prev => [...prev, userMsg, systemMsg])
    setComposerText('')
    setAttachments([])
    setIsSubmitting(true)

    try {
      const res = await fetch('/api/agent-g/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), locale, sessionId }),
      })
      if (!res.ok) throw new Error(`API ${res.status}`)

      const data: ApiReply = await res.json()
      const agentMsg: FCAgentMessage = {
        id: uid(), role: 'agent', text: data.reply, createdAt: now(), isStreaming: false,
        suggestions: data.meta?.styleHints?.slice(0, 3),
      }

      setMessages(prev =>
        prev.map(m => (m.id === userMsg.id ? { ...m, status: 'sent' as const } : m))
          .filter(m => m.id !== systemMsg.id).concat(agentMsg)
      )

      if (speechModeOn && speechSynth) {
        const u = new SpeechSynthesisUtterance(data.reply)
        u.lang = locale === 'ka' ? 'ka-GE' : locale === 'ru' ? 'ru-RU' : 'en-US'
        speechSynth.speak(u)
      }
    } catch {
      setMessages(prev =>
        prev.map(m => (m.id === userMsg.id ? { ...m, status: 'failed' as const } : m))
          .filter(m => m.id !== systemMsg.id)
          .concat({ id: uid(), role: 'system', statusType: 'error', text: labels.error, createdAt: now() })
      )
    } finally {
      setIsSubmitting(false)
    }
  }, [locale, sessionId, labels, speechModeOn, speechSynth])

  const handleSend = useCallback(() => { sendMessage(composerText, attachments) }, [composerText, attachments, sendMessage])

  const handleQuickAction = useCallback((intent: string, prefill?: string) => {
    if (prefill) sendMessage(prefill, [])
    else setComposerText(intent.replace(/_/g, ' '))
  }, [sendMessage])

  const handleAttach = useCallback(() => { fileInputRef.current?.click() }, [])
  const handleCamera = useCallback(() => { cameraInputRef.current?.click() }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    setAttachments(prev => [...prev, ...Array.from(files).map(f => ({
      id: uid(), kind: detectAttachmentKind(f.type), fileName: f.name, mimeType: f.type,
      localPreviewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined, size: f.size,
    }))])
    e.target.value = ''
  }, [])

  const handleCameraChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || !files[0]) return
    const f = files[0]
    setAttachments(prev => [...prev, {
      id: uid(), kind: 'image' as const, fileName: f.name || 'camera-photo.jpg', mimeType: f.type || 'image/jpeg',
      localPreviewUrl: URL.createObjectURL(f), size: f.size,
    }])
    e.target.value = ''
  }, [])

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const r = prev.find(a => a.id === id)
      if (r?.localPreviewUrl) URL.revokeObjectURL(r.localPreviewUrl)
      return prev.filter(a => a.id !== id)
    })
  }, [])

  /* ── VOICE ── */
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const handleVoice = useCallback(() => {
    if (voiceStatus === 'listening') { recognitionRef.current?.stop(); setVoiceStatus('idle'); return }
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition as typeof window.SpeechRecognition | undefined
      ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition as typeof window.SpeechRecognition | undefined
    if (!SR) { setVoiceStatus('error'); setTimeout(() => setVoiceStatus('idle'), 2000); return }
    setVoiceStatus('requesting_permission')
    const rec = new SR(); rec.continuous = false; rec.interimResults = false
    rec.lang = locale === 'ka' ? 'ka-GE' : locale === 'ru' ? 'ru-RU' : 'en-US'
    rec.onstart = () => setVoiceStatus('listening')
    rec.onresult = (ev) => { const t = ev.results[0]?.[0]?.transcript; if (t) setComposerText(p => (p ? p + ' ' : '') + t); setVoiceStatus('idle') }
    rec.onerror = () => { setVoiceStatus('error'); setTimeout(() => setVoiceStatus('idle'), 2000) }
    rec.onend = () => setVoiceStatus(p => p === 'listening' ? 'idle' : p)
    recognitionRef.current = rec; rec.start()
  }, [voiceStatus, locale])

  const handleSpeechModeToggle = useCallback(() => {
    setSpeechModeOn(prev => { if (prev && speechSynth) speechSynth.cancel(); return !prev })
  }, [speechSynth])

  useEffect(() => () => {
    attachments.forEach(a => { if (a.localPreviewUrl) URL.revokeObjectURL(a.localPreviewUrl) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section className="relative px-4 sm:px-6 lg:px-10 py-16 sm:py-24 overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(6,182,212,0.06) 0%, transparent 70%)' }} />

      <div className="relative max-w-3xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-8 sm:mb-10">
          <p className="text-[11px] tracking-[0.25em] uppercase font-medium mb-3" style={{ color: 'var(--color-accent)' }}>
            {section.eyebrow}
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4" style={{ color: 'var(--color-text)' }}>
            {section.title}
          </h2>
          <p className="text-base sm:text-lg leading-[1.7] max-w-xl mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
            {section.sub}
          </p>
        </div>

        {/* Chat card */}
        <div
          className="rounded-3xl overflow-hidden flex flex-col"
          style={{
            backgroundColor: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 8px 48px rgba(0,0,0,0.25), 0 0 1px rgba(255,255,255,0.08) inset',
            minHeight: hasMessages ? '480px' : 'auto',
            maxHeight: '600px',
          }}
        >
          {/* Chat header bar inside card */}
          <div className="flex items-center justify-between px-5 py-3.5 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ backgroundColor: 'var(--color-accent)' }} />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'var(--color-accent)' }} />
              </span>
              <h3 className="text-base font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>
                Agent G
              </h3>
            </div>
            <button
              onClick={() => router.push(`/${language}/services/agent-g`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200 hover:opacity-80"
              style={{ color: 'var(--color-accent)', backgroundColor: 'var(--color-accent-soft)', border: '1px solid var(--color-border)' }}
            >
              {section.fullscreen}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          </div>

          {/* Messages or Welcome */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {hasMessages ? (
              <MessageList messages={messages} />
            ) : (
              /* Inline welcome — compact version */
              <div className="px-5 sm:px-6 py-8 sm:py-10">
                <p className="text-sm font-medium mb-1.5" style={{ color: 'var(--color-accent)' }}>
                  {labels.greeting} 👋
                </p>
                <p className="text-xl sm:text-2xl font-bold tracking-tight mb-2" style={{ color: 'var(--color-text)' }}>
                  {labels.heading}
                </p>
                <p className="text-sm mb-6" style={{ color: 'var(--color-text-tertiary)' }}>
                  {labels.helper}
                </p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_ACTIONS.map(action => {
                    const label = action.label[lang] || action.label.en
                    const prefill = action.prefillPrompt?.[lang] || action.prefillPrompt?.en
                    return (
                      <button
                        key={action.id}
                        onClick={() => handleQuickAction(action.intent, prefill)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12px] sm:text-[13px] font-medium transition-all duration-200 active:scale-[0.97]"
                        style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                      >
                        <span className="text-sm">{action.icon}</span>
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Upload preview tray */}
          {attachments.length > 0 && (
            <UploadPreviewTray attachments={attachments} onRemove={handleRemoveAttachment} />
          )}

          {/* Composer */}
          <ChatComposer
            value={composerText}
            onChange={setComposerText}
            onSend={handleSend}
            onAttach={handleAttach}
            onCamera={handleCamera}
            onVoice={handleVoice}
            onSpeechModeToggle={handleSpeechModeToggle}
            isSubmitting={isSubmitting}
            voiceStatus={voiceStatus}
            speechModeOn={speechModeOn}
            attachments={attachments}
          />
        </div>
      </div>

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" className="hidden" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt" onChange={handleFileChange} />
      <input ref={cameraInputRef} type="file" className="hidden" accept="image/*" capture="environment" onChange={handleCameraChange} />
    </section>
  )
}
