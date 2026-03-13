/**
 * lib/chat/logic/clarificationResolver.ts
 * Determines when clarification is needed before executing a task.
 */

import type { ClarificationOption } from '../types';

export interface ClarificationNeed {
  needed: boolean;
  question: string;
  options: ClarificationOption[];
  requiredForTask: string;
}

/**
 * Check if clarification is required for a given intent + context.
 * Only asks when needed to avoid broken output.
 */
export function checkClarification(
  intent: string,
  attachmentTypes: string[],
  hasProject: boolean
): ClarificationNeed | null {
  // Avatar orientation
  if (/avatar|portrait|headshot|character/i.test(intent)) {
    if (!/full.body|portrait|half/i.test(intent)) {
      return {
        needed: true,
        question: 'What type of avatar?',
        options: [
          { label: 'Portrait', value: 'portrait', icon: '👤' },
          { label: 'Full Body', value: 'full-body', icon: '🧍' },
          { label: 'Half Body', value: 'half-body', icon: '👔' },
        ],
        requiredForTask: 'avatar_create',
      };
    }
  }

  // Video aspect ratio
  if (/video|reel|clip|footage/i.test(intent)) {
    if (!/9:16|16:9|1:1|vertical|horizontal|square/i.test(intent)) {
      return {
        needed: true,
        question: 'What format?',
        options: [
          { label: '9:16 (TikTok/Reels)', value: '9:16', icon: '📱' },
          { label: '16:9 (YouTube)', value: '16:9', icon: '📺' },
          { label: '1:1 (Instagram)', value: '1:1', icon: '⬜' },
        ],
        requiredForTask: 'video_create',
      };
    }
  }

  // Platform target
  if (/tiktok|instagram|youtube|facebook/i.test(intent)) {
    // Already specified, no need
    return null;
  }

  // Language of output (for subtitle / content generation)
  if (/subtitle|caption|translate|content|copy/i.test(intent)) {
    if (!/english|georgian|russian|ქართული|ინგლისური|რუსული/i.test(intent)) {
      return {
        needed: true,
        question: 'What language for the output?',
        options: [
          { label: 'ქართული', value: 'ka', icon: '🇬🇪' },
          { label: 'English', value: 'en', icon: '🇬🇧' },
          { label: 'Русский', value: 'ru', icon: '🇷🇺' },
        ],
        requiredForTask: 'language_selection',
      };
    }
  }

  return null;
}
