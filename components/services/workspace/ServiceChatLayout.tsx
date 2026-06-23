'use client'

/**
 * ServiceChatLayout — Main orchestrator for every service workspace.
 *
 * Agent G = premium Grok-style UI (GrokHeader, GrokComposer, tabs, etc.)
 * Other services = standard chat layout.
 *
 * Service-aware: Chat understands the current service context, can trigger
 * platform actions, navigate between services, and hand off outputs.
 * Portal-rendered at z-[9999].
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { useServiceContext, type ServiceOutput } from '@/lib/services/ServiceContext'
import { useShellContainer } from '@/components/services/unified/ShellContainerContext'

import { getServiceWorkspaceConfig } from '@/lib/services/workspace-config'
import { ServiceHeader } from './ServiceHeader'
import { ServiceHamburgerMenu } from './ServiceHamburgerMenu'
import { ServiceQuickActions } from './ServiceQuickActions'
import { ServiceWelcome } from './ServiceWelcome'
import { ServiceComposer } from './ServiceComposer'
import { ServiceToolPanel } from './ServiceToolPanel'

import { ServiceOutputCard } from './ServiceOutputCard'
import { getServiceEnvironmentStyle } from '@/components/ui/PageEnvironment'

/* Grok-style components for Agent G */
import { GrokHeader, type ChatTab } from '@/components/chat/grok/GrokHeader'
import { GrokComposer } from '@/components/chat/grok/GrokComposer'
import { GrokEmptyState } from '@/components/chat/grok/GrokEmptyState'
import { ChatActionChips } from '@/components/chat/grok/ChatActionChips'
import { ChatResponseToolbar } from '@/components/chat/grok/ChatResponseToolbar'
import type { ChatMode } from '@/components/chat/grok/ChatModeSelector'
import { ImagineTab } from '@/components/chat/grok/ImagineTab'
import { ImagineComposer } from '@/components/chat/grok/ImagineComposer'
import { SettingsSheet, type SettingsConfig } from '@/components/chat/grok/SettingsSheet'
import { ActionSheet } from '@/components/chat/grok/ActionSheet'
import { ChatHistoryPanel, type Conversation } from '@/components/chat/grok/ChatHistoryPanel'
import { CallScreen } from '@/components/chat/grok/CallScreen'
import Image from 'next/image'

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
  /** Response time in seconds */
  responseTime?: number
  /** Attachments */
  attachments?: ChatFileAttachment[]
}

/* ── file attachment ── */
interface ChatFileAttachment {
  id: string
  name: string
  type: string
  size: number
  kind: 'image' | 'video' | 'audio' | 'document'
  previewUrl?: string
  dataUrl?: string
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
  agentId: _agentId,
  locale,
  features: _features,
  description: _description,
  isAuthenticated: _isAuthenticated,
  demoMode: _demoMode,
}: ServiceChatLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { language } = useLanguage()
  const serviceCtx = useServiceContext()
  const shellContainer = useShellContainer()

  /* ── Register active service in global context ── */
  useEffect(() => {
    serviceCtx.setActiveService(serviceId)
  }, [serviceId]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const [attachments, setAttachments] = useState<ChatFileAttachment[]>([])

  /* ── Grok-style state (Agent G only) ── */
  const [chatMode, setChatMode] = useState<ChatMode>('fast')
  const [chatTab, setChatTab] = useState<ChatTab>('ask')

  /* ── Chat history state ── */
  const [historyOpen, setHistoryOpen] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)

  /* ── Call state ── */
  const [callOpen, setCallOpen] = useState(false)
  const [_sendTimestamp, setSendTimestamp] = useState<number>(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [actionSheetOpen, setActionSheetOpen] = useState(false)
  const [imagineSettings, setImagineSettings] = useState<SettingsConfig>({
    duration: { options: ['6s', '10s'], value: '6s' },
    resolution: { options: ['480p', '720p', '1080p'], value: '720p' },
    aspectRatio: {
      options: [
        { label: '2:3', value: '2:3', icon: 'portrait' },
        { label: '3:2', value: '3:2', icon: 'landscape' },
        { label: '1:1', value: '1:1', icon: 'square' },
        { label: '9:16', value: '9:16', icon: 'tall' },
        { label: '16:9', value: '16:9', icon: 'wide' },
      ],
      value: '1:1',
    },
    speakToCreate: false,
  })

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
  const sendMessage = useCallback(async (text: string, files?: ChatFileAttachment[]) => {
    if (!text.trim() && (!files || files.length === 0)) return

    const userMsg: ServiceMessage = {
      id: uid(), role: 'user', content: text.trim(), createdAt: now(), status: 'sending',
      attachments: files && files.length > 0 ? files : undefined,
    }
    const sysMsg: ServiceMessage = { id: uid(), role: 'system', content: '⏳', createdAt: now() }
    const startTime = performance.now()

    // Revoke preview URLs after capturing them in the message
    const filesCopy = files ? [...files] : []

    setMessages(prev => [...prev, userMsg, sysMsg])
    setComposerText('')
    setAttachments([])
    setIsSubmitting(true)
    setSendTimestamp(startTime)
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

      // Build attachment context for the AI
      const attachInfo = filesCopy.length > 0
        ? filesCopy.map(f => `[Attached: ${f.name} (${f.kind})]`).join(' ') + ' '
        : ''

      const res = await fetch('/api/agent-g/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: toolContext
            ? `[Service: ${serviceId}] [Settings: ${toolContext}] ${attachInfo}${text.trim()}`
            : `[Service: ${serviceId}] ${attachInfo}${text.trim()}`,
          locale,
          sessionId,
          context: {
            currentPage: pathname || undefined,
            activeService: serviceId,
            serviceName,
            previousService: serviceCtx.previousService,
            recentOutputs: serviceCtx.recentOutputs.slice(0, 5).map(o => ({
              serviceId: o.serviceId, type: o.type, label: o.label,
            })),
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
        responseTime: (performance.now() - startTime) / 1000,
      }

      setMessages(prev =>
        prev
          .map(m => (m.id === userMsg.id ? { ...m, status: 'sent' as const } : m))
          .filter(m => m.id !== sysMsg.id)
          .concat(assistantMsg)
      )
      setOutputReady(true)

      // Track output in global service context
      if (assistantMsg.outputType) {
        const output: ServiceOutput = {
          id: assistantMsg.id,
          serviceId,
          type: assistantMsg.outputType,
          label: assistantMsg.content.slice(0, 80),
          createdAt: assistantMsg.createdAt
        }
        serviceCtx.addOutput(output)
      }
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
  }, [locale, sessionId, pathname, serviceId, serviceName, toolValues, messages, scrollToBottom, serviceCtx])

  /* ── handlers ── */
  const handleSend = useCallback(() => { sendMessage(composerText, attachments) }, [composerText, attachments, sendMessage])
  const handleQuickAction = useCallback((prompt: string) => { sendMessage(prompt) }, [sendMessage])
  const handleBack = useCallback(() => { router.push(`/${locale}/services`) }, [router, locale])

  /* ── conversation management ── */
  const handleNewChat = useCallback(() => {
    // Save current conversation if it has messages
    if (messages.length > 0) {
      const firstUserMsg = messages.find(m => m.role === 'user')
      const lastMsg = [...messages].reverse().find(m => m.role === 'assistant' || m.role === 'user')
      const conv: Conversation = {
        id: activeConversationId || uid(),
        title: firstUserMsg?.content.slice(0, 60) || 'New conversation',
        lastMessage: lastMsg?.content.slice(0, 80) || '',
        updatedAt: now(),
        messageCount: messages.filter(m => m.role !== 'system').length,
      }
      setConversations(prev => {
        const exists = prev.findIndex(c => c.id === conv.id)
        if (exists >= 0) {
          const copy = [...prev]
          copy[exists] = conv
          return copy
        }
        return [conv, ...prev]
      })
    }
    setMessages([])
    setActiveConversationId(uid())
    setOutputReady(false)
    setHistoryOpen(false)
  }, [messages, activeConversationId])

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id)
    // In a real app, load messages from storage. For now, start fresh with the selected conversation.
    setMessages([])
    setOutputReady(false)
  }, [])

  // Conversation CRUD — kept in-memory alongside `conversations`. The panel reads
  // these via optional callbacks; without them the inline actions stay hidden.
  const handleRenameConversation = useCallback((id: string, newTitle: string) => {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title: newTitle } : c))
  }, [])
  const handleDeleteConversation = useCallback((id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id))
    setActiveConversationId(prev => (prev === id ? null : prev))
  }, [])
  const handleTogglePinConversation = useCallback((id: string) => {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, isPinned: !c.isPinned } : c))
  }, [])

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

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach(f => {
      if (f.size > 10 * 1024 * 1024) return // 10MB limit
      const kind: ChatFileAttachment['kind'] = f.type.startsWith('image/') ? 'image'
        : f.type.startsWith('video/') ? 'video'
        : f.type.startsWith('audio/') ? 'audio'
        : 'document'
      const att: ChatFileAttachment = {
        id: uid(), name: f.name, type: f.type, size: f.size, kind,
        previewUrl: (f.type.startsWith('image/') || f.type.startsWith('video/')) ? URL.createObjectURL(f) : undefined,
      }
      // Base64 encode images for AI vision
      if (f.type.startsWith('image/') && f.size < 4 * 1024 * 1024) {
        const reader = new FileReader()
        reader.onload = () => {
          setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, dataUrl: reader.result as string } : a))
        }
        reader.readAsDataURL(f)
      }
      setAttachments(prev => [...prev, att])
    })
    e.target.value = ''
  }, [])

  const handleCameraChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const att: ChatFileAttachment = {
      id: uid(), name: f.name || 'camera-photo.jpg', type: f.type || 'image/jpeg',
      size: f.size, kind: 'image', previewUrl: URL.createObjectURL(f),
    }
    const reader = new FileReader()
    reader.onload = () => {
      setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, dataUrl: reader.result as string } : a))
    }
    reader.readAsDataURL(f)
    setAttachments(prev => [...prev, att])
    e.target.value = ''
  }, [])

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const removed = prev.find(a => a.id === id)
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl)
      return prev.filter(a => a.id !== id)
    })
  }, [])

  const handleTransferNavigate = useCallback((targetSlug: string) => {
    router.push(`/${locale}/services/${targetSlug}`)
  }, [router, locale])

  const handleActionChip = useCallback((action: string) => {
    if (action === 'camera') handleCamera()
    else if (action === 'image') handleAttach()
    else if (action === 'voice') {
      /* Voice mode handled by composer */
    } else if (action === 'document') handleAttach()
    else if (action === 'code') sendMessage('Help me write code')
  }, [handleCamera, handleAttach, sendMessage])

  const handleImagineSettingChange = useCallback((key: string, value: string) => {
    setImagineSettings(prev => {
      const copy = { ...prev }
      if (key === 'duration' && copy.duration) copy.duration = { ...copy.duration, value }
      if (key === 'resolution' && copy.resolution) copy.resolution = { ...copy.resolution, value }
      if (key === 'aspectRatio' && copy.aspectRatio) copy.aspectRatio = { ...copy.aspectRatio, value }
      return copy
    })
  }, [])

  const handleCreateAction = useCallback((templateId: string) => {
    sendMessage(`Create using template: ${templateId}`)
  }, [sendMessage])

  const handleImagineSubmit = useCallback((prompt: string) => {
    sendMessage(`[Imagine] ${prompt}`)
  }, [sendMessage])

  const handleActionSheetAction = useCallback((actionId: string) => {
    sendMessage(`[Action: ${actionId}]`)
  }, [sendMessage])

  /* ═══════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════ */
  if (!config) return null

  const isAgentG = serviceId === 'agent-g'
  const serviceEnvStyle = getServiceEnvironmentStyle(serviceId)

  /* ──────────────────────────────────────────────────
     GROK-STYLE UI — Agent G gets the premium experience
     ────────────────────────────────────────────────── */
  if (isAgentG) {
    const grokUI = (
      <div
        className={shellContainer.insideShell ? "absolute inset-0 grok-chat-root" : "fixed inset-0 z-[9999] grok-chat-root"}
        style={{ height: shellContainer.insideShell ? '100%' : '100dvh', WebkitOverflowScrolling: 'touch' }}
      >
        {/* 4D Environment Layer */}
        <div className="grok-4d-environment" aria-hidden="true">
          <div className="grok-4d-grid" />
          <div className="grok-4d-particles" />
          <div className="grok-4d-side-glow-left" />
          <div className="grok-4d-side-glow-right" />
        </div>

        {/* Grok Header */}
        <GrokHeader
          activeTab={chatTab}
          onTabChange={setChatTab}
          onMenuToggle={() => setMenuOpen(true)}
          onBack={handleBack}
          serviceIcon={serviceIcon}
          onHistoryToggle={() => setHistoryOpen(true)}
          onCallStart={() => setCallOpen(true)}
        />

        {/* Chat History Panel */}
        <ChatHistoryPanel
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewChat}
          onRename={handleRenameConversation}
          onDelete={handleDeleteConversation}
          onTogglePin={handleTogglePinConversation}
        />

        {/* Call Screen */}
        <CallScreen
          open={callOpen}
          onClose={() => setCallOpen(false)}
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
            bottom: 'calc(140px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <div className="max-w-3xl mx-auto w-full flex flex-col min-h-full">
            {chatTab === 'create' ? (
              /* Imagine / Create tab — template gallery + featured cards */
              <ImagineTab
                onCreateAction={handleCreateAction}
                onOpenSettings={() => setSettingsOpen(true)}
                onFeaturedAction={() => sendMessage('Animate my photos')}
              />
            ) : messages.length === 0 ? (
              /* Grok empty state — centered logo + quick actions */
              <GrokEmptyState serviceIcon={serviceIcon} onSuggestionClick={sendMessage} activeService={serviceId} />
            ) : (
              /* Chat messages */
              <div className="flex-1 px-4 py-3 space-y-4">
                {messages.map((msg, idx) => {
                  const isLastAssistant = msg.role === 'assistant' && idx === messages.length - 1

                  if (msg.role === 'user') {
                    return (
                      <div key={msg.id} className="flex justify-end">
                        <div className="chat-bubble-user">
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="flex gap-1.5 mb-2 flex-wrap">
                              {msg.attachments.map(att => (
                                att.kind === 'image' && (att.previewUrl || att.dataUrl) ? (
                                  <Image key={att.id} src={att.previewUrl || att.dataUrl || ''} alt={att.name} width={80} height={80} unoptimized className="w-20 h-20 rounded-lg object-cover" />
                                ) : (
                                  <div key={att.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                                    <span>{att.kind === 'video' ? '🎬' : att.kind === 'audio' ? '🎵' : '📎'}</span>
                                    <span className="truncate max-w-[120px]">{att.name}</span>
                                  </div>
                                )
                              ))}
                            </div>
                          )}
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
                        <div className="grok-system-msg">
                          {msg.content === '⏳' ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
                              <span className="animate-pulse">Agent G is thinking…</span>
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
                      <div key={msg.id} className="grok-assistant-block">
                        <div className="flex gap-3">
                          {/* Agent avatar */}
                          <div className="chat-agent-avatar mt-0.5">
                            <Image src="/brand/gemini-rocket-clean.png" alt="Agent G" width={24} height={24} className="object-contain" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="chat-bubble-agent whitespace-pre-wrap">
                              {msg.content}
                            </div>
                          </div>
                        </div>

                        {/* Grok-style response toolbar */}
                        <ChatResponseToolbar
                          content={msg.content}
                          mode={chatMode}
                          responseTime={msg.responseTime}
                        />

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
                    )
                  }

                  return null
                })}
              </div>
            )}
          </div>
        </div>

        {/* Action chips (above composer, shown in ask tab empty state) */}
        {chatTab === 'ask' && messages.length === 0 && (
          <div className="absolute left-0 right-0 z-20" style={{ bottom: 'calc(140px + env(safe-area-inset-bottom, 0px))' }}>
            <div className="max-w-3xl mx-auto">
              <ChatActionChips onAction={handleActionChip} />
            </div>
          </div>
        )}

        {/* Bottom composer — switches between Ask and Imagine */}
        {chatTab === 'create' ? (
          <ImagineComposer
            onSubmit={handleImagineSubmit}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenActions={() => setActionSheetOpen(true)}
            disabled={isSubmitting}
          />
        ) : (
          <GrokComposer
            value={composerText}
            onChange={setComposerText}
            onSend={handleSend}
            onAttach={handleAttach}
            onCamera={handleCamera}
            isSubmitting={isSubmitting}
            placeholder={chatTab === 'ask' ? 'Ask Anything' : 'Describe what to create…'}
            mode={chatMode}
            onModeChange={setChatMode}
            attachCount={attachments.length}
            locale={locale}
          />
        )}

        {/* Attachment preview tray */}
        {attachments.length > 0 && (
          <div className="absolute left-0 right-0 z-30" style={{ bottom: 'calc(140px + env(safe-area-inset-bottom, 0px))' }}>
            <div className="max-w-3xl mx-auto px-4">
              <div className="flex gap-2 py-2 overflow-x-auto no-scrollbar" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                {attachments.map(att => (
                  <div key={att.id} className="relative flex-shrink-0 group">
                    {att.kind === 'image' && att.previewUrl ? (
                      <Image src={att.previewUrl} alt={att.name} width={56} height={56} unoptimized className="w-14 h-14 rounded-xl object-cover" style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
                    ) : (
                      <div className="w-14 h-14 rounded-xl flex items-center justify-center text-xs" style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
                        {att.kind === 'video' ? '🎬' : att.kind === 'audio' ? '🎵' : '📎'}
                      </div>
                    )}
                    <button onClick={() => handleRemoveAttachment(att.id)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: '#ef4444' }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Settings bottom sheet */}
        <SettingsSheet
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={imagineSettings}
          onSettingChange={handleImagineSettingChange}
          onToggleSpeakToCreate={() => setImagineSettings(prev => ({ ...prev, speakToCreate: !prev.speakToCreate }))}
        />

        {/* Action sheet */}
        <ActionSheet
          open={actionSheetOpen}
          onClose={() => setActionSheetOpen(false)}
          onAction={handleActionSheetAction}
        />

        {/* Hidden file inputs */}
        <input ref={fileInputRef} type="file" className="hidden" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt" onChange={handleFileChange} />
        <input ref={cameraInputRef} type="file" className="hidden" accept="image/*" capture="environment" onChange={handleCameraChange} />
      </div>
    )

    if (shellContainer.insideShell) return grokUI
    if (!portalTarget) return null
    return createPortal(grokUI, portalTarget)
  }

  /* ──────────────────────────────────────────────────
     STANDARD UI — All other services
     ────────────────────────────────────────────────── */
  const chatUI = (
    <div
      className={shellContainer.insideShell ? "absolute inset-0" : "fixed inset-0 z-[9999]"}
      style={{ ...serviceEnvStyle, height: shellContainer.insideShell ? '100%' : '100dvh', WebkitOverflowScrolling: 'touch' }}
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
            <ServiceWelcome config={config} serviceName={serviceName} serviceIcon={serviceIcon} onSend={handleQuickAction} />
          ) : (
            <div className="flex-1 px-4 py-3 space-y-3">
              <ServiceQuickActions actions={config.quickActions} onAction={handleQuickAction} />
              {messages.map((msg, idx) => {
                const isLastAssistant = msg.role === 'assistant' && idx === messages.length - 1
                if (msg.role === 'user') {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div className="chat-bubble-user">
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex gap-1.5 mb-2 flex-wrap">
                            {msg.attachments.map(att => (
                              att.kind === 'image' && (att.previewUrl || att.dataUrl) ? (
                                <Image key={att.id} src={att.previewUrl || att.dataUrl || ''} alt={att.name} width={80} height={80} unoptimized className="w-20 h-20 rounded-lg object-cover" />
                              ) : (
                                <div key={att.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                                  <span>{att.kind === 'video' ? '🎬' : att.kind === 'audio' ? '🎵' : '📎'}</span>
                                  <span className="truncate max-w-[120px]">{att.name}</span>
                                </div>
                              )
                            ))}
                          </div>
                        )}
                        {msg.content}
                        {msg.status === 'failed' && <span className="block text-[10px] mt-1 opacity-60">⚠ Failed to send</span>}
                      </div>
                    </div>
                  )
                }
                if (msg.role === 'system') {
                  return (
                    <div key={msg.id} className="flex justify-start">
                      <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px]" style={{ backgroundColor: 'rgba(255,255,255,0.03)', color: 'var(--color-text-tertiary)' }}>
                        {msg.content === '⏳' ? (
                          <>
                            <div className="w-4 h-4 border-2 border-cyan-400/60 border-t-transparent rounded-full animate-spin" />
                            <span className="animate-pulse">{`${serviceName} is processing…`}</span>
                          </>
                        ) : msg.content}
                      </div>
                    </div>
                  )
                }
                if (msg.role === 'assistant') {
                  return (
                    <div key={msg.id} className="flex justify-start gap-2.5">
                      <div className="chat-agent-avatar mt-0.5"><span>{serviceIcon}</span></div>
                      <div className="space-y-2" style={{ maxWidth: '85%' }}>
                        <div className="chat-bubble-agent whitespace-pre-wrap">{msg.content}</div>
                        {isLastAssistant && outputReady && (
                          <ServiceOutputCard serviceId={serviceId} serviceName={serviceName} serviceIcon={serviceIcon} onNavigate={handleTransferNavigate} transfers={config.transfers} locale={locale} />
                        )}
                      </div>
                    </div>
                  )
                }
                return null
              })}
              {config.tools.length > 0 && (
                <ServiceToolPanel tools={config.tools} values={toolValues} onChange={handleToolChange} onUpload={handleAttach} onCamera={handleCamera} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Attachment preview tray */}
      {attachments.length > 0 && (
        <div className="absolute left-0 right-0 z-20" style={{ bottom: 'calc(68px + env(safe-area-inset-bottom, 0px))' }}>
          <div className="max-w-3xl mx-auto px-4">
            <div className="flex gap-2 py-2 overflow-x-auto no-scrollbar" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              {attachments.map(att => (
                <div key={att.id} className="relative flex-shrink-0 group">
                  {att.kind === 'image' && att.previewUrl ? (
                    <Image src={att.previewUrl} alt={att.name} width={56} height={56} unoptimized className="w-14 h-14 rounded-xl object-cover" style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
                  ) : (
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center text-xs" style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
                      {att.kind === 'video' ? '🎬' : att.kind === 'audio' ? '🎵' : '📎'}
                    </div>
                  )}
                  <button onClick={() => handleRemoveAttachment(att.id)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: '#ef4444' }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Composer */}
      <ServiceComposer
        value={composerText}
        onChange={setComposerText}
        onSend={handleSend}
        onAttach={handleAttach}
        onCamera={handleCamera}
        isSubmitting={isSubmitting}
        placeholder={config.welcomeHint[language as 'en' | 'ka' | 'ru'] || config.welcomeHint.en}
        attachCount={attachments.length}
      />

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" className="hidden" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt" onChange={handleFileChange} />
      <input ref={cameraInputRef} type="file" className="hidden" accept="image/*" capture="environment" onChange={handleCameraChange} />
    </div>
  )

  if (shellContainer.insideShell) return chatUI
  if (!portalTarget) return null
  return createPortal(chatUI, portalTarget)
}
