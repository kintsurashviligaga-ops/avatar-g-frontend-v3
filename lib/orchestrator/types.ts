/**
 * MyAvatar.ge — Core Orchestrator type contract.
 *
 * These interfaces define the stateful conversation flow between the user,
 * the central orchestrator ("Brain"), and the eight Service Agents
 * (chat / image / video / music / voice / avatar / interior / app).
 *
 * Design pillars:
 *   - JSON-only orchestrator response contract → trivial UI binding.
 *   - PipelineContext carries the smallest viable context per agent
 *     (token efficiency — agents see only what they need).
 *   - State Recovery — every in-flight task is checkpointed so a
 *     crashed page can resume the same generation on reload.
 *   - Temporal Segmentation — video is composed of 6-second clips
 *     (`VideoSegment`) that are individually previewable / editable
 *     before final assembly via `VideoComposition`.
 */

export type Locale = 'ka' | 'en' | 'ru';

export type ServiceId =
  | 'chat'
  | 'image'
  | 'video'
  | 'music'
  | 'voice'
  | 'avatar'
  | 'interior'
  | 'app';

// ─── Suggested actions — the action-driven interface contract ────────────────

/**
 * Canonical action keys. The chat surface maps each key to a concrete
 * UI handler. New actions go here so the type system flags missing
 * handlers.
 */
export type ActionKey =
  // Generation
  | 'RUN_AGENT'           // payload: { agent: ServiceId; prompt: string; inputs?: AssetRef[] }
  | 'RETRY_LAST'
  | 'STOP'
  // Asset operations
  | 'OPEN_PREVIEW'        // payload: { assetId: string }
  | 'DOWNLOAD'            // payload: { assetId: string }
  | 'SHARE'               // payload: { assetId: string; target?: 'native' | 'x' | 'fb' | 'tg' | 'wa' }
  // Video editor (temporal segmentation)
  | 'ADD_VIDEO_SEGMENT'   // payload: { prompt: string }
  | 'REGEN_SEGMENT'       // payload: { segmentId: string }
  | 'REMOVE_SEGMENT'      // payload: { segmentId: string }
  | 'REORDER_SEGMENT'     // payload: { segmentId: string; newIndex: number }
  | 'ASSEMBLE_VIDEO'
  // Camera / motion presets for video
  | 'SET_CAM_ZOOM_IN'
  | 'SET_CAM_ZOOM_OUT'
  | 'SET_CAM_PAN_LEFT'
  | 'SET_CAM_PAN_RIGHT'
  | 'SET_CAM_DOLLY'
  // Composition layers
  | 'ADD_MUSIC'           // payload: { prompt: string }
  | 'ADD_VOICEOVER'       // payload: { text: string }
  // Conversation hygiene
  | 'CLEAR'
  | 'EXPORT_SESSION';

export interface SuggestedAction {
  /** Human-visible button label, already localized. */
  label: string;
  /** Canonical action key — the UI layer dispatches on this. */
  action: ActionKey;
  /** Action-specific arguments. Schema varies per ActionKey (see comments above). */
  payload?: Record<string, unknown>;
  /** When true, render the chip as the visually dominant CTA. */
  primary?: boolean;
}

// ─── Assets ──────────────────────────────────────────────────────────────────

export interface AssetRef {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'code';
  /** Generated URL — may be a blob: URL for client-side blob responses. */
  url?: string;
  /** Inline HTML (for `code` kind only). */
  html?: string;
  /** Language hint for code assets. */
  language?: string;
  /** Thumbnail / preview URL (used by video to render the first frame). */
  poster?: string;
  /** Duration for video / audio assets (seconds). */
  durationSec?: number;
  /** Optional sequence index when this asset is part of a multi-segment composition. */
  segmentIndex?: number;
  /** The prompt that produced this asset — useful for "remix" / "regen". */
  prompt?: string;
  /** ISO timestamp (ms epoch). */
  createdAt: number;
}

// ─── Temporal segmentation — 6s clips → final video ──────────────────────────

export const SEGMENT_DURATION_SEC = 6;

export interface VideoSegment {
  id: string;
  index: number;
  durationSec: number;        // typically 6
  prompt: string;
  assetUrl?: string;          // populated when generation completes
  poster?: string;
  status: 'queued' | 'generating' | 'ready' | 'failed';
  errorMessage?: string;
  /** Optional camera-motion preset captured from a SuggestedAction. */
  cameraMotion?: 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'dolly' | null;
  createdAt: number;
}

export interface VideoComposition {
  id: string;
  segments: VideoSegment[];
  /** URL of the assembled final video, populated after ASSEMBLE_VIDEO runs. */
  finalAssembledUrl?: string;
  voiceoverUrl?: string;
  musicUrl?: string;
  updatedAt: number;
}

// ─── Pipeline context — what flows between agents ────────────────────────────

export interface PipelineContext {
  userId?: string;
  locale: Locale;
  /**
   * Recent assets the user has produced in this session. Bounded list
   * (kept short for token efficiency). Agents may reference any asset
   * by id via `inputs: [assetId]` on their task.
   */
  assets: AssetRef[];
  /** Active multi-segment video composition, if any. */
  composition?: VideoComposition;
  /** The orchestrator's last-resolved intent — used by proactive suggestions. */
  lastIntent?: ServiceId;
  /** Whatever side notes the orchestrator wants to thread through. */
  notes?: string;
  /** For state recovery — populated by the orchestrator before dispatch. */
  inFlightTaskId?: string;
}

// ─── Agent task — what the orchestrator dispatches ───────────────────────────

export interface AgentTask {
  id: string;
  agent: ServiceId;
  /** Distilled prompt — already stripped of slash commands and routing noise. */
  prompt: string;
  /** Token-efficient context slice. Agents read ONLY this — never the full state. */
  inputs?: AssetRef[];
  /** Free-form params — schema varies per agent. */
  params?: {
    aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
    duration?: number;
    instrumental?: boolean;
    voiceLocale?: Locale;
    voiceGender?: 'male' | 'female';
    cameraMotion?: VideoSegment['cameraMotion'];
    photoBase64?: string;
    photoMimeType?: string;
    /** Allow agents to receive opaque key-value extras. */
    [k: string]: unknown;
  };
  signal?: AbortSignal;
}

// ─── Service response — what an agent gives back ─────────────────────────────

export type ServiceErrorCode =
  | 'aborted'
  | 'timeout'
  | 'quota'
  | 'safety'
  | 'network'
  | 'transient'
  | 'invalid'
  | 'unknown';

export interface ServiceResponse {
  ok: boolean;
  taskId: string;
  /** Produced asset, when ok=true. */
  asset?: AssetRef;
  /** Text reply — used by the chat agent OR as a system message from any agent. */
  message?: string;
  errorCode?: ServiceErrorCode;
  errorMessage?: string;
}

// ─── Orchestrator JSON contract — what the UI binds against ──────────────────

export interface OrchestratorResponse {
  /** Localized user-facing message — Markdown allowed. */
  message: string;
  /** New asset produced this turn (if any). */
  asset?: AssetRef;
  /**
   * Proactive next-step buttons. Always populated — even on an error the
   * orchestrator surfaces "RETRY_LAST" / "STOP" so the user is never stuck.
   */
  suggestedActions: SuggestedAction[];
}

// ─── Persistent state — checkpointed for State Recovery ──────────────────────

export interface OrchestratorState {
  sessionId: string;
  context: PipelineContext;
  history: Array<{
    task: AgentTask;
    response?: ServiceResponse;
    ts: number;
  }>;
  /**
   * Last dispatched task that has not yet completed. Cleared on response.
   * If a page reload finds a stale checkpoint older than ~10 minutes,
   * the orchestrator marks the task failed; younger ones are resumed.
   */
  checkpoint?: {
    taskId: string;
    agent: ServiceId;
    prompt: string;
    startedAt: number;
  };
}

// ─── Service capability declaration ──────────────────────────────────────────

export interface ServiceConfig {
  id: ServiceId;
  label_ka: string;
  label_en: string;
  /** What kinds of inputs this agent can consume. */
  accepts: Array<'text' | 'image' | 'audio'>;
  /** What the agent produces — used by orchestrator to add to PipelineContext. */
  produces: 'image' | 'video' | 'audio' | 'code' | 'text';
  /** Approximate latency budget — UI shows a hint to set expectations. */
  typicalLatencyMs: number;
  /** Hard timeout the agent's runner uses. */
  timeoutMs: number;
  /** Cost in credits (used for proactive billing warnings). */
  creditsCost: number;
  /** Whether the agent supports the AbortSignal contract. */
  abortable: boolean;
}
