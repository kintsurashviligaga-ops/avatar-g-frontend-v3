/**
 * lib/contracts/agent.ts — the agent foundation contracts (PROJECT_MASTER.md Part 1, §6.1–6.5).
 *
 * The names and literal unions are PROJECT_MASTER's, as written. §6.5 TaskState already lives with the video director
 * (lib/video/director/types.ts) and is re-exported from there, so there is one TaskState. §6.4 says only "ApprovalRequest
 * — generic"; its shape here is the smallest one an inline approval card (Section E8) needs, and says so.
 *
 * Type-only (plus one constant list): the studio UI can import these without pulling any server code into a bundle.
 */
import type { ShotError, TaskState } from '@/lib/video/director/types';

export type { TaskState };

/** §6.2 — what an agent (or a tool) can do. The list form is for validation and routing tables. */
export const AGENT_CAPABILITIES = [
  'code',
  'terminal',
  'browser',
  'search',
  'files',
  'media',
  'voice',
  'avatar',
  'stt',
  'video_storyboard',
] as const;
export type AgentCapability = (typeof AGENT_CAPABILITIES)[number];

export const isAgentCapability = (v: unknown): v is AgentCapability =>
  typeof v === 'string' && (AGENT_CAPABILITIES as readonly string[]).includes(v);

/** §6.1 — every event Agent G Live (Section E3) renders. Providers are Google and ElevenLabs only (Section A). */
export type AgentEvent =
  | { type: 'status'; message: string }
  | { type: 'tool_call'; tool: string; input: unknown }
  | { type: 'tool_result'; tool: string; output: unknown }
  | { type: 'command_output'; stream: 'stdout' | 'stderr'; data: string }
  | { type: 'file_changed'; path: string }
  | { type: 'browser_event'; action: string; target?: string }
  | {
      type: 'media_event';
      capability: 'image' | 'video' | 'music' | 'voice' | 'avatar';
      provider: 'google' | 'elevenlabs';
      status: 'queued' | 'generating' | 'finalizing' | 'done' | 'failed';
      progress?: number;
    }
  | { type: 'voice_event'; stage: 'listening' | 'transcribing' | 'final'; provider: 'browser' | 'google'; text?: string }
  | {
      type: 'video_shot_event';
      storyboardId: string;
      shotId: string;
      shotIndex: number;
      totalShots: number;
      stage: 'queued' | 'generating' | 'finalizing' | 'done' | 'failed';
      progress: number;
      error?: ShotError;
    }
  | { type: 'vertex_transport_event'; service: string; transport: 'vertex' | 'gemini_api'; status: 'selected' | 'not_configured' | 'failed' }
  | { type: 'model_selected_event'; focusMode: AgentCapability; modelId: string; catalogVersion: string }
  | { type: 'approval_required'; action: string; risk: string }
  | { type: 'error'; message: string }
  | { type: 'completed' };

export type AgentEventType = AgentEvent['type'];

/** Who a tool talks to. `sandbox`, `browser` and `internal` are not model providers; Section A still applies to models. */
export type AgentToolProvider = 'google' | 'elevenlabs' | 'sandbox' | 'browser' | 'internal';

export type RiskLevel = 'low' | 'medium' | 'high';

/** §6.3 */
export type AgentToolDefinition = {
  name: string;
  capability: AgentCapability;
  provider: AgentToolProvider;
  inputSchema: unknown;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
};

/**
 * §6.4 "ApprovalRequest — generic". Not shaped by the master; this is what Section E8 asks the inline card to show
 * (the intended action, its risk) plus what the answer must carry back (the request id, the tool).
 */
export type ApprovalRequest<TInput = unknown> = {
  id: string;
  tool: string;
  capability: AgentCapability;
  action: string;
  risk: RiskLevel;
  input: TInput;
  requestedAt: string;
};

export type ApprovalDecision = { requestId: string; decision: 'approve' | 'cancel'; decidedAt: string };
