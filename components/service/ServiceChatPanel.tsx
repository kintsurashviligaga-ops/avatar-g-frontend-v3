'use client'

import { useState, useRef, useEffect } from 'react'

type ChatLocale = 'ka' | 'en' | 'ru'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ServiceChatLabels {
  welcome: string
  title: string
  placeholder: string
  send: string
  sending: string
  chatFailed: string
  processing: string
  jobCreated: string
  quotaError: string
}

interface Props {
  agentId?: string
  userId?: string
  serviceId?: string
  locale?: ChatLocale
  endpoint?: string
  labels?: Partial<ServiceChatLabels>
  initialMessages?: Message[]
  injectedMessage?: string
  onInjectedMessageConsumed?: () => void
}

const COPY_BY_LOCALE: Record<ChatLocale, ServiceChatLabels> = {
  ka: {
    welcome: 'გამარჯობა. რაში დაგეხმარო ამ პროექტში?',
    title: 'ჩატი',
    placeholder: 'დაწერე შეტყობინება...',
    send: 'გაგზავნა',
    sending: 'იგზავნება...',
    chatFailed: 'ჩატი დროებით მიუწვდომელია. სცადე ხელახლა.',
    processing: 'შეიქმნა. მოთხოვნა მუშავდება...',
    jobCreated: 'დავალება',
    quotaError: 'Agent G დროებით მიუწვდომელია, რადგან AI კვოტა ამოიწურა.',
  },
  en: {
    welcome: 'Hello! How can I help with your project?',
    title: 'Chat',
    placeholder: 'Type a message...',
    send: 'Send',
    sending: 'Sending...',
    chatFailed: 'Chat is temporarily unavailable. Please try again.',
    processing: 'created. Processing your request...',
    jobCreated: 'Job',
    quotaError: 'Agent G is temporarily unavailable because the AI quota has been exceeded.',
  },
  ru: {
    welcome: 'Здравствуйте! Чем помочь с вашим проектом?',
    title: 'Чат',
    placeholder: 'Введите сообщение...',
    send: 'Отправить',
    sending: 'Отправка...',
    chatFailed: 'Чат временно недоступен. Попробуйте снова.',
    processing: 'создана. Запрос обрабатывается...',
    jobCreated: 'Задача',
    quotaError: 'Agent G временно недоступен из-за исчерпанной AI-квоты.',
  },
}

function mapErrorMessage(raw: string, labels: ServiceChatLabels) {
  const normalized = raw.toLowerCase()
  if (normalized.includes('quota') || normalized.includes('rate limit') || normalized.includes('429')) {
    return labels.quotaError
  }
  return raw || labels.chatFailed
}

export function ServiceChatPanel({
  agentId = 'executive-agent-g',
  userId: _userId = 'guest',
  serviceId: _serviceId = 'agent-g',
  locale = 'ka',
  endpoint = '/api/agents/chat',
  labels,
  initialMessages,
  injectedMessage,
  onInjectedMessageConsumed,
}: Props) {
  const activeLocale: ChatLocale = locale === 'en' || locale === 'ru' ? locale : 'ka'
  const t = { ...COPY_BY_LOCALE[activeLocale], ...(labels ?? {}) }

  const [messages, setMessages] = useState<Message[]>(() => {
    if (initialMessages && initialMessages.length > 0) {
      return initialMessages
    }
    return [{ role: 'assistant', content: t.welcome }]
  })
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
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          service_id: _serviceId,
          message: userMessage,
        }),
      })

      let data: Record<string, unknown> = {}
      try {
        data = await res.json()
      } catch {
        data = {}
      }

      if (!res.ok) {
        throw new Error((data.error as string) ?? (data.message as string) ?? t.chatFailed)
      }

      const jobId = typeof data.jobId === 'string' ? data.jobId : null
      const assistantReply =
        (data.reply as string) ??
        (data.message as string) ??
        (jobId ? `${t.jobCreated} ${jobId} ${t.processing}` : t.chatFailed)

      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: assistantReply },
      ])
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : ''
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: mapErrorMessage(rawMessage, t) },
      ])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-white/[0.06]">
        <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider">{t.title}</h3>
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
            placeholder={t.placeholder}
            className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="px-4 py-2 bg-white text-[#050510] text-sm font-semibold rounded-xl hover:bg-white/90 transition-colors disabled:opacity-50"
          >
            {sending ? t.sending : t.send}
          </button>
        </div>
      </div>
    </div>
  )
}
