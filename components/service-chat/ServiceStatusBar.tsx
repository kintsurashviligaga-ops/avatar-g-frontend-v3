'use client';

/**
 * components/service-chat/ServiceStatusBar.tsx
 * =============================================
 * Slim status bar shown below the header:
 * connection indicator, active mode, capability count.
 */

import { Wifi, Sparkles, Bot, Zap } from 'lucide-react';
import type { ServiceChatConfig, AgentMode } from './types';

interface Props {
  config: ServiceChatConfig;
  language: string;
  isLoading: boolean;
  agentMode: AgentMode;
}

export function ServiceStatusBar({ config, language, isLoading, agentMode }: Props) {
  const lang = (language || 'en') as 'en' | 'ka' | 'ru';
  const isAgent = agentMode === 'agent';
  const panelCount = config.toolPanels.length;
  const transferCount = config.transferActions.length;

  const readyLabel = lang === 'ka' ? 'მზადაა' : lang === 'ru' ? 'Готово' : 'Ready';
  const processingLabel = lang === 'ka' ? 'მუშავდება...' : lang === 'ru' ? 'Обработка...' : 'Processing...';
  const toolsLabel = lang === 'ka' ? 'ხელსაწყო' : lang === 'ru' ? 'инструм.' : 'tools';
  const linksLabel = lang === 'ka' ? 'კავშირი' : lang === 'ru' ? 'связей' : 'links';
  const agentLabel = lang === 'ka' ? 'აგენტი' : lang === 'ru' ? 'Агент' : 'Agent';
  const chatLabel = lang === 'ka' ? 'ჩატი' : lang === 'ru' ? 'Чат' : 'Chat';

  return (
    <div
      className="flex items-center justify-between px-4 py-1.5 flex-shrink-0"
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(0,0,0,0.08)',
      }}
    >
      {/* Left: Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: isLoading ? '#fbbf24' : '#34d399',
              boxShadow: isLoading ? '0 0 6px #fbbf2480' : '0 0 6px #34d39980',
            }}
          />
          <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
            {isLoading ? processingLabel : readyLabel}
          </span>
        </div>

        <div className="flex items-center gap-1" style={{ color: 'var(--color-text-tertiary)', opacity: 0.6 }}>
          {isAgent ? <Sparkles className="w-2.5 h-2.5" /> : <Bot className="w-2.5 h-2.5" />}
          <span className="text-[9px]">{isAgent ? agentLabel : chatLabel}</span>
        </div>
      </div>

      {/* Right: Capability badges */}
      <div className="flex items-center gap-2.5">
        {panelCount > 0 && (
          <span className="text-[9px] font-medium flex items-center gap-1" style={{ color: 'var(--color-text-tertiary)', opacity: 0.5 }}>
            <Zap className="w-2.5 h-2.5" />
            {panelCount} {toolsLabel}
          </span>
        )}
        {transferCount > 0 && (
          <span className="text-[9px] font-medium flex items-center gap-1" style={{ color: 'var(--color-text-tertiary)', opacity: 0.5 }}>
            <Wifi className="w-2.5 h-2.5" />
            {transferCount} {linksLabel}
          </span>
        )}
      </div>
    </div>
  );
}
