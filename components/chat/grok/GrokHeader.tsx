'use client'

import Image from 'next/image'

export type ChatTab = 'ask' | 'create'

interface GrokHeaderProps {
  activeTab: ChatTab
  onTabChange: (tab: ChatTab) => void
  onMenuToggle: () => void
  serviceIcon: string
  onBack?: () => void
  onHistoryToggle?: () => void
  onCallStart?: () => void
}

export function GrokHeader({ activeTab, onTabChange, onMenuToggle, serviceIcon: _serviceIcon, onBack, onHistoryToggle, onCallStart }: GrokHeaderProps) {
  return (
    <header className="grok-header">
      {/* Left: Back + History + Menu */}
      <div className="flex items-center gap-1">
        {onBack && (
          <button onClick={onBack} className="grok-header-btn" aria-label="Back" type="button">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        )}
        <button onClick={onHistoryToggle || onMenuToggle} className="grok-header-btn" aria-label="Chat history" type="button">
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

      {/* Right: Call + Avatar with logo */}
      <div className="flex items-center gap-1.5">
        {onCallStart && (
          <button onClick={onCallStart} className="grok-header-call-premium" aria-label="Call Agent G" type="button">
            <span className="grok-header-call-pulse" />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="relative z-10">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2z" />
            </svg>
          </button>
        )}
        <button className="grok-header-avatar" type="button" aria-label="Profile" onClick={onMenuToggle}>
          <Image
            src="/brand/gemini-rocket-clean.png"
            alt="MyAvatar"
            width={22}
            height={22}
            className="object-contain relative z-10"
          />
          <span className="grok-avatar-status" />
        </button>
      </div>
    </header>
  )
}
