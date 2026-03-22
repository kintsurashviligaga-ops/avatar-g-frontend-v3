'use client';

/**
 * components/service-chat/ServiceQuickActions.tsx
 * =================================================
 * Action selector chips / cards for each service chatbot.
 * Displayed as horizontally scrollable premium chips
 * grouped by category. Users tap to select an operation.
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ICON_MAP } from './icons';
import type { ServiceChatConfig, ServiceQuickAction } from './types';

interface Props {
  config: ServiceChatConfig;
  language: string;
  onAction: (action: string) => void;
}

export function ServiceQuickActions({ config, language, onAction }: Props) {
  const lang = (language || 'en') as 'en' | 'ka' | 'ru';

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, ServiceQuickAction[]>();
    for (const qa of config.quickActions) {
      const cat = qa.category || 'default';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(qa);
    }
    return map;
  }, [config.quickActions]);

  if (config.quickActions.length === 0) return null;

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap gap-2">
        {config.quickActions.map((qa, idx) => {
          const Icon = ICON_MAP[qa.icon];
          const label = qa.label[lang] || qa.label.en;

          return (
            <motion.button
              key={qa.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04, duration: 0.25 }}
              onClick={() => onAction(qa.action)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12px] font-medium transition-all hover:scale-[1.02] active:scale-95"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--color-text-secondary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${config.accentColor}40`;
                e.currentTarget.style.background = `${config.accentColor}10`;
                e.currentTarget.style.color = config.accentColor;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                e.currentTarget.style.color = 'var(--color-text-secondary)';
              }}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              {label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
