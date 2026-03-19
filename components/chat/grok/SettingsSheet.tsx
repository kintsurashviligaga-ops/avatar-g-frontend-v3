'use client'

/**
 * SettingsSheet — Premium bottom-sheet settings panel.
 * Adapts per service: duration, resolution, aspect ratio, style, etc.
 * Glass-morphism design, MyAvatar.ge branded.
 */

import { useEffect, useRef, useCallback } from 'react'

export interface SettingsConfig {
  duration?: { options: string[]; value: string }
  resolution?: { options: string[]; value: string }
  aspectRatio?: { options: { label: string; value: string; icon?: 'portrait' | 'landscape' | 'square' | 'tall' | 'wide' }[]; value: string }
  speakToCreate?: boolean
}

interface SettingsSheetProps {
  open: boolean
  onClose: () => void
  settings: SettingsConfig
  onSettingChange: (key: string, value: string) => void
  onToggleSpeakToCreate?: () => void
  title?: string
}

export function SettingsSheet({ open, onClose, settings, onSettingChange, onToggleSpeakToCreate, title = 'Imagine Settings' }: SettingsSheetProps) {
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
      {/* Backdrop */}
      <div className="ma-sheet-backdrop" onClick={onClose} />

      {/* Sheet */}
      <div className="ma-settings-sheet" ref={sheetRef}>
        {/* Drag handle */}
        <div className="ma-sheet-handle" />

        {/* Header */}
        <div className="ma-sheet-header">
          <h3 className="text-[17px] font-bold" style={{ color: '#fff' }}>{title}</h3>
          <button onClick={onClose} className="ma-sheet-close" type="button" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Duration */}
        {settings.duration && (
          <div className="ma-setting-row">
            <span className="ma-setting-label">Video Duration</span>
            <div className="ma-setting-options">
              {settings.duration.options.map(opt => (
                <button
                  key={opt}
                  className={`ma-setting-pill ${settings.duration!.value === opt ? 'active' : ''}`}
                  onClick={() => onSettingChange('duration', opt)}
                  type="button"
                >{opt}</button>
              ))}
            </div>
          </div>
        )}

        {/* Resolution */}
        {settings.resolution && (
          <div className="ma-setting-row">
            <span className="ma-setting-label">Video Resolution</span>
            <div className="ma-setting-options">
              {settings.resolution.options.map(opt => (
                <button
                  key={opt}
                  className={`ma-setting-pill ${settings.resolution!.value === opt ? 'active' : ''}`}
                  onClick={() => onSettingChange('resolution', opt)}
                  type="button"
                >{opt}</button>
              ))}
            </div>
          </div>
        )}

        {/* Aspect Ratio */}
        {settings.aspectRatio && (
          <div className="ma-setting-row">
            <span className="ma-setting-label">Aspect Ratio</span>
            <div className="ma-aspect-options">
              {settings.aspectRatio.options.map(opt => (
                <button
                  key={opt.value}
                  className={`ma-aspect-btn ${settings.aspectRatio!.value === opt.value ? 'active' : ''}`}
                  onClick={() => onSettingChange('aspectRatio', opt.value)}
                  type="button"
                >
                  <div className={`ma-aspect-icon ma-aspect-${opt.icon || 'square'}`} />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Speak to create toggle */}
        {onToggleSpeakToCreate && (
          <div className="ma-setting-row">
            <span className="ma-setting-label">Speak to Create Images</span>
            <button
              onClick={onToggleSpeakToCreate}
              className={`ma-toggle ${settings.speakToCreate ? 'active' : ''}`}
              type="button"
              role="switch"
              aria-checked={settings.speakToCreate}
            >
              <div className="ma-toggle-thumb" />
            </button>
          </div>
        )}

        {/* Footer note */}
        <p className="text-[12px] px-5 pb-5 mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
          For text-to-image and text-to-video generations.
        </p>
      </div>
    </>
  )
}
