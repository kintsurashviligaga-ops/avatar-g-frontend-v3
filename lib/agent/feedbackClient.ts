/**
 * Client-side feedback beacon (STEP 3.5). Fire-and-forget POST to /api/agent/feedback — never
 * throws, never blocks the UI. Import from client components to record what a user does with a
 * generation (download/share/remix/discard); the server attaches the authoritative userId.
 */
import { FEEDBACK_ACTIONS } from './feedback-schema';

export type MediaKind = 'image' | 'video' | 'audio' | 'avatar' | 'text';
export type FeedbackAgentType = 'video' | 'audio' | 'script' | 'image';
export type FeedbackAction = (typeof FEEDBACK_ACTIONS)[number];

/** Map a UI media kind to the optimizer's agent_type bucket. Pure. */
export function agentTypeForKind(kind: MediaKind): FeedbackAgentType {
  switch (kind) {
    case 'avatar':
      return 'video';
    case 'text':
      return 'script';
    default:
      return kind; // image | video | audio
  }
}

export function recordFeedback(
  kind: MediaKind,
  action: FeedbackAction,
  extra?: { assetId?: string; model?: string; promptSnapshot?: string },
): void {
  try {
    if (typeof fetch !== 'function') return;
    void fetch('/api/agent/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentType: agentTypeForKind(kind), action, ...extra }),
      keepalive: true, // survive navigation (e.g. right after a download click)
    }).catch(() => {});
  } catch {
    /* never let telemetry surface an error */
  }
}
