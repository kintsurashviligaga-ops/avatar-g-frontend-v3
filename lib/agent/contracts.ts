/**
 * lib/agent/contracts.ts — the one vocabulary every Agent G door speaks (the chat, Live Voice, the panel buttons, the ReAct
 * agent, the Task API). Types and one pure transition table; no I/O, safe on the client.
 *
 * WHY ONE FILE. Before this, each door had its own words for the same things: the chat's focus gate said chat/clarify/
 * confirm/go, the studio router said service+params, the catalog router said open/unavailable, the montage card had seven
 * phases, the audio card seven more, the Task API five statuses and generation_jobs its own strings. Nothing could say
 * "this sentence asks for THAT capability with THESE parameters, and it is waiting on THIS approval" across all of them.
 * These contracts are that sentence. They do not replace the working parts: lib/agent/intent classifies by calling the
 * existing detectors, lib/agent/capabilities describes the existing routes, and TaskView (lib/tasks/taskView) stays the
 * Task API's row view.
 *
 * THE RULES THE TYPES CARRY:
 *   · A model's output is never an approval. AgentApproval comes from a person's tap, a panel's own button or (PART 4) a
 *     voice transcript the server recorded; `channel` says which, and nothing else can make one.
 *   · A question is never an act. AgentIntent separates talk / question / feedback from act, so a door can refuse to
 *     spend on anything that is not an act.
 *   · A run moves only along RUN_TRANSITIONS: a finished run never runs again, a cancelled one never completes.
 */
import type { TaskStatus, TaskView } from '@/lib/tasks/taskView';
import type { GateReason } from '@/lib/chat/focusGate';

export type { TaskView };

export type Lang = 'ka' | 'en' | 'ru';

/** Where a request came in. */
export type AgentChannel = 'text' | 'voice' | 'panel' | 'terminal';

/** What the user attached to this message, by kind (lib/agent/media/montageChat AttachmentKind). */
export type AttachmentKind = 'video' | 'audio' | 'image' | 'other';

/** One message to Agent G, as every door hands it over. */
export interface AgentRequest {
  text: string;
  channel: AgentChannel;
  lang: Lang;
  attachments: readonly AttachmentKind[];
  /** The focus tool the composer is in ('chat' when none). */
  mode?: string;
  /** The last finished result in this conversation, if any: what „the previous result" means. */
  previous?: { kind: 'video' | 'image' | 'audio' } | null;
  /** A plan card is shown and waiting for Start (its parameters can still change). */
  pending?: { capability: CapabilityId } | null;
}

/**
 * The capabilities Agent G can be asked for: every catalog service id (lib/catalog/services), plus the Agent G media
 * operations that are not catalog cards. lib/agent/capabilities holds one typed record for each.
 */
export type CapabilityId =
  | 'video.generate' | 'video.music-video' | 'video.product-ad' | 'video.character-swap' | 'video.motion' | 'video.vfx'
  | 'video.remix' | 'video.editing'
  | 'image.generate' | 'image.photoshoot' | 'image.interior' | 'image.culling'
  | 'avatar.talking'
  | 'music.generate' | 'music.remix'
  | 'voice.dubbing'
  | 'text.write'
  | 'design.presentation' | 'design.model3d'
  | 'code.assistant' | 'code.terminal'
  | 'research.web-search'
  /** Cut the attached clips to the attached track, on the beat (lib/agent/media/montageExec). */
  | 'agent.montage'
  /** Take the sound out of a file or a direct link as an MP3 (lib/agent/media/audioExtract). */
  | 'agent.audio-extract'
  /** An ffmpeg edit with no route yet (a new frame shape, a music offset on a finished video): PART 3. */
  | 'media.edit';

/** An edit of something that already exists. */
export type EditOp =
  | 'aspect' | 'captions' | 'color' | 'trim' | 'speed' | 'stabilize' | 'music' | 'music_offset' | 'voiceover'
  | 'background_remove' | 'character' | 'restyle' | 'animate';

/** Parameters read from the words. Only ever set when the user said them. */
export interface IntentParams {
  aspect?: '9:16' | '16:9' | '1:1';
  durationSec?: number;
  /** Where in the track the edit starts („მუსიკა 5 წამიდან დაიწყე"). */
  musicStartSec?: number;
  targetLanguage?: string;
  editOp?: EditOp;
  /** „იგივე პერსონაჟით": keep the character of the previous result. */
  sameCharacter?: boolean;
  /** A short ask (image→video) whose input is a photo. */
  fromImage?: boolean;
}

/** What the act is aimed at. */
export type ActTarget = 'attachment' | 'link' | 'previous' | 'pending' | 'new';

/** An input the act needs and the message did not bring. Agent G asks for it; nothing runs or is charged. */
export type MissingInput = 'clips' | 'track' | 'video' | 'photo' | 'source' | 'previous' | 'detail';

export type ControlOp = 'stop' | 'status' | 'continue';

export type AgentIntent =
  /** Stop / where are you / go on: about work in flight, whatever focus mode the composer is in. */
  | { kind: 'control'; op: ControlOp; lang: Lang }
  /** A greeting, presence check, smalltalk, thanks, „who are you". */
  | { kind: 'talk'; reason: GateReason; lang: Lang }
  /** A question. Answered in words; never generated, never charged. */
  | { kind: 'question'; lang: Lang }
  /** „I don't like it" with no instruction: Agent G asks what to change. */
  | { kind: 'feedback'; lang: Lang }
  /** A request to do something. `missing` non-empty = ask for those first. */
  | { kind: 'act'; capability: CapabilityId; target: ActTarget; params: IntentParams; missing: MissingInput[]; lang: Lang }
  /** A catalog service that is not available (coming soon): say so, offer the alternative. */
  | { kind: 'unavailable'; capability: CapabilityId; alternative: CapabilityId | null; lang: Lang }
  /** Anything else: the conversation. */
  | { kind: 'chat'; lang: Lang };

/** A typed tool as a model sees it (lib/agent/tools/registry ToolSpec, minus its run). */
export interface AgentToolSpec {
  name: string;
  effect: 'read' | 'prepare' | 'quote';
  description: string;
}

/** A price, before anything runs. The fingerprint binds it to one plan; a changed plan is a new quote. */
export interface AgentQuote {
  capability: CapabilityId;
  credits: number;
  fingerprint: string;
  expiresAt: number;
}

/** A person's yes to one quote. Never produced from model output. */
export interface AgentApproval {
  quoteFingerprint: string;
  /** A tap on the card, a panel's own Generate button (price on it), or (PART 4) a voice yes the server heard. */
  channel: 'tap' | 'panel-button' | 'voice-transcript';
  /** What was approved, in the words the user saw or said (kept short; no secrets). */
  evidence: string;
  at: string;
  userId: string;
}

/** One planned step. */
export interface AgentAction {
  capability: CapabilityId;
  params: IntentParams;
  /** Whether the step spends credits (then it needs an approval of its quote). */
  charged: boolean;
}

export interface AgentPlan {
  intent: AgentIntent;
  actions: AgentAction[];
  quote?: AgentQuote;
}

export type RunStatus =
  | 'planned' | 'awaiting_approval' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'blocked'
  | 'partially_completed';

export const RUN_STATUSES: readonly RunStatus[] = [
  'planned', 'awaiting_approval', 'queued', 'running', 'completed', 'failed', 'cancelled', 'blocked', 'partially_completed',
];

/** Final: nothing moves a run out of these. A retry is a new run. */
export const TERMINAL_RUN_STATUSES: ReadonlySet<RunStatus> = new Set(['completed', 'failed', 'cancelled', 'partially_completed']);

/**
 * Where a run may go from each status. `blocked` is waiting on something only the owner or the user can change (a missing
 * input, a flag, an approval outside the run); it returns to planning or ends.
 */
export const RUN_TRANSITIONS: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  planned: ['awaiting_approval', 'queued', 'blocked', 'cancelled'],
  awaiting_approval: ['queued', 'cancelled', 'blocked'],
  queued: ['running', 'cancelled', 'failed'],
  running: ['completed', 'failed', 'cancelled', 'partially_completed', 'queued'],
  blocked: ['planned', 'cancelled', 'failed'],
  completed: [],
  failed: [],
  cancelled: [],
  partially_completed: [],
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return RUN_TRANSITIONS[from].includes(to);
}

/** A Task API row's status as a run status (the Task API has no planning or approval states: its rows already run). */
export function runStatusOfTask(status: TaskStatus): RunStatus {
  return status;
}

export interface AgentStep {
  index: number;
  action: AgentAction;
  status: RunStatus;
  /** The job that carries the step (generation_jobs id), once queued. */
  taskId?: string;
  error?: string;
}

export interface AgentRun {
  id: string;
  userId: string;
  request: Pick<AgentRequest, 'text' | 'channel' | 'lang'>;
  status: RunStatus;
  steps: AgentStep[];
  createdAt: string;
  updatedAt: string;
}

/** A finished output the user can play, download and find in the Library. */
export interface AgentArtifact {
  url: string;
  media: 'video' | 'audio' | 'image' | 'file';
  taskId?: string;
  durationSec?: number;
}

export interface AgentExecutionResult {
  runId: string;
  status: RunStatus;
  artifacts: AgentArtifact[];
  /** Credits actually kept (after any refund). */
  creditsSpent: number;
  error?: string;
}
