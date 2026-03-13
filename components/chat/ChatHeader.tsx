'use client';

/**
 * components/chat/ChatHeader.tsx
 * ==============================
 * Premium chat header with Agent G identity, mode indicator,
 * active agent status, and panel controls.
 */

import {
  ChevronDown, Maximize2, Minimize2, X, RotateCcw,
  Sparkles, Zap, FolderOpen, Bot, User,
} from 'lucide-react';
import type { ChatMode } from '@/lib/chat/types.legacy';
import { getAgentContract } from '@/lib/agents/contracts';
import { getChatLabels } from '@/lib/chat/constants.legacy';

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
  showAgentPicker: boolean;
}

const MODE_ICONS: Record<ChatMode, typeof Bot> = {
  assistant: Bot,
  action: Zap,
  workflow: Sparkles,
  project: FolderOpen,
  agent: User,
};

export function ChatHeader({
  activeAgentId, delegatedAgents, mode, projectName, language,
  isExpanded, onToggleExpanded, onClose, onNewSession,
  onToggleAgentPicker, showAgentPicker,
}: Props) {
  const labels = getChatLabels(language);
  const agent = getAgentContract(activeAgentId);
  const ModeIcon = MODE_ICONS[mode] || Bot;
  const modeLabel = labels[`mode${mode.charAt(0).toUpperCase() + mode.slice(1)}` as keyof typeof labels] || mode;

  return (
    <div className="flex-shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
      {/* Main header row */}
      <div className="flex items-center justify-between px-4 py-3">
        {/* Left: Agent identity + mode */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Agent G logo */}
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, var(--color-accent), #8b5cf6)',
              boxShadow: '0 0 20px var(--color-accent-soft)',
            }}>
            <span className="text-white text-sm font-bold">G</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold truncate"
                style={{ color: 'var(--color-text)' }}>
                {labels.title}
              </h3>
              {/* Mode chip */}
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 flex-shrink-0"
                style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
                <ModeIcon className="w-3 h-3" />
                {modeLabel}
              </span>
            </div>
            {/* Subtitle / project name / agent status */}
            <p className="text-[11px] truncate" style={{ color: 'var(--color-text-tertiary)' }}>
              {projectName
                ? `📁 ${projectName}`
                : delegatedAgents.length > 0
                  ? `${labels.delegatedTo} ${delegatedAgents.map(id => getAgentContract(id)?.name || id).join(', ')}`
                  : labels.subtitle
              }
            </p>
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={onNewSession}
            className="p-2 rounded-xl transition-colors hover:bg-white/5"
            style={{ color: 'var(--color-text-tertiary)' }}
            title={labels.newSession}>
            <RotateCcw className="w-4 h-4" />
          </button>
          <button onClick={onToggleExpanded}
            className="p-2 rounded-xl transition-colors hover:bg-white/5 hidden sm:flex"
            style={{ color: 'var(--color-text-tertiary)' }}
            title={isExpanded ? labels.collapse : labels.expand}>
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={onClose}
            className="p-2 rounded-xl transition-colors hover:bg-white/5"
            style={{ color: 'var(--color-text-tertiary)' }}
            title={labels.close}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Agent control strip */}
      {activeAgentId !== 'agent-g' && (
        <div className="px-4 pb-2 flex items-center gap-2">
          <button onClick={onToggleAgentPicker}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors hover:bg-white/5"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
            <span>{agent?.icon || '◈'}</span>
            <span className="font-medium">{agent?.name || activeAgentId}</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${showAgentPicker ? 'rotate-180' : ''}`} />
          </button>
          <span className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
            {labels.recommendedBy}
          </span>
        </div>
      )}
    </div>
  );
}
