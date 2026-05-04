'use client';

/**
 * components/service-chat/ServiceStatusBar.tsx
 * =============================================
 * Slim status bar shown below the header:
 * connection indicator, active mode, capability count.
 */

import { useEffect, useState } from 'react';
import { Wifi, Sparkles, Bot, Zap, KeyRound, Wallet } from 'lucide-react';
import type { ServiceChatConfig, AgentMode } from './types';

type KeyStatus = 'ready' | 'partial' | 'missing';

type AppStatusResponse = {
  keys?: {
    status?: KeyStatus;
    configured?: number;
    total?: number;
  };
  billing?: {
    balance?: number | null;
  };
};

interface Props {
  config: ServiceChatConfig;
  language: string;
  isLoading: boolean;
  agentMode: AgentMode;
  selectedOptions: Record<string, unknown>;
}

export function ServiceStatusBar({ config, language, isLoading, agentMode, selectedOptions }: Props) {
  const lang = (language || 'en') as 'en' | 'ka' | 'ru';
  const isAgent = agentMode === 'agent';
  const panelCount = config.toolPanels.length;
  const transferCount = config.transferActions.length;
  const selectedCredits = findSelectedCredits(config, selectedOptions);
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
  const [configuredKeys, setConfiguredKeys] = useState<number | null>(null);
  const [totalKeys, setTotalKeys] = useState<number | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadStatus = async () => {
      try {
        const response = await fetch('/api/app/status', {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const payload = await response.json() as AppStatusResponse;

        if (cancelled) {
          return;
        }

        const configured = typeof payload.keys?.configured === 'number' ? payload.keys.configured : null;
        const total = typeof payload.keys?.total === 'number' ? payload.keys.total : null;
        const status = payload.keys?.status;
        const billingBalance = typeof payload.billing?.balance === 'number' ? payload.billing.balance : null;

        setConfiguredKeys(configured);
        setTotalKeys(total);
        setKeyStatus(status === 'ready' || status === 'partial' || status === 'missing' ? status : null);
        setBalance(billingBalance);
      } catch {
        // Hide runtime badges quietly if status endpoint is unavailable.
      }
    };

    void loadStatus();
    const interval = window.setInterval(() => {
      void loadStatus();
    }, 60000);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  const readyLabel = lang === 'ka' ? 'მზადაა' : lang === 'ru' ? 'Готово' : 'Ready';
  const processingLabel = lang === 'ka' ? 'მუშავდება...' : lang === 'ru' ? 'Обработка...' : 'Processing...';
  const toolsLabel = lang === 'ka' ? 'ხელსაწყო' : lang === 'ru' ? 'инструм.' : 'tools';
  const linksLabel = lang === 'ka' ? 'კავშირი' : lang === 'ru' ? 'связей' : 'links';
  const creditsLabel = lang === 'ka' ? 'კრედიტი' : lang === 'ru' ? 'кред.' : 'credits';
  const keysLabel = lang === 'ka' ? 'ქიები' : lang === 'ru' ? 'ключи' : 'keys';
  const balanceLabel = lang === 'ka' ? 'ბალანსი' : lang === 'ru' ? 'баланс' : 'balance';
  const agentLabel = lang === 'ka' ? 'აგენტი' : lang === 'ru' ? 'Агент' : 'Agent';
  const chatLabel = lang === 'ka' ? 'ჩატი' : lang === 'ru' ? 'Чат' : 'Chat';
  const keyColor = keyStatus === 'ready'
    ? '#86efac'
    : keyStatus === 'partial'
      ? '#fcd34d'
      : '#fca5a5';

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
        {typeof configuredKeys === 'number' && typeof totalKeys === 'number' && (
          <span
            data-testid="service-keys-status"
            className="text-[9px] font-medium flex items-center gap-1"
            style={{ color: keyColor, opacity: 0.75 }}
          >
            <KeyRound className="w-2.5 h-2.5" />
            {keysLabel} {configuredKeys}/{totalKeys}
          </span>
        )}
        {typeof balance === 'number' && (
          <span
            data-testid="service-balance-status"
            className="text-[9px] font-medium flex items-center gap-1"
            style={{ color: 'var(--color-text-tertiary)', opacity: 0.7 }}
          >
            <Wallet className="w-2.5 h-2.5" />
            {balanceLabel} {Math.max(0, Math.round(balance))} {creditsLabel}
          </span>
        )}
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
        {typeof selectedCredits === 'number' && (
          <span className="text-[9px] font-medium flex items-center gap-1" style={{ color: 'var(--color-text-tertiary)', opacity: 0.65 }}>
            <Sparkles className="w-2.5 h-2.5" />
            {selectedCredits} {creditsLabel}
          </span>
        )}
      </div>
    </div>
  );
}

function findSelectedCredits(config: ServiceChatConfig, selectedOptions: Record<string, unknown>): number | null {
  for (const panel of config.toolPanels) {
    for (const option of panel.options) {
      if (option.type !== 'chips' || !option.options) continue;
      const selectedValue = selectedOptions[option.id];
      if (typeof selectedValue !== 'string') continue;
      const selected = option.options.find((item) => item.value === selectedValue);
      if (typeof selected?.credits === 'number') {
        return selected.credits;
      }
    }
  }

  return null;
}
