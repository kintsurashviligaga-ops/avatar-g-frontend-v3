'use client';

/**
 * components/service-chat/ServiceTransferBar.tsx
 * =================================================
 * Cross-service transfer action bar. Shows relevant
 * "Use in Video", "Send to Workflow", etc. buttons
 * after results are generated.
 */

import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { ICON_MAP } from './icons';
import type { ServiceChatConfig } from './types';

interface Props {
  config: ServiceChatConfig;
  language: string;
  onTransfer: (targetService: string) => void;
  show: boolean;
}

export function ServiceTransferBar({ config, language, onTransfer, show }: Props) {
  const lang = (language || 'en') as 'en' | 'ka' | 'ru';

  if (!show || config.transferActions.length === 0) return null;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="flex-shrink-0 overflow-hidden"
      style={{ borderTop: '1px solid var(--color-border)' }}
    >
      <div className="px-4 py-2.5">
        <p className="text-[10px] font-medium mb-2" style={{ color: 'var(--color-text-tertiary)' }}>
          {lang === 'ka' ? 'გაგრძელება' : lang === 'ru' ? 'Продолжить в' : 'Continue in'}
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {config.transferActions.map((ta) => {
            const Icon = ICON_MAP[ta.icon];
            return (
              <button
                key={ta.id}
                onClick={() => onTransfer(ta.targetService)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-medium flex-shrink-0 transition-all hover:scale-[1.02] active:scale-95 group"
                style={{
                  background: `${config.accentColor}08`,
                  border: `1px solid ${config.accentColor}20`,
                  color: config.accentColor,
                }}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                <span>{ta.label[lang] || ta.label.en}</span>
                <ChevronRight className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity" />
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
