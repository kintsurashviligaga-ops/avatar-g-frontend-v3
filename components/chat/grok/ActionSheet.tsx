'use client'

/**
 * ActionSheet — Floating tool selector / action sheet.
 * Shows available creation tools: Edit Image, Animate Avatar, Create Poster, etc.
 * Glass-morphism overlay with blur background.
 */

import { useEffect, useRef } from 'react'

export interface ActionItem {
  id: string
  label: string
  icon: string
  description?: string
}

const DEFAULT_ACTIONS: ActionItem[] = [
  { id: 'edit-image', label: 'Edit Images', icon: '🖼️', description: 'Enhance, resize, or style your photos' },
  { id: 'animate-photo', label: 'Animate Photos', icon: '🎬', description: 'Bring still photos to life' },
  { id: 'create-avatar', label: 'Create Avatar', icon: '👤', description: 'Design your AI avatar style' },
  { id: 'generate-video', label: 'Generate Video', icon: '🎥', description: 'Text-to-video AI generation' },
  { id: 'create-poster', label: 'Create Poster', icon: '🎨', description: 'Design stunning posters' },
  { id: 'add-music', label: 'Add Music', icon: '🎵', description: 'AI soundtrack generation' },
  { id: 'write-copy', label: 'Write Copy', icon: '✍️', description: 'AI-powered copywriting' },
  { id: 'build-workflow', label: 'Build Workflow', icon: '⚡', description: 'Chain multiple AI tools' },
]

interface ActionSheetProps {
  open: boolean
  onClose: () => void
  onAction: (actionId: string) => void
  actions?: ActionItem[]
}

export function ActionSheet({ open, onClose, onAction, actions = DEFAULT_ACTIONS }: ActionSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div className="ma-sheet-backdrop" onClick={onClose} />
      <div className="ma-action-sheet" ref={sheetRef}>
        <div className="ma-sheet-handle" />
        <div className="ma-sheet-header">
          <h3 className="text-[17px] font-bold" style={{ color: '#fff' }}>Create with AI</h3>
          <button onClick={onClose} className="ma-sheet-close" type="button" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="ma-action-list">
          {actions.map(action => (
            <button
              key={action.id}
              className="ma-action-item"
              onClick={() => { onAction(action.id); onClose() }}
              type="button"
            >
              <span className="ma-action-icon">{action.icon}</span>
              <div className="ma-action-text">
                <span className="ma-action-label">{action.label}</span>
                {action.description && <span className="ma-action-desc">{action.description}</span>}
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
