/**
 * lib/chat/logic/suggestionEngine.ts
 * Generates contextual suggestion chips based on current state.
 */

import type { SuggestionChip, ResultType, ChatMessage } from '../types';
import { getAgentDisplay } from '../config/agentRegistry';

interface SuggestionContext {
  latestResultType?: ResultType;
  latestAgentId?: string;
  activeServiceSlug?: string;
  activeWorkflowId?: string;
  hasProject: boolean;
  targetPlatform?: string;
  language: string;
}

/**
 * Build contextual suggestion chips after a response.
 */
export function buildSuggestions(ctx: SuggestionContext): SuggestionChip[] {
  const chips: SuggestionChip[] = [];

  // Always offer continue
  chips.push({ label: 'Continue', action: 'Continue with the next step', variant: 'primary' });

  // Handoff suggestions based on latest agent
  if (ctx.latestAgentId) {
    const agent = getAgentDisplay(ctx.latestAgentId);
    if (agent) {
      const targetLabels = getHandoffLabels();
      for (const targetId of agent.canHandoffTo.slice(0, 3)) {
        const info = targetLabels[targetId];
        if (info) {
          chips.push({ ...info, variant: 'secondary' });
        }
      }
    }
  }

  // Result-type-specific suggestions
  if (ctx.latestResultType) {
    const resultChips = getResultTypeChips(ctx.latestResultType);
    for (const c of resultChips) {
      if (!chips.some(existing => existing.action === c.action)) {
        chips.push(c);
      }
    }
  }

  // Project suggestions
  if (ctx.hasProject) {
    chips.push({ label: 'Save to Project', action: 'Save this result to my project', icon: '📁', variant: 'secondary' });
  }

  return chips.slice(0, 6);
}

/**
 * Build follow-up chips from a completed assistant message.
 */
export function buildFollowUpFromMessage(
  message: ChatMessage,
  hasProject: boolean
): SuggestionChip[] {
  if (message.type !== 'assistant') return [];
  if (message.text.length < 80) return [];

  return buildSuggestions({
    latestAgentId: message.agentId,
    hasProject,
    language: message.language,
  });
}

function getHandoffLabels(): Record<string, { label: string; icon: string; action: string }> {
  return {
    'video-agent': { label: 'Add Video', icon: '🎬', action: 'Create a video from this result' },
    'music-agent': { label: 'Add Music', icon: '🎵', action: 'Add music to this' },
    'subtitle-agent': { label: 'Add Captions', icon: '💬', action: 'Add captions/subtitles' },
    'image-agent': { label: 'Create Image', icon: '🖼️', action: 'Generate an image from this' },
    'thumbnail-agent': { label: 'Make Thumbnail', icon: '📐', action: 'Create a thumbnail' },
    'seo-agent': { label: 'SEO Optimize', icon: '🔍', action: 'Optimize for SEO' },
    'store-agent': { label: 'Add to Store', icon: '🏪', action: 'Add this to my store' },
    'reels-agent': { label: 'Make Reels', icon: '📱', action: 'Create social media reels' },
    'business-agent': { label: 'Business Plan', icon: '📊', action: 'Create a business plan' },
    'content-agent': { label: 'Write Copy', icon: '✍️', action: 'Write marketing copy' },
    'marketing-agent': { label: 'Campaign', icon: '📣', action: 'Create marketing campaign' },
  };
}

function getResultTypeChips(resultType: ResultType): SuggestionChip[] {
  switch (resultType) {
    case 'avatar':
      return [{ label: 'Generate Video', action: 'Create a video with this avatar', icon: '🎬' }];
    case 'video':
      return [
        { label: 'Add Music', action: 'Add music to this video', icon: '🎵' },
        { label: 'Add Captions', action: 'Add subtitles to this video', icon: '💬' },
      ];
    case 'poster':
    case 'image':
      return [{ label: 'Make Thumbnail', action: 'Create a thumbnail', icon: '📐' }];
    case 'business-plan':
      return [{ label: 'Revenue Plan', action: 'Create a revenue plan', icon: '💰' }];
    default:
      return [];
  }
}
