'use client';

/**
 * components/service-chat/ServiceChatHeader.tsx
 * ===============================================
 * Premium header bar for every service chatbot.
 * Shows service identity with breadcrumb, agent badge, agent mode toggle,
 * hamburger trigger, tool panel triggers, and session count.
 */

import { useCallback } from 'react';
import {
  Menu, X, Sparkles, Bot, RotateCcw, Settings2,
  ChevronDown, ChevronRight, Home,
} from 'lucide-react';
import Link from 'next/link';
import type { ServiceChatConfig, AgentMode } from './types';

interface Props {
  config: ServiceChatConfig;
  agentMode: AgentMode;
  language: string;
  showHamburger: boolean;
  onToggleHamburger: () => void;
  onToggleAgentMode: () => void;
  onNewSession: () => void;
  onToggleToolPanel: () => void;
}

export function ServiceChatHeader({
  config, agentMode, language, showHamburger,
  onToggleHamburger, onToggleAgentMode, onNewSession, onToggleToolPanel,
}: Props) {
  const lang = (language || 'en') as 'en' | 'ka' | 'ru';
  const name = config.name[lang] || config.name.en;
  const isAgent = agentMode === 'agent';
  const modeLabel = isAgent
    ? (config.agentModeLabel[lang] || config.agentModeLabel.en)
    : (lang === 'ka' ? 'ჩატი' : lang === 'ru' ? 'Чат' : 'Chat');

  const servicesLabel = lang === 'ka' ? 'სერვისები' : lang === 'ru' ? 'Сервисы' : 'Services';

  return (
    <div
      className="flex items-center justify-between px-4 py-3 flex-shrink-0"
      style={{
        borderBottom: '1px solid var(--color-border)',
        background: 'rgba(0,0,0,0.15)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Left: Hamburger + identity with breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onToggleHamburger}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors hover:bg-white/5"
          style={{ color: showHamburger ? config.accentColor : 'var(--color-text-tertiary)' }}
        >
          {showHamburger ? <X className="w-[18px] h-[18px]" /> : <Menu className="w-[18px] h-[18px]" />}
        </button>

        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0"
            style={{
              background: `${config.accentColor}18`,
              border: `1px solid ${config.accentColor}30`,
              boxShadow: `0 0 12px ${config.accentGlow}`,
            }}
          >
            {config.icon}
          </div>
          <div className="min-w-0">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1 mb-0.5">
              <Link
                href={`/${language}/services`}
                className="text-[10px] font-medium transition-colors hover:underline"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {servicesLabel}
              </Link>
              <ChevronRight className="w-2.5 h-2.5" style={{ color: 'var(--color-text-tertiary)', opacity: 0.5 }} />
              <span className="text-[10px] font-medium truncate" style={{ color: config.accentColor }}>
                {name}
              </span>
            </div>
            <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>
              {name}
            </h3>
          </div>
        </div>
      </div>

      {/* Right: Mode + controls */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Agent Mode chip */}
        <button
          onClick={onToggleAgentMode}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-all"
          style={{
            background: isAgent ? `${config.accentColor}20` : 'rgba(255,255,255,0.04)',
            color: isAgent ? config.accentColor : 'var(--color-text-tertiary)',
            border: `1px solid ${isAgent ? `${config.accentColor}40` : 'transparent'}`,
            boxShadow: isAgent ? `0 0 12px ${config.accentGlow}` : 'none',
          }}
        >
          {isAgent ? <Sparkles className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
          {modeLabel}
        </button>

        {/* Tool panel */}
        {config.toolPanels.length > 0 && (
          <button
            onClick={onToggleToolPanel}
            className="p-2 rounded-xl transition-colors hover:bg-white/5"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <Settings2 className="w-4 h-4" />
          </button>
        )}

        {/* New session */}
        <button
          onClick={onNewSession}
          className="p-2 rounded-xl transition-colors hover:bg-white/5"
          style={{ color: 'var(--color-text-tertiary)' }}
          title={lang === 'ka' ? 'ახალი სესია' : lang === 'ru' ? 'Новая сессия' : 'New session'}
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
