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

      const res = await fetch('/api/agent-g/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          locale,
          sessionId,
          context: {
            currentPage: pathname || undefined,
            activeService: serviceId,
            toolValues,
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
      router.push(`/${locale}/services/${item.target}?from=${serviceId}&transfer=true`)
    }
    setMenuOpen(false)
  }, [config, sendMessage, router, locale, serviceId])

  const handleToolChange = useCallback((toolId: string, value: string) => {
    setToolValues(prev => ({ ...prev, [toolId]: value }))
  }, [])

  const handleAttach = useCallback(() => { fileInputRef.current?.click() }, [])
  const handleCamera = useCallback(() => { cameraInputRef.current?.click() }, [])

  /* ═══════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════ */
  if (!config) return null

  const chatUI = (
    <div className="fixed inset-0 z-[9999]" style={{ backgroundColor: '#0a0a0c' }}>
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
            /* Chat messages */
            <div className="flex-1 px-4 py-3 space-y-4">
              {/* Quick actions bar */}
              <ServiceQuickActions actions={config.quickActions} onAction={handleQuickAction} />

              {/* Messages */}
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
                      msg.role === 'user' ? 'rounded-br-md' : 'rounded-bl-md'
                    }`}
                    style={
                      msg.role === 'user'
                        ? { backgroundColor: 'var(--color-accent)', color: '#000' }
                        : msg.role === 'system'
                        ? { backgroundColor: 'rgba(255,255,255,0.03)', color: 'var(--color-text-tertiary)' }
                        : { backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--color-text-primary)' }
                    }
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Tool panel */}
              {config.tools.length > 0 && (
                <ServiceToolPanel
                  tools={config.tools}
                  values={toolValues}
                  onChange={handleToolChange}
                  onUpload={handleAttach}
                  onCamera={handleCamera}
                />
              )}

              {/* Cross-service transfers */}
              <CrossServiceTransfer
                transfers={config.transfers}
                outputReady={outputReady}
                locale={locale}
              />
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
        placeholder={config.welcomeHint.en}
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
