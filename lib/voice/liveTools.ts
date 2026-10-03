/**
 * lib/voice/liveTools.ts — VOICE-TO-ACTION for Gemini Live: the function declarations the model may call while the
 * user talks, and the strict validators that turn its raw `args` into a typed action the UI can run.
 *
 * Isomorphic and dependency-free: the mint route (app/api/voice/live) locks LIVE_FUNCTION_DECLARATIONS into the
 * ephemeral token through buildLiveSetup (lib/voice/geminiLive.ts), and the browser
 * (components/voice/live/liveActions.ts) validates every `toolCall` with validateLiveToolCall before anything
 * happens on screen. Contract + safety rule: docs/voice/LIVE_ACTIONS.md.
 *
 * ⚠️ THE MONEY RULE. Every tool but one only PREPARES or NAVIGATES: it switches a studio, fills or tunes its prompt and
 * settings, reads the screen, drives the chat (send · new · stop · scroll · model), opens a panel, shows code, hangs up.
 * NONE of those can start a render or charge a credit. The one that does — start_generation — is gated three times: the
 * model must say the price and hear a clear yes (its required `confirmed: "yes"`), the browser shows a cancelable
 * countdown before anything runs (components/voice/live/liveActions.ts), and the run then goes through the studio's
 * own paid path (balance checks, a video's storyboard approval). dispatchServiceBlock's image/music branch in OmniStudio
 * renders at once — the Live listener must never reuse it.
 * ⚠️ THE SCHEMA IS THE OLDEST, PLAINEST OPENAPI SUBSET ON PURPOSE: `type` (the proto enum NAMES — OBJECT, STRING,
 * INTEGER — the canonical JSON form; lowercase is a REST leniency we do not need to bet a call on), `description`,
 * `properties`, `required`, `enum`. No minimum / maximum / maxLength / nullable: the bounds live in the validators
 * below, and a field the Constrained endpoint might reject would cost the whole lock (the mint route then retries
 * without the declarations). And end_call has NO `parameters`: an OBJECT with empty `properties` is a documented
 * Gemini 400 ("properties: should be non-empty for OBJECT type").
 */

// ─── Catalogue constants ─────────────────────────────────────────────────────

/** Window event the browser executor dispatches for every validated action (detail = LiveActionEventDetail). */
export const LIVE_ACTION_EVENT = 'myavatar:live-action';
/** Window event for show_code — the canvas contract: detail `{ title, language, code }`, exactly. */
export const OPEN_ARTIFACT_EVENT = 'myavatar:open-artifact';

export const LIVE_ACTION_NAMES = [
  'get_screen_state',
  'prepare_generation',
  'update_settings',
  'start_generation',
  'open_studio',
  'chat_send',
  'new_chat',
  'set_chat_model',
  'stop',
  'scroll_chat',
  'open_panel',
  'call_view',
  'show_code',
  'end_call',
] as const;
export type LiveActionName = (typeof LIVE_ACTION_NAMES)[number];

/** The studios a call may prepare — each one is also a lib/studio/tools.ts ToolId (OmniStudio's selectTool). */
export const LIVE_STUDIO_TOOLS = ['video', 'image', 'music', 'avatar'] as const;
export type LiveStudioTool = (typeof LIVE_STUDIO_TOOLS)[number];

/**
 * Every tool the studio has (lib/studio/tools.ts ToolId — kept in step by a test; not imported, because that module pulls
 * in the icon set and this file is shared with the token route). open_studio reaches all of them.
 */
export const LIVE_OPEN_TOOLS = [
  'chat', 'video', 'image', 'photoshoot', 'interior', 'music', 'avatar', 'remix',
  'product', 'swap', 'vfx', 'motion', 'montage', 'dubbing', 'model3d', 'presentation', 'photo',
] as const;
export type LiveOpenTool = (typeof LIVE_OPEN_TOOLS)[number];

/** The chat model picker's modes (lib/chat/chatModes.ts ChatModeId). */
export const LIVE_CHAT_MODELS = ['fast', 'thinking', 'pro', 'lite'] as const;
export type LiveChatModel = (typeof LIVE_CHAT_MODELS)[number];

/** Panels a call may open. `settings` = the open studio's own settings panel. */
export const LIVE_PANELS = ['settings', 'credits', 'persona', 'connectors', 'search', 'history'] as const;
export type LivePanel = (typeof LIVE_PANELS)[number];

export const LIVE_STOP_TARGETS = ['reply', 'generation', 'all'] as const;
export type LiveStopTarget = (typeof LIVE_STOP_TARGETS)[number];

export const LIVE_SCROLL_TARGETS = ['top', 'bottom', 'up', 'down'] as const;
export type LiveScrollTarget = (typeof LIVE_SCROLL_TARGETS)[number];

/** The call screen: `screen` docks the call into a slim bar so the app is visible; `full` brings the call back. */
export const LIVE_CALL_VIEWS = ['screen', 'full'] as const;
export type LiveCallView = (typeof LIVE_CALL_VIEWS)[number];

export const LIVE_SWITCH_VALUES = ['on', 'off'] as const;

/** Every value is also one of OmniStudio's IMG_ASPECTS, so a studio can apply it without mapping. */
export const LIVE_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:5', '3:4', '4:3'] as const;
export type LiveAspectRatio = (typeof LIVE_ASPECT_RATIOS)[number];

/**
 * Canonical language ids for the canvas (common highlighter ids). Anything else well-formed → 'plaintext'.
 * ⚠️ `svg` IS ITS OWN LANGUAGE, NOT AN `xml` ALIAS: the canvas previews html and svg only (artifactSpec isPreviewable),
 * so folding svg into xml silently cost every drawing the model showed its Preview tab.
 */
export const LIVE_CODE_LANGUAGES = [
  'plaintext', 'javascript', 'typescript', 'jsx', 'tsx', 'python', 'html', 'svg', 'css', 'json', 'bash', 'sql',
  'java', 'kotlin', 'swift', 'go', 'rust', 'c', 'cpp', 'csharp', 'php', 'ruby', 'dart', 'yaml', 'markdown', 'xml',
] as const;
export type LiveCodeLanguage = (typeof LIVE_CODE_LANGUAGES)[number];

export const LIVE_PROMPT_MAX_CHARS = 2000;
export const LIVE_STYLE_MAX_CHARS = 60;
export const LIVE_TITLE_MAX_CHARS = 120;
/** UTF-8 bytes, not characters: 200 KB of Georgian is ~70 k characters. */
export const LIVE_CODE_MAX_BYTES = 200 * 1024;
export const LIVE_DURATION_MIN_SEC = 1;
export const LIVE_DURATION_MAX_SEC = 120;
/** chat_send: a long dictated request is fine; a book is not. */
export const LIVE_CHAT_TEXT_MAX_CHARS = 4000;
/** How long the browser counts down before a confirmed start_generation runs — the user's last chance to cancel. */
export const LIVE_START_COUNTDOWN_MS = 3000;

// ─── Declarations (Gemini `functionDeclarations`) ───────────────────────────

export type LiveSchemaType = 'OBJECT' | 'STRING' | 'INTEGER';
export interface LiveSchema {
  readonly type: LiveSchemaType;
  readonly description?: string;
  readonly enum?: readonly string[];
  readonly properties?: Readonly<Record<string, LiveSchema>>;
  readonly required?: readonly string[];
}
export interface LiveFunctionDeclaration {
  readonly name: LiveActionName;
  readonly description: string;
  /** Omitted for a function with no arguments (never an empty OBJECT — see the header). */
  readonly parameters?: LiveSchema;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

const TOOL_PARAM: LiveSchema = {
  type: 'STRING',
  enum: [...LIVE_STUDIO_TOOLS],
  description: 'Which studio: video, image, music, or avatar (a photo that talks).',
};

const ASPECT_PARAM: LiveSchema = {
  type: 'STRING',
  enum: [...LIVE_ASPECT_RATIOS],
  description: 'Frame shape for video, image or avatar: 16:9 landscape, 9:16 vertical, 1:1 square, 4:5, 3:4 or 4:3.',
};
const DURATION_PARAM: LiveSchema = {
  type: 'INTEGER',
  description: `Length in seconds for video or music (${LIVE_DURATION_MIN_SEC}-${LIVE_DURATION_MAX_SEC}); the studio snaps it to the lengths it offers.`,
};
const STYLE_PARAM: LiveSchema = {
  type: 'STRING',
  description: `Short style or genre, e.g. "cinematic", "watercolor", "lo-fi" (at most ${LIVE_STYLE_MAX_CHARS} characters).`,
};

/** The tool block's payload — `{ functionDeclarations: LIVE_FUNCTION_DECLARATIONS }`. Frozen; JSON-safe. */
export const LIVE_FUNCTION_DECLARATIONS: readonly LiveFunctionDeclaration[] = deepFreeze([
  {
    name: 'get_screen_state',
    description:
      'Read what is on the user\'s screen right now: the open studio, its prompt and settings, the price to run it, the chat '
      + 'model, the last chat reply, and generations still rendering. Call it before you answer anything about the screen '
      + 'or a result, and before start_generation.',
  },
  {
    name: 'prepare_generation',
    description:
      'Prepare a creation in a MyAvatar studio: switch to that studio and fill in the prompt (and optionally the shape, '
      + 'length and style) on screen. It does NOT start the generation and spends no credits. Its answer includes the '
      + 'price: tell it to the user and ask whether to start.',
    parameters: {
      type: 'OBJECT',
      properties: {
        tool: TOOL_PARAM,
        prompt: {
          type: 'STRING',
          description: `What to make: a short, concrete prompt in the language the user is speaking (at most ${LIVE_PROMPT_MAX_CHARS} characters).`,
        },
        aspectRatio: ASPECT_PARAM,
        durationSec: DURATION_PARAM,
        style: STYLE_PARAM,
      },
      required: ['tool', 'prompt'],
    },
  },
  {
    name: 'update_settings',
    description:
      'Change the settings of the studio on screen without touching its prompt: frame shape, length, style, or for music '
      + 'whether it is instrumental. Spends nothing.',
    parameters: {
      type: 'OBJECT',
      properties: {
        aspectRatio: ASPECT_PARAM,
        durationSec: DURATION_PARAM,
        style: STYLE_PARAM,
        instrumental: { type: 'STRING', enum: [...LIVE_SWITCH_VALUES], description: 'Music only: "on" for no vocals, "off" for a song with vocals.' },
      },
    },
  },
  {
    name: 'start_generation',
    description:
      'Start the generation prepared in the studio on screen. It SPENDS CREDITS. Call it ONLY after you told the user the '
      + 'price and they clearly said yes in this conversation. The screen shows a 3-second countdown the user can cancel; '
      + 'a video first gets a storyboard the user approves.',
    parameters: {
      type: 'OBJECT',
      properties: {
        confirmed: { type: 'STRING', enum: ['yes'], description: 'Must be "yes": the user explicitly agreed to start and to the price.' },
      },
      required: ['confirmed'],
    },
  },
  {
    name: 'open_studio',
    description: 'Switch the app to a tool without preparing anything in it: chat, video, image, photoshoot (photographer), '
      + 'interior (interior designer), music, avatar, remix, product (product ad), swap (character swap), vfx, motion, '
      + 'montage (video editor), dubbing, model3d, presentation, photo (photo culling).',
    parameters: {
      type: 'OBJECT',
      properties: { tool: { type: 'STRING', enum: [...LIVE_OPEN_TOOLS], description: 'The tool to open.' } },
      required: ['tool'],
    },
  },
  {
    name: 'chat_send',
    description:
      'Write a message into the text chat on screen and send it, as if the user typed it; the written answer appears on '
      + 'screen. Use it for long or written answers (a document, a list, a plan, a table, code) or when the user asks you to '
      + 'write something in the chat. Then tell the user it is on the screen; do not read it all aloud.',
    parameters: {
      type: 'OBJECT',
      properties: { text: { type: 'STRING', description: `The message, in the user's language (at most ${LIVE_CHAT_TEXT_MAX_CHARS} characters).` } },
      required: ['text'],
    },
  },
  {
    name: 'new_chat',
    description: 'Start a new, empty chat session (the current one stays in the history).',
  },
  {
    name: 'set_chat_model',
    description: 'Switch the text chat model: fast (3.8 Flash), thinking (deeper reasoning), pro (3.1 Pro, the strongest), lite (lightest).',
    parameters: {
      type: 'OBJECT',
      properties: { model: { type: 'STRING', enum: [...LIVE_CHAT_MODELS], description: 'The chat model.' } },
      required: ['model'],
    },
  },
  {
    name: 'stop',
    description: 'Stop something on screen: the chat answer being written (reply), the running generations (generation), or both (all). '
      + 'Cancelling a generation cannot be undone.',
    parameters: {
      type: 'OBJECT',
      properties: { what: { type: 'STRING', enum: [...LIVE_STOP_TARGETS], description: 'What to stop.' } },
      required: ['what'],
    },
  },
  {
    name: 'scroll_chat',
    description: 'Scroll the chat on screen: to the top, to the bottom, or one screen up or down.',
    parameters: {
      type: 'OBJECT',
      properties: { to: { type: 'STRING', enum: [...LIVE_SCROLL_TARGETS], description: 'Where to scroll.' } },
      required: ['to'],
    },
  },
  {
    name: 'open_panel',
    description: 'Open a panel: settings (the open studio\'s settings), credits (balance and top-up), persona (the assistant\'s '
      + 'persona), connectors (connectors and plugins), search (search the chats), history (the list of chats).',
    parameters: {
      type: 'OBJECT',
      properties: { panel: { type: 'STRING', enum: [...LIVE_PANELS], description: 'The panel to open.' } },
      required: ['panel'],
    },
  },
  {
    name: 'call_view',
    description: 'Change how this call is shown: "screen" shrinks the call into a slim bar so the user sees the app while you '
      + 'talk; "full" brings the full call screen back. The call itself continues either way.',
    parameters: {
      type: 'OBJECT',
      properties: { view: { type: 'STRING', enum: [...LIVE_CALL_VIEWS], description: 'screen or full.' } },
      required: ['view'],
    },
  },
  {
    name: 'show_code',
    description:
      'Show code to the user by saving it in the app\'s code canvas. Use it whenever you would otherwise read code '
      + 'aloud; then describe what the code does in a sentence or two instead of reading it.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: `A short title for the code (at most ${LIVE_TITLE_MAX_CHARS} characters).` },
        language: { type: 'STRING', enum: [...LIVE_CODE_LANGUAGES], description: 'The programming language of the code.' },
        code: { type: 'STRING', description: 'The complete code, at most 200 KB.' },
      },
      required: ['title', 'language', 'code'],
    },
  },
  {
    name: 'end_call',
    description: 'End this voice call. Use it only when the user says goodbye or asks to hang up, then say a short goodbye.',
  },
] as LiveFunctionDeclaration[]);

/**
 * The system-instruction paragraph that goes with the declarations (the mint route appends it ONLY when the token
 * actually carries them — an instruction naming functions the session does not have makes the model claim actions
 * it never took).
 */
export const LIVE_ACTIONS_RULE = [
  'ACTIONS: you can operate the MyAvatar app on the user\'s screen through your functions while you talk.',
  'Call get_screen_state whenever the user refers to the screen, a result, a price or "this", before you answer.',
  'prepare_generation and update_settings fill and tune a studio; they never spend credits. Their answer gives the price:',
  'say it and ask whether to start. Call start_generation ONLY after the user clearly says yes to that price; it shows a',
  '3-second countdown they can cancel. Never start a generation on your own initiative.',
  'Use chat_send for anything long or written (documents, lists, plans, code explanations) and then say it is on the',
  'screen instead of reading it aloud; show_code for code. open_studio, new_chat, set_chat_model, stop, scroll_chat,',
  'open_panel and call_view do exactly what they say. end_call only when the user says goodbye.',
  'After a function answers, say in one short sentence what you did; if it answers ok:false, say so plainly and never',
  'pretend it worked.',
].join(' ');

// ─── Typed actions ───────────────────────────────────────────────────────────

export interface PrepareGenerationAction {
  type: 'prepare_generation';
  tool: LiveStudioTool;
  prompt: string;
  aspectRatio?: LiveAspectRatio;
  durationSec?: number;
  style?: string;
}
export interface UpdateSettingsAction {
  type: 'update_settings';
  aspectRatio?: LiveAspectRatio;
  durationSec?: number;
  style?: string;
  instrumental?: boolean;
}
export interface StartGenerationAction { type: 'start_generation' }
export interface GetScreenStateAction { type: 'get_screen_state' }
export interface ShowCodeAction { type: 'show_code'; title: string; language: LiveCodeLanguage; code: string }
export interface OpenStudioAction { type: 'open_studio'; tool: LiveOpenTool }
export interface ChatSendAction { type: 'chat_send'; text: string }
export interface NewChatAction { type: 'new_chat' }
export interface SetChatModelAction { type: 'set_chat_model'; model: LiveChatModel }
export interface StopAction { type: 'stop'; what: LiveStopTarget }
export interface ScrollChatAction { type: 'scroll_chat'; to: LiveScrollTarget }
export interface OpenPanelAction { type: 'open_panel'; panel: LivePanel }
export interface CallViewAction { type: 'call_view'; view: LiveCallView }
export interface EndCallAction { type: 'end_call' }
export type LiveAction =
  | GetScreenStateAction | PrepareGenerationAction | UpdateSettingsAction | StartGenerationAction | OpenStudioAction
  | ChatSendAction | NewChatAction | SetChatModelAction | StopAction | ScrollChatAction | OpenPanelAction | CallViewAction
  | ShowCodeAction | EndCallAction;

/**
 * What the studio writes back onto the event detail (`detail.reply`) while it handles an action — synchronously, inside
 * dispatchEvent — so the model's answer can carry facts only the studio knows: the price, the settings it actually
 * applied (a video length is snapped to the lengths the panel offers), the screen state, or why it refused.
 */
export interface LiveStudioReply {
  ok?: boolean;
  /** Machine code when it refused (no_prompt, not_generative, busy, signed_out …). */
  error?: string;
  /** English, for the model. */
  message?: string;
  /** Credits the run would cost (0/absent = the studio prices it later, e.g. a video's storyboard). */
  priceCredits?: number;
  /** Settings the studio really applied, e.g. { aspectRatio: '9:16', durationSec: 24 }. */
  applied?: Record<string, unknown>;
  /** get_screen_state: what is on screen. */
  state?: Record<string, unknown>;
  /** start_generation: which studio will run. */
  tool?: string;
}

/**
 * The `myavatar:live-action` detail: the typed action, plus `reveal` when the user tapped a card's Open after the call
 * ended (the studio should take focus then), plus `reply`, which the studio fills in while it handles the event.
 */
export type LiveActionEventDetail = LiveAction & { reveal?: true; reply?: LiveStudioReply };

/** Fired by the call when a confirmed start_generation's countdown ran out uncancelled: the studio runs it now. */
export const LIVE_RUN_EVENT = 'myavatar:live-run';
/** Fired by the call on start (`active: true`) and end — the studio keeps a call's turns in one thread meanwhile. */
export const LIVE_CALL_EVENT = 'myavatar:live-call';

/** The `myavatar:open-artifact` detail (the canvas contract — nothing more, nothing less). */
export interface OpenArtifactDetail { title: string; language: LiveCodeLanguage; code: string }

export type LiveActionErrorCode = 'unknown_tool' | 'invalid_args' | 'too_large';
export interface LiveActionError {
  code: LiveActionErrorCode;
  /** English, for the model (it explains in the user's language). */
  message: string;
  field?: string;
  allowed?: readonly string[];
}
export type LiveActionResult = { ok: true; action: LiveAction } | { ok: false; error: LiveActionError };

// ─── Sanitisers ──────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
/** Own properties only: a hostile `args` must not reach an inherited getter. */
const own = (o: Obj, k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);

// C0 controls except \t \n \r, DEL, C1 controls, and the bidi overrides/isolates that can make a prompt read
// differently from what runs (Trojan-Source style).
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‪-‮⁦-⁩]/g;

/** Cut at `max` UTF-16 units without leaving half a surrogate pair behind. */
function cut(s: string, max: number): string {
  if (s.length <= max) return s;
  let out = s.slice(0, max);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out;
}

/** One line: controls out, whitespace runs collapsed, trimmed, bounded. */
function cleanLine(s: string, max: number): string {
  return cut(s.replace(CONTROL_RE, '').replace(/\s+/g, ' ').trim(), max).trim();
}

/** Multi-line text (a prompt): controls out, CRLF → LF, at most one blank line in a row, trimmed, bounded. */
function cleanText(s: string, max: number): string {
  const t = s.replace(/\r\n?/g, '\n').replace(CONTROL_RE, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return cut(t, max).trim();
}

/** UTF-8 byte length without TextEncoder (absent from some jsdom builds). Lone surrogates count as U+FFFD (3 bytes). */
export function utf8ByteLength(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}

const TOOL_ALIASES: Readonly<Record<string, LiveStudioTool>> = {
  video: 'video', film: 'video', movie: 'video', clip: 'video', reel: 'video',
  image: 'image', photo: 'image', picture: 'image', img: 'image',
  music: 'music', song: 'music', track: 'music', audio: 'music',
  avatar: 'avatar', lipsync: 'avatar', talking_avatar: 'avatar', 'talking avatar': 'avatar',
};

const ASPECT_ALIASES: Readonly<Record<string, LiveAspectRatio>> = {
  landscape: '16:9', horizontal: '16:9', widescreen: '16:9',
  portrait: '9:16', vertical: '9:16', story: '9:16', reel: '9:16',
  square: '1:1',
};

const LANGUAGE_ALIASES: Readonly<Record<string, LiveCodeLanguage>> = {
  js: 'javascript', node: 'javascript', nodejs: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', py: 'python', python3: 'python', htm: 'html', sh: 'bash', shell: 'bash', zsh: 'bash',
  console: 'bash', terminal: 'bash', 'c++': 'cpp', cxx: 'cpp', 'c#': 'csharp', cs: 'csharp', golang: 'go',
  kt: 'kotlin', rb: 'ruby', rs: 'rust', yml: 'yaml', md: 'markdown', text: 'plaintext', txt: 'plaintext',
  plain: 'plaintext',
};

const fail = (code: LiveActionErrorCode, message: string, field?: string, allowed?: readonly string[]): LiveActionResult => ({
  ok: false,
  error: { code, message, ...(field ? { field } : {}), ...(allowed ? { allowed } : {}) },
});

function asTool(v: unknown): LiveStudioTool | null {
  if (typeof v !== 'string') return null;
  return TOOL_ALIASES[v.trim().toLowerCase()] ?? null;
}

function asAspect(v: unknown): LiveAspectRatio | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase().replace(/\s+/g, '').replace(/[x×/]/g, ':');
  if ((LIVE_ASPECT_RATIOS as readonly string[]).includes(t)) return t as LiveAspectRatio;
  return ASPECT_ALIASES[t] ?? null;
}

/** Known language or alias → canonical; any other short identifier-ish string → 'plaintext'; junk → null. */
function asLanguage(v: unknown): LiveCodeLanguage | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase();
  if (!t || t.length > 32) return null;
  if ((LIVE_CODE_LANGUAGES as readonly string[]).includes(t)) return t as LiveCodeLanguage;
  return LANGUAGE_ALIASES[t] ?? 'plaintext';
}

function asEnum<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase();
  return (allowed as readonly string[]).includes(t) ? (t as T) : null;
}

const OPEN_TOOL_ALIASES: Readonly<Record<string, LiveOpenTool>> = {
  ...TOOL_ALIASES,
  chat: 'chat', text: 'chat', photographer: 'photoshoot', photoshoot: 'photoshoot', interior: 'interior',
  interior_designer: 'interior', remix: 'remix', product: 'product', product_ad: 'product', swap: 'swap',
  character_swap: 'swap', vfx: 'vfx', motion: 'motion', montage: 'montage', editor: 'montage', video_editor: 'montage',
  dubbing: 'dubbing', dub: 'dubbing', model3d: 'model3d', '3d': 'model3d', presentation: 'presentation', slides: 'presentation',
  deck: 'presentation', culling: 'photo', photo_culling: 'photo',
};

function asOpenTool(v: unknown): LiveOpenTool | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if ((LIVE_OPEN_TOOLS as readonly string[]).includes(t)) return t as LiveOpenTool;
  return OPEN_TOOL_ALIASES[t] ?? OPEN_TOOL_ALIASES[t.replace(/_/g, ' ')] ?? null;
}

function asSwitch(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase();
  if (['on', 'yes', 'true', '1'].includes(t)) return true;
  if (['off', 'no', 'false', '0'].includes(t)) return false;
  return null;
}

function asDuration(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.trim().replace(/s(ec(onds?)?)?$/i, '')) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(LIVE_DURATION_MAX_SEC, Math.max(LIVE_DURATION_MIN_SEC, Math.round(n)));
}

// ─── Validators (one per tool) ──────────────────────────────────────────────

/**
 * Per-tool validators: raw model args → a typed action, or a structured error the model can act on (field + the
 * allowed values). Required fields are strict; optional fields are normalised when the intent is unambiguous
 * ("portrait" → 9:16, "1080x1920"-style junk → an error naming the allowed shapes) and bounded (prompt cut at 2,000,
 * style at 60, duration clamped to 1-120 s). Never throws.
 */
export const LIVE_ACTION_VALIDATORS: Readonly<Record<LiveActionName, (args: unknown) => LiveActionResult>> = {
  prepare_generation(args) {
    if (!isObj(args)) return fail('invalid_args', 'Arguments must be an object with tool and prompt.');
    const tool = asTool(own(args, 'tool'));
    if (!tool) return fail('invalid_args', 'Unknown studio.', 'tool', LIVE_STUDIO_TOOLS);
    const rawPrompt = own(args, 'prompt');
    const prompt = typeof rawPrompt === 'string' ? cleanText(rawPrompt, LIVE_PROMPT_MAX_CHARS) : '';
    if (!prompt) return fail('invalid_args', 'A non-empty prompt is required.', 'prompt');
    const action: PrepareGenerationAction = { type: 'prepare_generation', tool, prompt };

    const rawAspect = own(args, 'aspectRatio');
    if (rawAspect !== undefined && rawAspect !== null && rawAspect !== '') {
      const aspect = asAspect(rawAspect);
      if (!aspect) return fail('invalid_args', 'Unsupported aspect ratio.', 'aspectRatio', LIVE_ASPECT_RATIOS);
      action.aspectRatio = aspect;
    }
    const rawDuration = own(args, 'durationSec');
    if (rawDuration !== undefined && rawDuration !== null && rawDuration !== '') {
      const d = asDuration(rawDuration);
      if (d === null) return fail('invalid_args', 'durationSec must be a number of seconds.', 'durationSec');
      action.durationSec = d;
    }
    const rawStyle = own(args, 'style');
    if (rawStyle !== undefined && rawStyle !== null) {
      if (typeof rawStyle !== 'string') return fail('invalid_args', 'style must be text.', 'style');
      const style = cleanLine(rawStyle, LIVE_STYLE_MAX_CHARS);
      if (style) action.style = style;
    }
    return { ok: true, action };
  },

  get_screen_state() {
    return { ok: true, action: { type: 'get_screen_state' } };
  },

  update_settings(args) {
    if (!isObj(args)) return fail('invalid_args', 'Arguments must be an object with at least one setting.');
    const action: UpdateSettingsAction = { type: 'update_settings' };
    const rawAspect = own(args, 'aspectRatio');
    if (rawAspect !== undefined && rawAspect !== null && rawAspect !== '') {
      const aspect = asAspect(rawAspect);
      if (!aspect) return fail('invalid_args', 'Unsupported aspect ratio.', 'aspectRatio', LIVE_ASPECT_RATIOS);
      action.aspectRatio = aspect;
    }
    const rawDuration = own(args, 'durationSec');
    if (rawDuration !== undefined && rawDuration !== null && rawDuration !== '') {
      const d = asDuration(rawDuration);
      if (d === null) return fail('invalid_args', 'durationSec must be a number of seconds.', 'durationSec');
      action.durationSec = d;
    }
    const rawStyle = own(args, 'style');
    if (rawStyle !== undefined && rawStyle !== null && rawStyle !== '') {
      if (typeof rawStyle !== 'string') return fail('invalid_args', 'style must be text.', 'style');
      const style = cleanLine(rawStyle, LIVE_STYLE_MAX_CHARS);
      if (style) action.style = style;
    }
    const rawInstr = own(args, 'instrumental');
    if (rawInstr !== undefined && rawInstr !== null && rawInstr !== '') {
      const on = asSwitch(rawInstr);
      if (on === null) return fail('invalid_args', 'instrumental must be "on" or "off".', 'instrumental', LIVE_SWITCH_VALUES);
      action.instrumental = on;
    }
    if (Object.keys(action).length === 1) return fail('invalid_args', 'Name at least one setting to change.', 'aspectRatio');
    return { ok: true, action };
  },

  start_generation(args) {
    // ⚠️ The model must ASSERT the user's yes. Anything but "yes" is refused with a message that sends it back to ask.
    const confirmed = isObj(args) ? own(args, 'confirmed') : undefined;
    if (asSwitch(confirmed) !== true && !(typeof confirmed === 'string' && /^\s*yes\s*$/i.test(confirmed))) {
      return fail('invalid_args', 'Only call this after telling the price and hearing a clear yes; then pass confirmed "yes".', 'confirmed', ['yes']);
    }
    return { ok: true, action: { type: 'start_generation' } };
  },

  chat_send(args) {
    if (!isObj(args)) return fail('invalid_args', 'Arguments must be an object with text.');
    const raw = own(args, 'text');
    const text = typeof raw === 'string' ? cleanText(raw, LIVE_CHAT_TEXT_MAX_CHARS) : '';
    if (!text) return fail('invalid_args', 'A non-empty text is required.', 'text');
    return { ok: true, action: { type: 'chat_send', text } };
  },

  new_chat() {
    return { ok: true, action: { type: 'new_chat' } };
  },

  set_chat_model(args) {
    const model = isObj(args) ? asEnum(own(args, 'model'), LIVE_CHAT_MODELS) : null;
    if (!model) return fail('invalid_args', 'Unknown chat model.', 'model', LIVE_CHAT_MODELS);
    return { ok: true, action: { type: 'set_chat_model', model } };
  },

  stop(args) {
    const what = isObj(args) ? asEnum(own(args, 'what'), LIVE_STOP_TARGETS) : null;
    if (!what) return fail('invalid_args', 'Say what to stop.', 'what', LIVE_STOP_TARGETS);
    return { ok: true, action: { type: 'stop', what } };
  },

  scroll_chat(args) {
    const to = isObj(args) ? asEnum(own(args, 'to'), LIVE_SCROLL_TARGETS) : null;
    if (!to) return fail('invalid_args', 'Say where to scroll.', 'to', LIVE_SCROLL_TARGETS);
    return { ok: true, action: { type: 'scroll_chat', to } };
  },

  open_panel(args) {
    const panel = isObj(args) ? asEnum(own(args, 'panel'), LIVE_PANELS) : null;
    if (!panel) return fail('invalid_args', 'Unknown panel.', 'panel', LIVE_PANELS);
    return { ok: true, action: { type: 'open_panel', panel } };
  },

  call_view(args) {
    const view = isObj(args) ? asEnum(own(args, 'view'), LIVE_CALL_VIEWS) : null;
    if (!view) return fail('invalid_args', 'view must be screen or full.', 'view', LIVE_CALL_VIEWS);
    return { ok: true, action: { type: 'call_view', view } };
  },

  show_code(args) {
    if (!isObj(args)) return fail('invalid_args', 'Arguments must be an object with title, language and code.');
    const rawCode = own(args, 'code');
    if (typeof rawCode !== 'string') return fail('invalid_args', 'code must be text.', 'code');
    // Verbatim apart from line endings and NULs: indentation and blank lines ARE the code.
    const code = rawCode.replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
    if (!code.trim()) return fail('invalid_args', 'code is empty.', 'code');
    if (utf8ByteLength(code) > LIVE_CODE_MAX_BYTES) {
      return fail('too_large', `code is larger than ${LIVE_CODE_MAX_BYTES / 1024} KB; show a shorter excerpt.`, 'code');
    }
    const language = asLanguage(own(args, 'language'));
    if (!language) return fail('invalid_args', 'language must be a language name.', 'language', LIVE_CODE_LANGUAGES);
    const rawTitle = own(args, 'title');
    if (rawTitle !== undefined && rawTitle !== null && typeof rawTitle !== 'string') {
      return fail('invalid_args', 'title must be text.', 'title');
    }
    // A missing title is not worth a retry round-trip mid-sentence: the canvas still needs a name.
    const title = (typeof rawTitle === 'string' ? cleanLine(rawTitle, LIVE_TITLE_MAX_CHARS) : '') || 'Code';
    return { ok: true, action: { type: 'show_code', title, language, code } };
  },

  open_studio(args) {
    if (!isObj(args)) return fail('invalid_args', 'Arguments must be an object with tool.');
    const tool = asOpenTool(own(args, 'tool'));
    if (!tool) return fail('invalid_args', 'Unknown tool.', 'tool', LIVE_OPEN_TOOLS);
    return { ok: true, action: { type: 'open_studio', tool } };
  },

  // No arguments: anything the model sends along is ignored.
  end_call() {
    return { ok: true, action: { type: 'end_call' } };
  },
};

export function isLiveActionName(v: unknown): v is LiveActionName {
  return typeof v === 'string' && (LIVE_ACTION_NAMES as readonly string[]).includes(v);
}

/** Validate one function call by name. Unknown names are a structured `unknown_tool` error. Never throws. */
export function validateLiveToolCall(name: unknown, args: unknown): LiveActionResult {
  if (!isLiveActionName(name)) return fail('unknown_tool', 'No such function.', 'name', LIVE_ACTION_NAMES);
  try {
    return LIVE_ACTION_VALIDATORS[name](args);
  } catch {
    // Hostile shapes (throwing getters / proxies) end here, never in the socket's message loop.
    return fail('invalid_args', 'Arguments could not be read.');
  }
}
