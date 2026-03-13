'use client';

/**
 * components/chat/shell/ChatHeaderBar.tsx
 * ========================================
 * Premium header with Agent G branding, mode chip, project chip,
 * active agent indicator, and panel controls.
 */

import {
  Maximize2, Minimize2, X, RotateCcw,
  Sparkles, Zap, FolderOpen, Bot, User,
} from 'lucide-react';
import type { ChatMode } from '@/lib/chat/types';
import { AgentBadge } from '../shared/AgentBadge';
import { getChatLabels, getModeLabel } from '@/lib/chat/config/localization';

interface Props {
  activeAgentId: string;
  delegatedAgents: string[];
  mode: ChatMode;
  projectName?: string;
  language: string;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onClose: () => void;
  onNewSession: () => void;
  onToggleAgentPicker: () => void;
}

const MODE_ICONS: Record<ChatMode, typeof Bot> = {
  assistant: Bot,
  action: Zap,
  workflow: Sparkles,
  project: FolderOpen,
  agent: User,
};

export function ChatHeaderBar({
  activeAgentId, delegatedAgents, mode, projectName, language,
  isExpanded, onToggleExpanded, onClose, onNewSession, onToggleAgentPicker,
}: Props) {
  const labels = getChatLabels(language);
  const ModeIcon = MODE_ICONS[mode] || Bot;
  const modeLabel = getModeLabel(mode, language);

  return (
    <div className="flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
      <div className="flex items-center justify-between px-4 py-3">
        {/* Left: Agent identity + mode */}
        <button
          onClick={onToggleAgentPicker}
          className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity"
        >
          <AgentBadge agentId={activeAgentId} size="md" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>
                {labels.title}
              </h3>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 flex-shrink-0"
                style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
              >
                <ModeIcon className="w-3 h-3" />
                {modeLabel}
              </span>
            </div>
            <p className="text-[11px] truncate" style={{ color: 'var(--color-text-tertiary)' }}>
              {projectName
                ? `📁 ${projectName}`
                : delegatedAgents.length > 0
                  ? `Coordinating ${delegatedAgents.length} agents`
                  : labels.subtitle}
            </p>
          </div>
        </button>

        {/* Right: Controls */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={onNewSession}
            className="p-2 rounded-xl transition-colors hover:bg-white/5"
            style={{ color: 'var(--color-text-tertiary)' }}
            title={labels.newSession}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleExpanded}
            className="p-2 rounded-xl transition-colors hover:bg-white/5 hidden sm:flex"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-xl transition-colors hover:bg-white/5"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
