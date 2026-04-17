'use client';

/**
 * components/service-chat/ServiceWelcome.tsx
 * =============================================
 * Premium welcome screen for each service chatbot.
 * Shows service identity, capabilities, welcome message, and quick actions.
 */

import { motion } from 'framer-motion';
import { Sparkles, Zap, Bot } from 'lucide-react';
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
  const serviceDesc = config.description[lang] || config.description.en;

  // Derive capability chips from tool panels
  const capabilities = config.toolPanels.slice(0, 4).map((p) => p.label[lang] || p.label.en);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 overflow-y-auto">
      {/* Ambient glow behind icon */}
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative mb-5"
      >
        <div
          className="absolute inset-[-50%] rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${config.accentColor}12 0%, transparent 60%)`,
            filter: 'blur(20px)',
          }}
        />
        <div
          className="relative w-20 h-20 rounded-2xl flex items-center justify-center text-3xl"
          style={{
            background: `linear-gradient(145deg, ${config.accentColor}18, ${config.accentColor}08)`,
            border: `1px solid ${config.accentColor}30`,
            boxShadow: `0 0 40px ${config.accentGlow}, 0 8px 32px rgba(0,0,0,0.3)`,
          }}
        >
          {config.icon}
        </div>
      </motion.div>

      {/* Service name */}
      <motion.h2
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="text-xl font-bold mb-1"
        style={{ color: 'var(--color-text)' }}
      >
        {serviceName}
      </motion.h2>

      {/* Service description */}
      <motion.p
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="text-[12px] mb-3"
        style={{ color: 'var(--color-text-tertiary)' }}
      >
        {serviceDesc}
      </motion.p>

      {/* Agent mode indicator */}
      {isAgent && (
        <motion.div
          initial={{ y: 5, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.18 }}
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

      {/* Capability chips */}
      {capabilities.length > 0 && (
        <motion.div
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex flex-wrap items-center justify-center gap-1.5 mb-5"
        >
          {capabilities.map((cap, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              <Zap className="w-2.5 h-2.5" style={{ color: config.accentColor }} />
              {cap}
            </span>
          ))}
        </motion.div>
      )}

      {/* Welcome message */}
      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.25 }}
        className="rounded-2xl px-5 py-4 mb-6 max-w-[420px] text-center"
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex items-center justify-center gap-1.5 mb-2">
          <Bot className="w-3.5 h-3.5" style={{ color: config.accentColor }} />
          <span className="text-[10px] font-bold tracking-[0.15em] uppercase" style={{ color: config.accentColor }}>
            {isAgent ? 'Agent' : 'Assistant'}
          </span>
        </div>
        <p
          className="text-[13px] leading-relaxed"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {welcomeText}
        </p>
      </motion.div>

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
