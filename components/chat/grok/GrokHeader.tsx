'use client'

import { useState } from 'react'

export type ChatTab = 'ask' | 'create'

interface GrokHeaderProps {
  activeTab: ChatTab
  onTabChange: (tab: ChatTab) => void
  onMenuToggle: () => void
  serviceIcon: string
}

export function GrokHeader({ activeTab, onTabChange, onMenuToggle, serviceIcon }: GrokHeaderProps) {
  return (
    <header className="grok-header">
      {/* Left: Menu */}
      <button
        onClick={onMenuToggle}
        className="grok-header-btn"
        aria-label="Menu"
        type="button"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>

      {/* Center: Tabs */}
      <div className="grok-header-tabs">
        <button
          onClick={() => onTabChange('ask')}
          className={`grok-header-tab ${activeTab === 'ask' ? 'active' : ''}`}
          type="button"
        >
          Ask
        </button>
        <button
          onClick={() => onTabChange('create')}
          className={`grok-header-tab ${activeTab === 'create' ? 'active' : ''}`}
          type="button"
        >
          Create
        </button>
      </div>

      {/* Right: Agent avatar */}
      <button className="grok-header-avatar" type="button" aria-label="Profile">
        <span className="text-[16px]">{serviceIcon}</span>
      </button>
    </header>
  )
}
