/**
 * lib/chat/config/messageRenderConfig.ts
 * Defines render strategy per message type.
 */

import type { MessageType } from '../types';

export interface MessageRenderConfig {
  type: MessageType;
  alignment: 'left' | 'right' | 'center' | 'full';
  showAvatar: boolean;
  showTimestamp: boolean;
  animated: boolean;
  maxWidth: string;
  bgClass: string;
}

export const MESSAGE_RENDER_MAP: Record<MessageType, MessageRenderConfig> = {
  user: {
    type: 'user',
    alignment: 'right',
    showAvatar: false,
    showTimestamp: false,
    animated: true,
    maxWidth: 'max-w-[85%]',
    bgClass: 'bg-[var(--color-accent)]/15',
  },
  assistant: {
    type: 'assistant',
    alignment: 'left',
    showAvatar: true,
    showTimestamp: false,
    animated: true,
    maxWidth: 'max-w-[90%]',
    bgClass: 'bg-white/[0.04]',
  },
  handoff: {
    type: 'handoff',
    alignment: 'center',
    showAvatar: false,
    showTimestamp: false,
    animated: true,
    maxWidth: 'max-w-[90%]',
    bgClass: 'bg-white/[0.03]',
  },
  'workflow-progress': {
    type: 'workflow-progress',
    alignment: 'full',
    showAvatar: false,
    showTimestamp: false,
    animated: true,
    maxWidth: 'max-w-full',
    bgClass: 'bg-white/[0.03]',
  },
  result: {
    type: 'result',
    alignment: 'left',
    showAvatar: true,
    showTimestamp: false,
    animated: true,
    maxWidth: 'max-w-[95%]',
    bgClass: 'bg-white/[0.04]',
  },
  clarification: {
    type: 'clarification',
    alignment: 'left',
    showAvatar: false,
    showTimestamp: false,
    animated: true,
    maxWidth: 'max-w-[90%]',
    bgClass: 'bg-amber-500/5',
  },
  suggestion: {
    type: 'suggestion',
    alignment: 'center',
    showAvatar: false,
    showTimestamp: false,
    animated: true,
    maxWidth: 'max-w-full',
    bgClass: '',
  },
  system: {
    type: 'system',
    alignment: 'center',
    showAvatar: false,
    showTimestamp: false,
    animated: false,
    maxWidth: 'max-w-[80%]',
    bgClass: '',
  },
  error: {
    type: 'error',
    alignment: 'left',
    showAvatar: false,
    showTimestamp: false,
    animated: true,
    maxWidth: 'max-w-[90%]',
    bgClass: 'bg-red-500/5',
  },
  welcome: {
    type: 'welcome',
    alignment: 'center',
    showAvatar: false,
    showTimestamp: false,
    animated: true,
    maxWidth: 'max-w-full',
    bgClass: '',
  },
};
