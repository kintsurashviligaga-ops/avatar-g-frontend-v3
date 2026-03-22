'use client';

/**
 * components/service-chat/ServiceWelcome.tsx
 * =============================================
 * Clean, breathing welcome screen for each service chatbot.
 * Shows service identity, welcome message, and quick actions.
 * Grok-style simplicity: focused, not crowded.
 */

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { ServiceQuickActions } from './ServiceQuickActions';
import type { ServiceChatConfig, AgentMode } from './types';

interface Props {
  config: ServiceChatConfig;
  agentMode: AgentMode;
  language: string;
  onAction: (action: string) => void;
}

export function ServiceWelcome({ config, agentMode, language, onAction }: Props) {
  const lang = (language || 'en') as 'en' | 'ka' | 'ru';
  const isAgent = agentMode === 'agent';
  const welcomeText = config.welcomeMessage[lang] || config.welcomeMessage.en;
  const serviceName = config.name[lang] || config.name.en;

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 overflow-y-auto">
      {/* Service icon — large, glowing */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl mb-4"
        style={{
          background: `${config.accentColor}15`,
          border: `1px solid ${config.accentColor}25`,
          boxShadow: `0 0 40px ${config.accentGlow}, 0 0 80px ${config.accentColor}08`,
        }}
      >
        {config.icon}
      </motion.div>

      {/* Service name */}
      <motion.h2
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="text-lg font-bold mb-1"
        style={{ color: 'var(--color-text)' }}
      >
        {serviceName}
      </motion.h2>

      {/* Agent mode indicator */}
      {isAgent && (
        <motion.div
          initial={{ y: 5, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full mb-3"
          style={{
            background: `${config.accentColor}15`,
            border: `1px solid ${config.accentColor}30`,
          }}
        >
          <Sparkles className="w-3 h-3" style={{ color: config.accentColor }} />
          <span className="text-[11px] font-medium" style={{ color: config.accentColor }}>
            {config.agentModeLabel[lang] || config.agentModeLabel.en}
          </span>
        </motion.div>
      )}

      {/* Welcome message */}
      <motion.p
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-[13px] text-center max-w-[360px] leading-relaxed mb-6"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {welcomeText}
      </motion.p>

      {/* Quick Actions */}
      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="w-full max-w-[420px]"
      >
        <ServiceQuickActions config={config} language={language} onAction={onAction} />
      </motion.div>
    </div>
  );
}
