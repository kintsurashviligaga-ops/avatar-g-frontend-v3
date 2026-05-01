'use client';

/**
 * components/service-chat/AgentModeButton.tsx
 * =============================================
 * Premium Agent Mode activation button.
 * Each service chatbot has this button to toggle
 * between basic chat and Agent Mode.
 * 
 * When Agent Mode is on:
 * - The specialized service agent takes control
 * - Suggestions become proactive
 * - Automation features activate
 * - Agent G coordination is enabled
 */

import { motion } from 'framer-motion';
import { Sparkles, Zap } from 'lucide-react';
import type { ServiceChatConfig, AgentMode } from './types';

interface Props {
  config: ServiceChatConfig;
  agentMode: AgentMode;
  language: string;
  onToggle: () => void;
}

export function AgentModeButton({ config, agentMode, language, onToggle }: Props) {
  const lang = (language || 'en') as 'en' | 'ka' | 'ru';
  const isAgent = agentMode === 'agent';
  const label = isAgent
    ? (config.agentModeLabel[lang] || config.agentModeLabel.en)
    : (lang === 'ka' ? 'აგენტის რეჟიმი' : lang === 'ru' ? 'Режим агента' : 'Agent Mode');

  return (
    <motion.button
      onClick={onToggle}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className="relative flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[12px] font-semibold transition-all overflow-hidden"
      style={{
        background: isAgent
          ? `linear-gradient(135deg, ${config.accentColor}25 0%, ${config.accentColor}10 100%)`
          : 'rgba(255,255,255,0.04)',
        border: `1px solid ${isAgent ? `${config.accentColor}50` : 'rgba(255,255,255,0.08)'}`,
        color: isAgent ? config.accentColor : 'var(--color-text-secondary)',
        boxShadow: isAgent
          ? `0 0 20px ${config.accentColor}20, 0 4px 16px rgba(0,0,0,0.2), inset 0 1px 0 ${config.accentColor}15`
          : '0 2px 8px rgba(0,0,0,0.1)',
      }}
    >
      {/* Animated glow background when active */}
      {isAgent && (
        <motion.div
          className="absolute inset-0 rounded-2xl"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${config.accentColor}15, transparent 70%)`,
          }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <div className="relative flex items-center gap-2">
        {isAgent ? (
          <Sparkles className="w-4 h-4" />
        ) : (
          <Zap className="w-4 h-4" />
        )}
        <span>{label}</span>
        {isAgent && (
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: config.accentColor,
              boxShadow: `0 0 6px ${config.accentColor}`,
            }}
          />
        )}
      </div>
    </motion.button>
  );
}
