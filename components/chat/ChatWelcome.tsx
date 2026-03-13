'use client';

/**
 * components/chat/ChatWelcome.tsx
 * ===============================
 * Premium welcome panel shown when chat has no messages.
 * Shows Agent G identity, starter suggestions, quick actions,
 * and service shortcuts.
 */

import { Sparkles } from 'lucide-react';
import { QUICK_ACTIONS, SERVICE_SHORTCUTS, getChatLabels } from '@/lib/chat/constants.legacy';
import type { QuickAction } from '@/lib/chat/types.legacy';

interface Props {
  language: string;
  onAction: (action: string) => void;
  onServiceSelect: (agentId: string, action: string) => void;
}

export function ChatWelcome({ language, onAction, onServiceSelect }: Props) {
  const labels = getChatLabels(language);
  const lang = language as 'en' | 'ka' | 'ru';

  // Group quick actions by category
  const createActions = QUICK_ACTIONS.filter(a => a.category === 'create').slice(0, 4);
  const workflowActions = QUICK_ACTIONS.filter(a => a.category === 'workflow' || a.category === 'project').slice(0, 3);
  const discoverActions = QUICK_ACTIONS.filter(a => a.category === 'discover' || a.category === 'tools').slice(0, 2);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      {/* Agent G Identity */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, var(--color-accent), #8b5cf6)',
            boxShadow: '0 8px 32px var(--color-accent-soft)',
          }}>
          <span className="text-white text-2xl font-bold">G</span>
        </div>
        <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--color-text)' }}>
          {labels.welcome}
        </h2>
        <p className="text-sm max-w-xs mx-auto leading-relaxed"
          style={{ color: 'var(--color-text-secondary)' }}>
          {labels.welcomeSub}
        </p>
      </div>

      {/* Starter Actions — Create */}
      <div className="mb-5">
        <div className="grid grid-cols-2 gap-2">
          {createActions.map(action => (
            <QuickActionCard
              key={action.id}
              action={action}
              lang={lang}
              onClick={() => onAction(action.action)}
            />
          ))}
        </div>
      </div>

      {/* Workflow & Project */}
      <div className="mb-5">
        <div className="grid grid-cols-2 gap-2">
          {workflowActions.map(action => (
            <QuickActionCard
              key={action.id}
              action={action}
              lang={lang}
              onClick={() => onAction(action.action)}
              variant="secondary"
            />
          ))}
          {discoverActions.map(action => (
            <QuickActionCard
              key={action.id}
              action={action}
              lang={lang}
              onClick={() => onAction(action.action)}
              variant="secondary"
            />
          ))}
        </div>
      </div>

      {/* Service shortcuts */}
      <div>
        <h4 className="text-[11px] font-medium uppercase tracking-wider mb-3 px-1"
          style={{ color: 'var(--color-text-tertiary)' }}>
          {labels.servicesLabel}
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {SERVICE_SHORTCUTS.slice(0, 10).map(svc => (
            <button
              key={svc.slug}
              onClick={() => onServiceSelect(svc.agentId, `Help me with ${svc.label.en}`)}
              className="text-[11px] px-2.5 py-1.5 rounded-lg font-medium transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-1.5"
              style={{
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
              }}
            >
              <span>{svc.icon}</span>
              {svc.label[lang] || svc.label.en}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Quick Action Card ───────────────────────────────────────────────────────

function QuickActionCard({ action, lang, onClick, variant = 'primary' }: {
  action: QuickAction;
  lang: 'en' | 'ka' | 'ru';
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <button
      onClick={onClick}
      className="text-left p-3 rounded-xl transition-all duration-150 hover:scale-[1.01] active:scale-[0.99] group"
      style={{
        backgroundColor: variant === 'primary' ? 'var(--color-surface)' : 'var(--color-elevated)',
        border: '1px solid var(--color-border)',
      }}
    >
      <span className="text-lg block mb-1">{action.icon}</span>
      <span className="text-xs font-medium block"
        style={{ color: 'var(--color-text)' }}>
        {action.label[lang] || action.label.en}
      </span>
    </button>
  );
}
