'use client';

/**
 * components/chat/panels/WelcomePanel.tsx
 * =========================================
 * Welcome screen shown when no messages exist.
 * Shows Agent G branding, quick actions, and service shortcuts.
 */

import { motion } from 'framer-motion';
import { getChatLabels } from '@/lib/chat/config/localization';
import { QuickActions } from './QuickActions';
import { ServiceShortcutGrid } from './ServiceShortcutGrid';

interface Props {
  language: string;
  hasProject: boolean;
  onAction: (action: string) => void;
  onServiceSelect: (agentId: string, action: string) => void;
}

export function WelcomePanel({ language, hasProject, onAction, onServiceSelect }: Props) {
  const labels = getChatLabels(language);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6"
      style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--color-border) transparent' }}>
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center"
      >
        <div
          className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, var(--color-accent), #0891b2)',
            boxShadow: '0 0 32px var(--color-accent-soft)',
          }}
        >
          <span className="text-white text-xl font-bold">G</span>
        </div>
        <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--color-text)' }}>
          {labels.welcome}
        </h2>
        <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          {labels.welcomeSub}
        </p>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-2.5"
          style={{ color: 'var(--color-text-tertiary)' }}>
          {labels.actionsLabel}
        </h3>
        <QuickActions language={language} hasProject={hasProject} onAction={onAction} />
      </motion.div>

      {/* Services */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-2.5"
          style={{ color: 'var(--color-text-tertiary)' }}>
          {labels.servicesLabel}
        </h3>
        <ServiceShortcutGrid language={language} onSelect={onServiceSelect} />
      </motion.div>
    </div>
  );
}
