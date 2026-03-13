/**
 * lib/chat/orchestration/retryManager.ts
 * Error recovery and retry logic for failed operations.
 */

import type { SuggestionChip } from '../types';

export interface ErrorRecovery {
  code: string;
  userMessage: string;
  retryAction?: string;
  fallbackActions: SuggestionChip[];
  recoverable: boolean;
}

const ERROR_MAP: Record<string, Omit<ErrorRecovery, 'code'>> = {
  upload_failed: {
    userMessage: 'File upload failed. Please try a smaller file or different format.',
    retryAction: 'Retry upload',
    fallbackActions: [{ label: 'Try without attachment', action: 'Continue without the attachment' }],
    recoverable: true,
  },
  generation_timeout: {
    userMessage: 'Generation took too long. The AI might be busy.',
    retryAction: 'Retry generation',
    fallbackActions: [
      { label: 'Try simpler prompt', action: 'Try with a simpler description' },
      { label: 'Show alternatives', action: 'Show alternative tools' },
    ],
    recoverable: true,
  },
  missing_required_choice: {
    userMessage: 'A required choice was not made. Please select an option.',
    fallbackActions: [],
    recoverable: true,
  },
  service_unavailable: {
    userMessage: 'This service is temporarily unavailable.',
    fallbackActions: [
      { label: 'Try another service', action: 'Show all available tools', icon: '🧰' },
      { label: 'Ask Agent G', action: 'What else can you help me with?', icon: '⬢' },
    ],
    recoverable: false,
  },
  workflow_handoff_failed: {
    userMessage: 'Agent handoff failed. Agent G will handle this directly.',
    retryAction: 'Retry handoff',
    fallbackActions: [{ label: 'Continue with Agent G', action: 'Handle this directly' }],
    recoverable: true,
  },
  rate_limited: {
    userMessage: 'Rate limited. Please wait a moment and try again.',
    retryAction: 'Retry',
    fallbackActions: [],
    recoverable: true,
  },
  network_error: {
    userMessage: 'Connection error. Please check your network.',
    retryAction: 'Retry',
    fallbackActions: [],
    recoverable: true,
  },
};

/**
 * Map a technical error to a user-friendly recovery path.
 * Never shows dead-end failure.
 */
export function resolveError(error: unknown, originalText?: string): ErrorRecovery {
  const errStr = error instanceof Error ? error.message : String(error);

  // Match known patterns
  if (/throttled|rate.limit|quota|429/i.test(errStr)) {
    return { code: 'rate_limited', ...ERROR_MAP['rate_limited']! };
  }
  if (/timeout|timed.out|ETIMEDOUT/i.test(errStr)) {
    return { code: 'generation_timeout', ...ERROR_MAP['generation_timeout']! };
  }
  if (/upload|file.*fail/i.test(errStr)) {
    return { code: 'upload_failed', ...ERROR_MAP['upload_failed']! };
  }
  if (/network|fetch|ECONNREFUSED|ERR_NETWORK/i.test(errStr)) {
    return { code: 'network_error', ...ERROR_MAP['network_error']! };
  }
  if (/handoff|delegation/i.test(errStr)) {
    return { code: 'workflow_handoff_failed', ...ERROR_MAP['workflow_handoff_failed']! };
  }
  if (/unavailable|503|502/i.test(errStr)) {
    return { code: 'service_unavailable', ...ERROR_MAP['service_unavailable']! };
  }

  // Generic fallback — always recoverable with retry option
  return {
    code: 'unknown',
    userMessage: 'Something went wrong. Please try again.',
    retryAction: originalText,
    fallbackActions: [
      { label: 'Show All Tools', action: 'Show all available AI tools', icon: '🧰' },
    ],
    recoverable: true,
  };
}
