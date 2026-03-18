'use client'

/**
 * ServiceChatLayout — Main orchestrator for every service workspace.
 *
 * Manages: messages[], toolValues, menu state, API calls.
 * Renders: ServiceHeader → ServiceQuickActions | ServiceWelcome | MessageList
 *          → ServiceToolPanel → CrossServiceTransfer → ServiceComposer
 * Portal-rendered at z-[9999] to escape stacking contexts (matching ChatScreen pattern).
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageContext'

import { getServiceWorkspaceConfig, type ServiceWorkspaceConfig } from '@/lib/services/workspace-config'
import { ServiceHeader } from './ServiceHeader'
import { ServiceHamburgerMenu } from './ServiceHamburgerMenu'
import { ServiceQuickActions } from './ServiceQuickActions'
import { ServiceWelcome } from './ServiceWelcome'
import { ServiceComposer } from './ServiceComposer'
import { ServiceToolPanel } from './ServiceToolPanel'
import { CrossServiceTransfer } from './CrossServiceTransfer'
import { ServiceOutputCard } from './ServiceOutputCard'
import { getServiceEnvironmentStyle } from '@/components/ui/PageEnvironment'

/* ── helpers ── */
const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()

/* ── message types ── */
export interface ServiceMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  status?: 'sending' | 'sent' | 'failed'
  isStreaming?: boolean
  /** Service routing hint from Agent G */
  suggestedService?: string
  /** Output type hint */
  outputType?: 'avatar' | 'image' | 'video' | 'music' | 'text' | 'workflow' | 'result'
}

/* ── props ── */
interface ServiceChatLayoutProps {
  serviceId: string
  serviceName: string
  serviceIcon: string
  agentId: string
  locale: string
  features: string[]
  description: string
  isAuthenticated: boolean
  demoMode: boolean
}

export default function ServiceChatLayout({
  serviceId,
  serviceName,
  serviceIcon,
  agentId,
  locale,
  features,
  description,
  isAuthenticated,
  demoMode,
}: ServiceChatLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { language } = useLanguage()

  /* ── workspace config ── */
  const config = getServiceWorkspaceConfig(serviceId)

  /* ── state ── */
  const [messages, setMessages] = useState<ServiceMessage[]>([])
  const [composerText, setComposerText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [toolValues, setToolValues] = useState<Record<string, string>>({})
  const [outputReady, setOutputReady] = useState(false)
  const [sessionId] = useState(() => uid())

  /* ── portal target ── */
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  useEffect(() => { setPortalTarget(document.body) }, [])

  /* ── scroll ref ── */
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    })
  }, [])

  /* ── file input refs ── */
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  /* ═══════════════════════════════════════════════════
     SEND MESSAGE
     ═══════════════════════════════════════════════════ */
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return

    const userMsg: ServiceMessage = { id: uid(), role: 'user', content: text.trim(), createdAt: now(), status: 'sending' }
    const sysMsg: ServiceMessage = { id: uid(), role: 'system', content: '⏳', createdAt: now() }

    setMessages(prev => [...prev, userMsg, sysMsg])
    setComposerText('')
    setIsSubmitting(true)
    scrollToBottom()

    try {
      // Build history
      const history = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-10)
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

      // Build tool context string
      const toolContext = Object.entries(toolValues)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')

      const res = await fetch('/api/agent-g/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: toolContext
            ? `[Service: ${serviceId}] [Settings: ${toolContext}] ${text.trim()}`
            : `[Service: ${serviceId}] ${text.trim()}`,
          locale,
          sessionId,
          context: {
            currentPage: pathname || undefined,
            activeService: serviceId,
          },
          history,
        }),
      })

      if (!res.ok) throw new Error(`API ${res.status}`)

      const data = await res.json()

      const assistantMsg: ServiceMessage = {
        id: uid(),
        role: 'assistant',
        content: data.reply || data.message || 'Done.',
        createdAt: now(),
        suggestedService: data.meta?.suggestedService,
        outputType: data.meta?.outputType,
      }

      setMessages(prev =>
        prev
          .map(m => (m.id === userMsg.id ? { ...m, status: 'sent' as const } : m))
          .filter(m => m.id !== sysMsg.id)
          .concat(assistantMsg)
      )
      setOutputReady(true)
    } catch {
      const errMsg: ServiceMessage = { id: uid(), role: 'system', content: '❌ Error — please try again.', createdAt: now() }
      setMessages(prev =>
        prev
          .map(m => (m.id === userMsg.id ? { ...m, status: 'failed' as const } : m))
          .filter(m => m.id !== sysMsg.id)
          .concat(errMsg)
      )
    } finally {
      setIsSubmitting(false)
      scrollToBottom()
    }
  }, [locale, sessionId, pathname, serviceId, toolValues, messages, scrollToBottom])

  /* ── handlers ── */
  const handleSend = useCallback(() => { sendMessage(composerText) }, [composerText, sendMessage])
  const handleQuickAction = useCallback((prompt: string) => { sendMessage(prompt) }, [sendMessage])
  const handleBack = useCallback(() => { router.push(`/${locale}/services`) }, [router, locale])

  const handleMenuItemClick = useCallback((itemId: string) => {
    if (!config) return
    const item = config.menuItems.find(m => m.id === itemId)
    if (!item) return

    if (item.action === 'preset' && item.prompt) {
      sendMessage(item.prompt)
    } else if (item.action === 'navigate' && item.target) {
      router.push(`/${locale}/services/${item.target}`)
    } else if (item.action === 'transfer' && item.target) {
      router.push(`/${locale}/services/${item.target}`)
    }
    setMenuOpen(false)
  }, [config, sendMessage, router, locale])

  const handleToolChange = useCallback((toolId: string, value: string) => {
    setToolValues(prev => ({ ...prev, [toolId]: value }))
  }, [])

  const handleAttach = useCallback(() => { fileInputRef.current?.click() }, [])
  const handleCamera = useCallback(() => { cameraInputRef.current?.click() }, [])

  const handleTransferNavigate = useCallback((targetSlug: string) => {
    router.push(`/${locale}/services/${targetSlug}`)
  }, [router, locale])

  /* ═══════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════ */
  if (!config) return null

  const isAgentG = serviceId === 'agent-g'
  const serviceEnvStyle = getServiceEnvironmentStyle(serviceId)

  const chatUI = (
    <div
      className="fixed inset-0 z-[9999]"
      style={{ ...serviceEnvStyle, height: '100dvh', WebkitOverflowScrolling: 'touch' }}
    >
      {/* Service-specific cinematic environment */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px]" style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(34,211,238,0.05) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-[200px]" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 100%, rgba(6,182,212,0.04) 0%, transparent 70%)', filter: 'blur(40px)' }} />
        <div className="absolute top-1/3 -left-20 w-[250px] h-[350px] opacity-50" style={{ background: 'radial-gradient(ellipse at center, rgba(34,211,238,0.03) 0%, transparent 70%)', filter: 'blur(50px)' }} />
        <div className="absolute top-1/2 -right-20 w-[250px] h-[350px] opacity-50" style={{ background: 'radial-gradient(ellipse at center, rgba(6,182,212,0.03) 0%, transparent 70%)', filter: 'blur(50px)' }} />
      </div>

      {/* Header */}
      <ServiceHeader
        serviceId={serviceId}
        serviceName={serviceName}
        serviceIcon={serviceIcon}
        onMenuToggle={() => setMenuOpen(true)}
        onBack={handleBack}
      />

      {/* Hamburger menu */}
      <ServiceHamburgerMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        config={config}
        serviceName={serviceName}
        serviceIcon={serviceIcon}
        onMenuAction={(item) => handleMenuItemClick(item.id)}
      />

      {/* Scrollable body */}
      <div
        ref={scrollRef}
        className="absolute left-0 right-0 overflow-y-auto overflow-x-hidden overscroll-contain"
        style={{
          top: 'calc(56px + env(safe-area-inset-top, 0px))',
          bottom: 'calc(68px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div className="max-w-3xl mx-auto w-full flex flex-col min-h-full">
          {messages.length === 0 ? (
            /* Welcome state */
            <ServiceWelcome config={config} serviceName={serviceName} serviceIcon={serviceIcon} onSend={handleQuickAction} />
          ) : (
            /* Chat messages + tools */
            <div className="flex-1 px-4 py-3 space-y-3">
              {/* Quick actions bar at top */}
              <ServiceQuickActions actions={config.quickActions} onAction={handleQuickAction} />

              {/* Messages */}
              {messages.map((msg, idx) => {
                const isLastAssistant = msg.role === 'assistant' && idx === messages.length - 1

                if (msg.role === 'user') {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div className="chat-bubble-user">
                        {msg.content}
                        {msg.status === 'failed' && (
                          <span className="block text-[10px] mt-1 opacity-60">⚠ Failed to send</span>
                        )}
                      </div>
                    </div>
                  )
                }

                if (msg.role === 'system') {
                  return (
                    <div key={msg.id} className="flex justify-start">
                      <div
                        className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px]"
                        style={{ backgroundColor: 'rgba(255,255,255,0.03)', color: 'var(--color-text-tertiary)' }}
                      >
                        {msg.content === '⏳' ? (
                          <>
                            <div className="w-4 h-4 border-2 border-cyan-400/60 border-t-transparent rounded-full animate-spin" />
                            <span className="animate-pulse">
                              {isAgentG ? 'Agent G is thinking…' : `${serviceName} is processing…`}
                            </span>
                          </>
                        ) : (
                          msg.content
                        )}
                      </div>
                    </div>
                  )
                }

                if (msg.role === 'assistant') {
                  return (
                    <div key={msg.id} className="flex justify-start gap-2.5">
                      {/* Agent avatar */}
                      <div className="chat-agent-avatar mt-0.5">
                        <span>{serviceIcon}</span>
                      </div>
                      <div className="space-y-2" style={{ maxWidth: '85%' }}>
                        <div className="chat-bubble-agent whitespace-pre-wrap">
                          {msg.content}
                        </div>

                        {/* Output card for completed results */}
                        {isLastAssistant && outputReady && (
                          <ServiceOutputCard
                            serviceId={serviceId}
                            serviceName={serviceName}
                            serviceIcon={serviceIcon}
                            onNavigate={handleTransferNavigate}
                            transfers={config.transfers}
                            locale={locale}
                          />
                        )}
                      </div>
                    </div>
                  )
                }

                return null
              })}

              {/* Tool panel — always visible when tools exist */}
              {config.tools.length > 0 && (
                <ServiceToolPanel
                  tools={config.tools}
                  values={toolValues}
                  onChange={handleToolChange}
                  onUpload={handleAttach}
                  onCamera={handleCamera}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <ServiceComposer
        value={composerText}
        onChange={setComposerText}
        onSend={handleSend}
        onAttach={handleAttach}
        onCamera={handleCamera}
        isSubmitting={isSubmitting}
        placeholder={config.welcomeHint[language as 'en' | 'ka' | 'ru'] || config.welcomeHint.en}
      />

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
        onChange={() => {}}
      />
      <input
        ref={cameraInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={() => {}}
      />
    </div>
  )

  if (!portalTarget) return null
  return createPortal(chatUI, portalTarget)
}
