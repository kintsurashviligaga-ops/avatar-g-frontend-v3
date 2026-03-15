'use client'

/**
 * ChatScreen — main fullscreen orchestrator.
 *
 * Manages: messages[], attachments[], voice, camera, API calls, speech mode.
 * Renders: ChatHeader → ChatWelcome | MessageList → UploadPreviewTray → ChatComposer
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { CHAT_LABELS, type ChatLocale } from './config'
import type {
  FCMessage,
  FCUserMessage,
  FCAgentMessage,
  FCSystemMessage,
  FCAttachment,
  VoiceStatus,
} from './types'
import { ChatHeader } from './ChatHeader'
import { ChatWelcome } from './ChatWelcome'
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

/* ── types ── */
type ApiReply = {
  reply: string
  tone?: { mood: string; confidence: number }
  meta?: { detectedEmotion: string; styleHints: string[]; voiceHint: string }
}

export function ChatScreen() {
  const pathname = usePathname()
  const { language } = useLanguage()
  const lang = (language as ChatLocale) || 'en'
  const labels = CHAT_LABELS[lang] || CHAT_LABELS.en

  /* ── state ── */
  const [messages, setMessages] = useState<FCMessage[]>([])
  const [composerText, setComposerText] = useState('')
  const [attachments, setAttachments] = useState<FCAttachment[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle')
  const [speechModeOn, setSpeechModeOn] = useState(false)
  const [sessionId] = useState(() => uid())

  // Refs for file pickers
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  // TTS ref
  const speechSynth = typeof window !== 'undefined' ? window.speechSynthesis : null

  /* ── locale from path ── */
  const locale = pathname?.startsWith('/en') ? 'en' : pathname?.startsWith('/ru') ? 'ru' : 'ka'

  /* ── SEND FLOW ── */
  const sendMessage = useCallback(async (text: string, files: FCAttachment[]) => {
    if (!text.trim() && files.length === 0) return

    const userMsg: FCUserMessage = {
      id: uid(),
      role: 'user',
      text: text.trim(),
      attachments: files,
      createdAt: now(),
      status: 'sending',
    }

    const systemMsg: FCSystemMessage = {
      id: uid(),
      role: 'system',
      statusType: 'processing',
      text: labels.processing,
      createdAt: now(),
    }

    setMessages(prev => [...prev, userMsg, systemMsg])
    setComposerText('')
    setAttachments([])
    setIsSubmitting(true)

    try {
      const res = await fetch('/api/agent-g/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          locale,
          sessionId,
        }),
      })

      if (!res.ok) throw new Error(`API ${res.status}`)

      const data: ApiReply = await res.json()

      const agentMsg: FCAgentMessage = {
        id: uid(),
        role: 'agent',
        text: data.reply,
        createdAt: now(),
        isStreaming: false,
        suggestions: data.meta?.styleHints?.slice(0, 3),
      }

      // Mark user message as sent, remove processing system message, add agent reply
      setMessages(prev =>
        prev
          .map(m => (m.id === userMsg.id ? { ...m, status: 'sent' as const } : m))
          .filter(m => m.id !== systemMsg.id)
          .concat(agentMsg)
      )

      // TTS if speech mode is on
      if (speechModeOn && speechSynth) {
        const utterance = new SpeechSynthesisUtterance(data.reply)
        utterance.lang = locale === 'ka' ? 'ka-GE' : locale === 'ru' ? 'ru-RU' : 'en-US'
        speechSynth.speak(utterance)
      }
    } catch {
      const errorMsg: FCSystemMessage = {
        id: uid(),
        role: 'system',
        statusType: 'error',
        text: labels.error,
        createdAt: now(),
      }

      setMessages(prev =>
        prev
          .map(m => (m.id === userMsg.id ? { ...m, status: 'failed' as const } : m))
          .filter(m => m.id !== systemMsg.id)
          .concat(errorMsg)
      )
    } finally {
      setIsSubmitting(false)
    }
  }, [locale, sessionId, labels, speechModeOn, speechSynth])

  /* ── SEND HANDLER ── */
  const handleSend = useCallback(() => {
    sendMessage(composerText, attachments)
  }, [composerText, attachments, sendMessage])

  /* ── QUICK ACTION ── */
  const handleQuickAction = useCallback((intent: string, prefill?: string) => {
    if (prefill) {
      // Directly send the prefill prompt
      sendMessage(prefill, [])
    } else {
      // Just set the composer text for the intent (text + workflow)
      setComposerText(intent.replace(/_/g, ' '))
    }
  }, [sendMessage])

  /* ── ATTACH FILE ── */
  const handleAttach = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const newAttachments: FCAttachment[] = Array.from(files).map(f => ({
      id: uid(),
      kind: detectAttachmentKind(f.type),
      fileName: f.name,
      mimeType: f.type,
      localPreviewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
      size: f.size,
    }))
    setAttachments(prev => [...prev, ...newAttachments])
    // Reset input so same file can be re-selected
    e.target.value = ''
  }, [])

  /* ── CAMERA ── */
  const handleCamera = useCallback(() => {
    cameraInputRef.current?.click()
  }, [])

  const handleCameraChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const f = files[0]
    if (!f) return
    const att: FCAttachment = {
      id: uid(),
      kind: 'image',
      fileName: f.name || 'camera-photo.jpg',
      mimeType: f.type || 'image/jpeg',
      localPreviewUrl: URL.createObjectURL(f),
      size: f.size,
    }
    setAttachments(prev => [...prev, att])
    e.target.value = ''
  }, [])

  /* ── REMOVE ATTACHMENT ── */
  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const removed = prev.find(a => a.id === id)
      if (removed?.localPreviewUrl) URL.revokeObjectURL(removed.localPreviewUrl)
      return prev.filter(a => a.id !== id)
    })
  }, [])

  /* ── VOICE (speech-to-text) ── */
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const handleVoice = useCallback(() => {
    // Toggle off if currently listening
    if (voiceStatus === 'listening') {
      recognitionRef.current?.stop()
      setVoiceStatus('idle')
      return
    }

    const SpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition as typeof window.SpeechRecognition | undefined
      ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition as typeof window.SpeechRecognition | undefined

    if (!SpeechRecognition) {
      setVoiceStatus('error')
      setTimeout(() => setVoiceStatus('idle'), 2000)
      return
    }

    setVoiceStatus('requesting_permission')

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = locale === 'ka' ? 'ka-GE' : locale === 'ru' ? 'ru-RU' : 'en-US'

    recognition.onstart = () => setVoiceStatus('listening')
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript
      if (transcript) {
        setComposerText(prev => (prev ? prev + ' ' : '') + transcript)
      }
      setVoiceStatus('idle')
    }
    recognition.onerror = () => {
      setVoiceStatus('error')
      setTimeout(() => setVoiceStatus('idle'), 2000)
    }
    recognition.onend = () => {
      setVoiceStatus(prev => prev === 'listening' ? 'idle' : prev)
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [voiceStatus, locale])

  /* ── SPEECH MODE TOGGLE (TTS) ── */
  const handleSpeechModeToggle = useCallback(() => {
    setSpeechModeOn(prev => {
      if (prev && speechSynth) speechSynth.cancel()
      return !prev
    })
  }, [speechSynth])

  /* ── Clean up preview URLs on unmount ── */
  useEffect(() => {
    return () => {
      attachments.forEach(a => {
        if (a.localPreviewUrl) URL.revokeObjectURL(a.localPreviewUrl)
      })
    }
    // Only run on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="w-full flex items-center justify-center"
      style={{
        height: '100dvh',
        backgroundColor: 'var(--color-bg)',
      }}
    >
      {/* 9:16 phone frame on desktop, full viewport on mobile */}
      <div
        className="
          flex flex-col w-full h-full
          md:w-[420px] md:max-h-[calc(100dvh-48px)] md:h-[746px]
          md:rounded-3xl md:overflow-hidden
          md:shadow-[0_16px_80px_rgba(0,0,0,0.45),0_0_1px_rgba(255,255,255,0.1)_inset]
        "
        style={{
          backgroundColor: 'var(--color-bg)',
          border: undefined,
        }}
      >
        {/* Visible border only on desktop frame */}
        <div
          className="flex flex-col w-full h-full md:border md:rounded-3xl md:overflow-hidden"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <ChatHeader />

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {messages.length === 0 ? (
              <ChatWelcome onQuickAction={handleQuickAction} />
            ) : (
              <MessageList messages={messages} />
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
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={handleCameraChange}
      />
    </div>
  )
}
