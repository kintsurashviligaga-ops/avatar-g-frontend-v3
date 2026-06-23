'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare, Image as ImgIcon, Film, Music2, Mic2,
  Pencil, Trash2, Pin, Check, X as XIcon, AlertTriangle,
} from 'lucide-react'

/* ── Types ── */
export type ConversationType = 'chat' | 'image' | 'video' | 'music' | 'voice'

export interface Conversation {
  id: string
  title: string
  lastMessage: string
  updatedAt: string
  messageCount: number
  /** Optional service-type tag — shown as a coloured icon next to the entry. */
  type?: ConversationType
  /** Pinned entries float to the top, above the chronological groups. */
  isPinned?: boolean
}

interface ChatHistoryPanelProps {
  open: boolean
  onClose: () => void
  conversations: Conversation[]
  activeConversationId: string | null
  onSelectConversation: (id: string) => void
  onNewChat: () => void
  /** Optional CRUD hooks — when provided, the corresponding inline action is shown. */
  onRename?: (id: string, newTitle: string) => void
  onDelete?: (id: string) => void
  onTogglePin?: (id: string) => void
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

/** Service-type icon — coloured to make scanning the list at a glance easy. */
function ServiceIcon({ type }: { type?: ConversationType }) {
  const map: Record<ConversationType, { Icon: typeof MessageSquare; tone: string }> = {
    chat:  { Icon: MessageSquare, tone: 'text-sky-300/90 bg-sky-500/10 ring-sky-400/20' },
    image: { Icon: ImgIcon,       tone: 'text-emerald-300/90 bg-emerald-500/10 ring-emerald-400/20' },
    video: { Icon: Film,          tone: 'text-rose-300/90 bg-rose-500/10 ring-rose-400/20' },
    music: { Icon: Music2,        tone: 'text-violet-300/90 bg-violet-500/10 ring-violet-400/20' },
    voice: { Icon: Mic2,          tone: 'text-amber-300/90 bg-amber-500/10 ring-amber-400/20' },
  }
  const { Icon, tone } = map[type ?? 'chat']
  return (
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ${tone}`}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  )
}

/** Per-row component so each row owns its rename + swipe + confirm state without
 *  global collisions. Renders the conversation as a tile with:
 *    - service-type icon (left)
 *    - title (inline-editable when Pencil is clicked)
 *    - preview, time, pin marker, message count
 *    - hover-revealed action cluster: Rename, Delete, Pin/Unpin
 *    - mobile swipe-left → delete affordance
 */
function ConversationRow({
  c, active, onSelect, onRename, onDelete, onTogglePin,
}: {
  c: Conversation
  active: boolean
  onSelect: (id: string) => void
  onRename?: (id: string, t: string) => void
  onDelete?: (id: string) => void
  onTogglePin?: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(c.title)
  const [confirming, setConfirming] = useState(false)
  const [swipeX, setSwipeX] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const editInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => { if (editing) editInputRef.current?.focus() }, [editing])
  useEffect(() => { setDraft(c.title) }, [c.title])

  const commitRename = useCallback(() => {
    const v = draft.trim()
    if (v && v !== c.title && onRename) onRename(c.id, v)
    setEditing(false)
  }, [draft, c.id, c.title, onRename])

  const cancelRename = useCallback(() => { setDraft(c.title); setEditing(false) }, [c.title])

  /** Swipe-to-delete on mobile/touch: drag left ≥ 80px → reveal delete; release
   *  past 140px → trigger confirm. No external library needed. */
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }, [])
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const dx = (e.touches[0]?.clientX ?? 0) - touchStartX.current
    if (dx < 0) setSwipeX(Math.max(dx, -160))
  }, [])
  const onTouchEnd = useCallback(() => {
    if (swipeX <= -140 && onDelete) {
      setConfirming(true); setSwipeX(0); touchStartX.current = null; return
    }
    setSwipeX(swipeX <= -80 && onDelete ? -80 : 0)
    touchStartX.current = null
  }, [swipeX, onDelete])

  return (
    <div className="relative">
      {/* Swipe-revealed Delete shelf (mobile) */}
      {onDelete && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label="Delete chat"
          className="absolute inset-y-0 right-0 flex w-20 items-center justify-center rounded-r-lg bg-red-500/90 text-white"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}

      <motion.div
        layout
        animate={{ x: swipeX }}
        transition={{ type: 'spring', stiffness: 500, damping: 38 }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="relative"
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => { if (!editing && !confirming) onSelect(c.id) }}
          onKeyDown={(e) => { if (!editing && !confirming && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(c.id) } }}
          className={`chat-history-item group flex cursor-pointer items-start gap-2 ${active ? 'active' : ''} ${c.isPinned ? 'border-l-2 border-l-[#00D2FF]/70' : ''}`}
        >
          <ServiceIcon type={c.type} />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {c.isPinned && <Pin className="h-3 w-3 shrink-0 text-[#00D2FF]/70" aria-label="Pinned" />}
              {editing ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') cancelRename()
                  }}
                  onBlur={commitRename}
                  className="w-full min-w-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[13px] font-medium text-white outline-none ring-1 ring-[#00D2FF]/40 focus:ring-[#00D2FF]"
                />
              ) : (
                <div className="chat-history-item-title truncate">{c.title}</div>
              )}
            </div>
            {!editing && <div className="chat-history-item-preview truncate">{c.lastMessage}</div>}
          </div>

          {/* Right rail: hover actions (desktop) + time/count (always) */}
          {!editing && (
            <div className="flex items-center gap-1">
              {/* Hover-revealed CRUD cluster — only renders the buttons whose
                  callbacks the parent actually provided (backward compatible). */}
              <div className="hidden items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 sm:flex">
                {onRename && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setEditing(true) }}
                    aria-label="Rename chat"
                    title="Rename"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {onTogglePin && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onTogglePin(c.id) }}
                    aria-label={c.isPinned ? 'Unpin chat' : 'Pin chat'}
                    title={c.isPinned ? 'Unpin' : 'Pin'}
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                      c.isPinned
                        ? 'text-[#00D2FF] hover:bg-[#00D2FF]/15'
                        : 'text-white/60 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Pin className="h-3.5 w-3.5" />
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setConfirming(true) }}
                    aria-label="Delete chat"
                    title="Delete"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-red-500/15 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="chat-history-item-meta">
                <span>{timeLabel(c.updatedAt)}</span>
                {c.messageCount > 0 && (
                  <span className="chat-history-badge">{c.messageCount}</span>
                )}
              </div>
            </div>
          )}

          {/* Inline rename — save / cancel buttons surface only while editing */}
          {editing && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); commitRename() }}
                aria-label="Save name"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[#00D2FF] hover:bg-[#00D2FF]/15"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); cancelRename() }}
                aria-label="Cancel rename"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Delete confirmation modal — scoped to this row */}
      <AnimatePresence>
        {confirming && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setConfirming(false)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 8, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, y: 8, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              role="dialog"
              aria-modal="true"
              className="w-full max-w-sm rounded-2xl bg-neutral-900 p-5 text-white shadow-2xl ring-1 ring-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/20 ring-1 ring-red-500/40">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold">Delete this chat?</h3>
                  <p className="mt-1 text-sm text-white/60 truncate">“{c.title}”</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-white/70">This conversation will be removed from your history. This action cannot be undone.</p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-full px-3.5 py-1.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirming(false); onDelete?.(c.id) }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-red-500/90 px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function ChatHistoryPanel({
  open,
  onClose,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onRename,
  onDelete,
  onTogglePin,
}: ChatHistoryPanelProps) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations
    const q = search.toLowerCase()
    return conversations.filter(
      c => c.title.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q)
    )
  }, [conversations, search])

  /** Pinned at the top, then chronological groups for the rest. */
  const pinned = useMemo(() => filtered.filter(c => c.isPinned), [filtered])
  const unpinned = useMemo(() => filtered.filter(c => !c.isPinned), [filtered])
  const grouped = useMemo(() => {
    const groups: Record<string, Conversation[]> = {}
    for (const c of unpinned) {
      const label = groupLabel(c.updatedAt)
      if (!groups[label]) groups[label] = []
      groups[label].push(c)
    }
    return groups
  }, [unpinned])

  const handleSelect = useCallback((id: string) => { onSelectConversation(id); onClose() }, [onSelectConversation, onClose])

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
            <XIcon className="h-4 w-4" />
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
            <>
              {pinned.length > 0 && (
                <div>
                  <div className="chat-history-group-label flex items-center gap-1.5">
                    <Pin className="h-3 w-3 text-[#00D2FF]/70" /> Pinned
                  </div>
                  <AnimatePresence initial={false}>
                    {pinned.map(c => (
                      <ConversationRow
                        key={c.id}
                        c={c}
                        active={c.id === activeConversationId}
                        onSelect={handleSelect}
                        onRename={onRename}
                        onDelete={onDelete}
                        onTogglePin={onTogglePin}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
              {Object.entries(grouped).map(([label, convos]) => (
                <div key={label}>
                  <div className="chat-history-group-label">{label}</div>
                  <AnimatePresence initial={false}>
                    {convos.map(c => (
                      <ConversationRow
                        key={c.id}
                        c={c}
                        active={c.id === activeConversationId}
                        onSelect={handleSelect}
                        onRename={onRename}
                        onDelete={onDelete}
                        onTogglePin={onTogglePin}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              ))}
            </>
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
