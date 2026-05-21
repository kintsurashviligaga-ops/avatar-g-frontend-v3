/**
 * MyAvatar.ge Core Orchestrator — the "Brain".
 *
 * Owns the Stateful Conversation Flow:
 *   - Resolves user intent (slash > soft-routing > natural language).
 *   - Builds a minimal AgentTask (token-efficient context slice).
 *   - Dispatches to the matching service agent via the runner registry.
 *   - Checkpoints the in-flight task so a reload can recover.
 *   - Validates the agent's response.
 *   - Emits a JSON-only `OrchestratorResponse` (message + suggestedActions).
 *
 * Token efficiency: agents receive `AgentTask` only — not the full
 * PipelineContext or message history. The orchestrator hand-picks the
 * inputs that matter for that specific task.
 *
 * State Recovery: every dispatch writes a `checkpoint` to OrchestratorState.
 * On app boot we read it back and resume polling if the task is recent
 * enough (<10 min) and the agent supports resumption.
 */

import type {
  AgentTask,
  AssetRef,
  OrchestratorResponse,
  OrchestratorState,
  PipelineContext,
  ServiceErrorCode,
  ServiceId,
  ServiceResponse,
} from './types';
import { buildSuggestedActions } from './actions';
import { detectIntent, parseSlash } from './intent';
import { serviceConfig } from './service-configs';

// ─── Runner registry ─────────────────────────────────────────────────────────
//
// Agents register here so the orchestrator stays agnostic to provider
// SDKs. The actual runners live with the chat surface (close to UI
// state) and conform to this single signature.

export type AgentRunner = (task: AgentTask) => Promise<ServiceResponse>;

const RUNNERS = new Map<ServiceId, AgentRunner>();

export function registerAgent(id: ServiceId, runner: AgentRunner): void {
  RUNNERS.set(id, runner);
}

// ─── State plumbing — JSON-safe, suitable for localStorage ───────────────────

const STATE_KEY_PREFIX = 'myavatar-orchestrator:';
const CHECKPOINT_MAX_AGE_MS = 10 * 60 * 1000;

export function newState(sessionId: string, locale: PipelineContext['locale']): OrchestratorState {
  return {
    sessionId,
    context: { locale, assets: [] },
    history: [],
  };
}

export function loadState(sessionId: string): OrchestratorState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STATE_KEY_PREFIX + sessionId);
    if (!raw) return null;
    return JSON.parse(raw) as OrchestratorState;
  } catch { return null; }
}

export function saveState(state: OrchestratorState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    // Asset URLs that are `blob:...` are session-bound — strip them so
    // we don't leave dangling references after a reload. They'll be
    // marked as not-recoverable on resume.
    const json = JSON.stringify({
      ...state,
      context: { ...state.context, assets: state.context.assets.map(stripBlobUrl) },
    });
    localStorage.setItem(STATE_KEY_PREFIX + state.sessionId, json);
  } catch { /* ignore quota */ }
}

function stripBlobUrl(a: AssetRef): AssetRef {
  if (a.url?.startsWith('blob:')) {
    return { ...a, url: undefined };
  }
  return a;
}

// ─── State Recovery — try to resume an in-flight task ────────────────────────

export function shouldResume(state: OrchestratorState): boolean {
  if (!state.checkpoint) return false;
  const age = Date.now() - state.checkpoint.startedAt;
  return age < CHECKPOINT_MAX_AGE_MS;
}

// ─── Main entry — handle a user turn ─────────────────────────────────────────

export interface HandleUserMessageInput {
  state: OrchestratorState;
  text: string;
  mode?: 'ask' | 'imagine';
  attachment?: AssetRef;       // photo from chat input → routed where applicable
  signal?: AbortSignal;
  /** Force a specific agent (used by SuggestedAction button click). */
  forceAgent?: ServiceId;
}

/**
 * The single entry point used by the chat surface. Returns a JSON-only
 * `OrchestratorResponse` shape — message + suggestedActions — that the
 * UI binds directly without inspecting raw provider data.
 */
export async function handleUserMessage({
  state,
  text,
  mode = 'ask',
  attachment,
  signal,
  forceAgent,
}: HandleUserMessageInput): Promise<OrchestratorResponse> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      message: '',
      suggestedActions: buildSuggestedActions(null, state.context),
    };
  }

  // Built-in commands the orchestrator handles directly (no agent).
  if (/^\/clear\b/i.test(trimmed)) {
    state.history = [];
    state.context.assets = [];
    state.context.composition = undefined;
    state.context.lastIntent = undefined;
    saveState(state);
    return {
      message: localeMsg(state.context.locale,
        'ჩატი გასუფთავდა.', 'Conversation cleared.', 'Чат очищен.'),
      suggestedActions: buildSuggestedActions(null, state.context),
    };
  }
  if (/^\/help\b|^\/h\b|^\/\?/i.test(trimmed)) {
    return {
      message: helpMessage(state.context.locale),
      suggestedActions: buildSuggestedActions(null, state.context),
    };
  }

  // Intent — slash > forceAgent > heuristic detection.
  const slash = parseSlash(trimmed);
  const agent: ServiceId = forceAgent ?? slash?.agent ?? detectIntent(trimmed, mode, state.context);
  const cleanText = slash?.rest && slash.rest.length > 0 ? slash.rest : trimmed;

  // Token-efficient input building: pass only the asset(s) this agent
  // can actually use. Avatar uses photos; vision-chat uses photos;
  // video animate uses a single image input; everything else: nothing.
  const inputs = pickInputsFor(agent, attachment);

  const task: AgentTask = {
    id: `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    agent,
    prompt: cleanText,
    inputs,
    params: deriveParams(agent, cleanText, state.context),
    signal,
  };

  // Checkpoint before dispatch — survival of a page crash.
  state.checkpoint = {
    taskId: task.id,
    agent: task.agent,
    prompt: task.prompt,
    startedAt: Date.now(),
  };
  state.context.inFlightTaskId = task.id;
  state.context.notes = `last_user_prompt=${cleanText.slice(0, 200)};`;
  saveState(state);

  // Dispatch — catch all errors here so the JSON contract is preserved.
  let response: ServiceResponse;
  try {
    const runner = RUNNERS.get(agent);
    if (!runner) {
      response = { ok: false, taskId: task.id, errorCode: 'invalid', errorMessage: `no runner for ${agent}` };
    } else {
      response = await runner(task);
    }
  } catch (err) {
    response = errorToResponse(err, task.id);
  }

  // Commit state — append history, register asset, clear checkpoint.
  state.history.push({ task, response, ts: Date.now() });
  if (response.ok && response.asset) {
    state.context.assets = [...state.context.assets.slice(-19), response.asset];
  }
  state.context.lastIntent = agent;
  state.context.inFlightTaskId = undefined;
  state.checkpoint = undefined;
  saveState(state);

  return {
    message: response.message ?? successMessage(agent, response, state.context.locale),
    asset: response.asset,
    suggestedActions: buildSuggestedActions(response, state.context),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pickInputsFor(
  agent: ServiceId,
  attachment: AssetRef | undefined,
): AssetRef[] | undefined {
  const cfg = serviceConfig(agent);
  if (!cfg.accepts.includes('image') || !attachment) return undefined;
  return [attachment];
}

function deriveParams(agent: ServiceId, prompt: string, ctx: PipelineContext): AgentTask['params'] {
  // Centralised parameter derivation. Each runner can read these to
  // avoid re-running the same heuristics.
  const params: AgentTask['params'] = {};
  if (agent === 'image' || agent === 'video') {
    params.aspectRatio = detectAspect(prompt);
  }
  if (agent === 'music') {
    params.instrumental = /\b(instrumental|no\s*vocals?|no\s*lyrics|background|ფონ|без\s*вокал|инструментал|საფონო)\b/i.test(prompt);
  }
  if (agent === 'voice') {
    params.voiceLocale = ctx.locale;
  }
  return params;
}

function detectAspect(prompt: string): NonNullable<AgentTask['params']>['aspectRatio'] {
  const p = prompt.toLowerCase();
  if (/\b(portrait|vertical|story|reels?|tiktok|9:16|პორტრე|вертикал)\b/.test(p)) return '9:16';
  if (/\b(square|1:1|logo|icon|profile pic|avatar|ლოგო|логотип|квадрат)\b/.test(p)) return '1:1';
  if (/\b4:3\b/.test(p)) return '4:3';
  if (/\b3:4\b/.test(p)) return '3:4';
  return '16:9';
}

function errorToResponse(err: unknown, taskId: string): ServiceResponse {
  const e = err instanceof Error ? err : new Error(String(err));
  const m = e.message.toLowerCase();
  let code: ServiceErrorCode = 'unknown';
  if (e.name === 'AbortError' || m.includes('abort'))       code = 'aborted';
  else if (m.includes('timeout') || m.includes('timed out')) code = 'timeout';
  else if (m.includes('credit') || m.includes('quota') || m.includes('limit')) code = 'quota';
  else if (m.includes('safety') || m.includes('nsfw') || m.includes('content policy')) code = 'safety';
  else if (m.includes('network') || m.includes('failed to fetch')) code = 'network';
  else if (/(5\d\d)|transient|temporar/.test(m)) code = 'transient';
  return { ok: false, taskId, errorCode: code, errorMessage: e.message };
}

function successMessage(agent: ServiceId, _r: ServiceResponse, locale: PipelineContext['locale']): string {
  const labels: Record<ServiceId, [string, string, string]> = {
    chat:     ['', '', ''],
    image:    ['სურათი მზადაა.',     'Image ready.',      'Изображение готово.'],
    video:    ['ვიდეო მზადაა.',      'Video ready.',      'Видео готово.'],
    music:    ['მუსიკა მზადაა.',     'Music ready.',      'Музыка готова.'],
    voice:    ['ხმოვანი ჩანაწერი მზადაა.', 'Voice clip ready.', 'Голос готов.'],
    avatar:   ['ავატარი მზადაა.',    'Avatar ready.',     'Аватар готов.'],
    interior: ['რენდერი მზადაა.',    'Render ready.',     'Рендер готов.'],
    app:      ['აპლიკაცია მზადაა.',  'App ready.',        'Приложение готово.'],
  };
  const triple = labels[agent];
  return locale === 'ka' ? triple[0] : locale === 'ru' ? triple[2] : triple[1];
}

function localeMsg(locale: PipelineContext['locale'], ka: string, en: string, ru: string): string {
  return locale === 'ka' ? ka : locale === 'ru' ? ru : en;
}

function helpMessage(locale: PipelineContext['locale']): string {
  if (locale === 'ka') {
    return `**ხელმისაწვდომი ბრძანებები**

- \`/image <prompt>\` — სურათი
- \`/video <prompt>\` — ვიდეო (6 წამი)
- \`/music <prompt>\` — მუსიკა
- \`/voice <prompt>\` — ხმოვანი (TTS)
- \`/avatar <script>\` — HeyGen ავატარი
- \`/interior <room>\` — ინტერიერი
- \`/app <description>\` — Claude აპლიკაცია
- \`/clear\` — საუბრის გასუფთავება
- \`/help\` — ეს დახმარება`;
  }
  if (locale === 'ru') {
    return `**Доступные команды**

- \`/image <prompt>\` — изображение
- \`/video <prompt>\` — видео (6с)
- \`/music <prompt>\` — музыка
- \`/voice <prompt>\` — голос (TTS)
- \`/avatar <script>\` — аватар HeyGen
- \`/interior <room>\` — интерьер
- \`/app <description>\` — приложение Claude
- \`/clear\` — очистить чат
- \`/help\` — эта подсказка`;
  }
  return `**Available slash commands**

- \`/image <prompt>\` — image
- \`/video <prompt>\` — video (6s)
- \`/music <prompt>\` — music
- \`/voice <prompt>\` — voice (TTS)
- \`/avatar <script>\` — HeyGen avatar
- \`/interior <room>\` — interior render
- \`/app <description>\` — Claude HTML app
- \`/clear\` — clear conversation
- \`/help\` — this help`;
}
