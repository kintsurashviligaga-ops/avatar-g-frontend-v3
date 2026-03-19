'use client'

import { useState } from 'react'

export type ChatTab = 'ask' | 'create'

interface GrokHeaderProps {
  activeTab: ChatTab
  onTabChange: (tab: ChatTab) => void
  onMenuToggle: () => void
  serviceIcon: string
  onBack?: () => void
}

export function GrokHeader({ activeTab, onTabChange, onMenuToggle, serviceIcon, onBack }: GrokHeaderProps) {
  return (
    <header className="grok-header">
      {/* Left: Back + Menu */}
      <div className="flex items-center gap-1">
        {onBack && (
          <button onClick={onBack} className="grok-header-btn" aria-label="Back" type="button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        )}
        <button onClick={onMenuToggle} className="grok-header-btn" aria-label="Menu" type="button">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        </button>
      </div>

      {/* Center: Tabs with animated indicator */}
      <div className="grok-header-tabs">
        <button
          onClick={() => onTabChange('ask')}
          className={`grok-header-tab ${activeTab === 'ask' ? 'active' : ''}`}
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="inline mr-1.5 -mt-0.5">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          Ask
        </button>
        <button
          onClick={() => onTabChange('create')}
          className={`grok-header-tab ${activeTab === 'create' ? 'active' : ''}`}
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="inline mr-1.5 -mt-0.5">
            <path d="M12 3v18M3 12h18" />
          </svg>
          Create
        </button>
      </div>

      {/* Right: Agent avatar with status ring */}
      <button className="grok-header-avatar" type="button" aria-label="Profile">
        <span className="text-[16px]">{serviceIcon}</span>
        <span className="grok-avatar-status" />
      </button>
    </header>
  )
}
