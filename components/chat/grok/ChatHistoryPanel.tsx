'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'

/* ── Types ── */
export interface Conversation {
  id: string
  title: string
  lastMessage: string
  updatedAt: string
  messageCount: number
}

interface ChatHistoryPanelProps {
  open: boolean
  onClose: () => void
  conversations: Conversation[]
  activeConversationId: string | null
  onSelectConversation: (id: string) => void
  onNewChat: () => void
}

/* ── Helpers ── */
function timeLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function groupLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days < 1) return 'Today'
  if (days < 2) return 'Yesterday'
  if (days < 7) return 'Previous 7 Days'
  return 'Older'
}

export function ChatHistoryPanel({
  open,
  onClose,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
}: ChatHistoryPanelProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations
    const q = search.toLowerCase()
    return conversations.filter(
      c => c.title.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q)
    )
  }, [conversations, search])

  /* Group conversations by time */
  const grouped = useMemo(() => {
    const groups: Record<string, Conversation[]> = {}
    for (const c of filtered) {
      const label = groupLabel(c.updatedAt)
      if (!groups[label]) groups[label] = []
      groups[label].push(c)
    }
    return groups
  }, [filtered])

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`chat-history-panel ${open ? 'open' : ''}`}
        role="dialog"
        aria-label="Chat history"
      >
        {/* Header */}
        <div className="chat-history-header">
          <div className="flex items-center gap-3">
            <div className="chat-history-logo">
              <Image
                src="/brand/gemini-rocket-clean.png"
                alt="MyAvatar.ge"
                width={28}
                height={28}
                className="object-contain"
              />
            </div>
            <span className="text-[15px] font-semibold text-white">MyAvatar.ge</span>
          </div>
          <button
            onClick={onClose}
            className="grok-header-btn !w-8 !h-8"
            aria-label="Close history"
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* New Chat Button */}
        <div className="px-3 py-2">
          <button onClick={onNewChat} className="chat-history-new-btn" type="button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 3v18M3 12h18" />
            </svg>
            <span>New Chat</span>
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <div className="chat-history-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 opacity-40">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="chat-history-search-input"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-[32px] mb-3 opacity-30">💬</div>
              <p className="text-[13px] text-white/30">
                {search ? 'No matching conversations' : 'No conversations yet'}
              </p>
              <p className="text-[11px] text-white/20 mt-1">Start a new chat with Agent G</p>
            </div>
          ) : (
            Object.entries(grouped).map(([label, convos]) => (
              <div key={label}>
                <div className="chat-history-group-label">{label}</div>
                {convos.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { onSelectConversation(c.id); onClose() }}
                    className={`chat-history-item ${c.id === activeConversationId ? 'active' : ''}`}
                    type="button"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="chat-history-item-title">{c.title}</div>
                      <div className="chat-history-item-preview">{c.lastMessage}</div>
                    </div>
                    <div className="chat-history-item-meta">
                      <span>{timeLabel(c.updatedAt)}</span>
                      {c.messageCount > 0 && (
                        <span className="chat-history-badge">{c.messageCount}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="chat-history-footer">
          <button className="chat-history-footer-btn" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
            <span>Settings</span>
          </button>
        </div>
      </div>
    </>
  )
}
