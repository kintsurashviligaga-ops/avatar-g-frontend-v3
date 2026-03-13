'use client';

/**
 * components/chat/panels/ServiceShortcutGrid.tsx
 * =================================================
 * Grid of service shortcut pills from config.
 */

import { SERVICE_SHORTCUTS } from '@/lib/chat/config/quickActionConfig';

interface Props {
  language: string;
  onSelect: (agentId: string, action: string) => void;
}

export function ServiceShortcutGrid({ language, onSelect }: Props) {
  const lang = (language === 'ka' || language === 'ru') ? language : 'en';

  return (
    <div className="grid grid-cols-2 gap-2">
      {SERVICE_SHORTCUTS.map((shortcut) => (
        <button
          key={shortcut.slug}
          onClick={() => onSelect(shortcut.agentId, `I want to use the ${shortcut.label.en} service`)}
          className="flex items-center gap-2.5 p-3 rounded-2xl text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}
        >
          <span className="text-lg flex-shrink-0">{shortcut.icon}</span>
          <p className="text-xs font-semibold truncate" style={{ color: 'var(--color-text)' }}>
            {shortcut.label[lang]}
          </p>
        </button>
      ))}
    </div>
  );
}
