/**
 * lib/voice/liveTools.ts — VOICE-TO-ACTION for Gemini Live: the function declarations the model may call while the
 * user talks, and the strict validators that turn its raw `args` into a typed action the UI can run.
 *
 * Isomorphic and dependency-free: the mint route (app/api/voice/live) locks LIVE_FUNCTION_DECLARATIONS into the
 * ephemeral token through buildLiveSetup (lib/voice/geminiLive.ts), and the browser
 * (components/voice/live/liveActions.ts) validates every `toolCall` with validateLiveToolCall before anything
 * happens on screen. Contract + safety rule: docs/voice/LIVE_ACTIONS.md.
 *
 * ⚠️ THE SAFETY RULE — A TOOL ONLY PREPARES. prepare_generation switches a studio and fills its prompt; open_studio
 * switches; show_code opens a canvas; end_call hangs up. NOTHING here starts a render or charges a credit — the user
 * reviews what was prepared and taps Run. (dispatchServiceBlock's image/music branch in OmniStudio renders at once;
 * the Live listener must never reuse that branch.) Any new tool that would spend money needs a user tap, not a call.
 *
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

export const LIVE_ACTION_NAMES = ['prepare_generation', 'show_code', 'open_studio', 'end_call'] as const;
export type LiveActionName = (typeof LIVE_ACTION_NAMES)[number];

/** The studios a call may prepare — each one is also a lib/studio/tools.ts ToolId (OmniStudio's selectTool). */
export const LIVE_STUDIO_TOOLS = ['video', 'image', 'music', 'avatar'] as const;
export type LiveStudioTool = (typeof LIVE_STUDIO_TOOLS)[number];

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

/** The tool block's payload — `{ functionDeclarations: LIVE_FUNCTION_DECLARATIONS }`. Frozen; JSON-safe. */
export const LIVE_FUNCTION_DECLARATIONS: readonly LiveFunctionDeclaration[] = deepFreeze([
  {
    name: 'prepare_generation',
    description:
      'Prepare a creation in a MyAvatar studio: switch to that studio and fill in the prompt (and optionally the shape, '
      + 'length and style) for the user to review. It does NOT start the generation and spends no credits — the user '
      + 'starts it with the Run button. Use it when the user clearly asks you to make a video, an image, music or a '
      + 'talking avatar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        tool: TOOL_PARAM,
        prompt: {
          type: 'STRING',
          description: `What to make: a short, concrete prompt in the language the user is speaking (at most ${LIVE_PROMPT_MAX_CHARS} characters).`,
        },
        aspectRatio: {
          type: 'STRING',
          enum: [...LIVE_ASPECT_RATIOS],
          description: 'Optional frame shape for video, image or avatar: 16:9 landscape, 9:16 vertical, 1:1 square, 4:5, 3:4 or 4:3.',
        },
        durationSec: {
          type: 'INTEGER',
          description: `Optional length in seconds for video or music (${LIVE_DURATION_MIN_SEC}-${LIVE_DURATION_MAX_SEC}).`,
        },
        style: {
          type: 'STRING',
          description: `Optional short style or genre, e.g. "watercolor", "cinematic", "lo-fi" (at most ${LIVE_STYLE_MAX_CHARS} characters).`,
        },
      },
      required: ['tool', 'prompt'],
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
    name: 'open_studio',
    description: 'Switch the app to a studio without preparing anything in it.',
    parameters: { type: 'OBJECT', properties: { tool: TOOL_PARAM }, required: ['tool'] },
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
  'ACTIONS: while you talk you can act in the app through your functions.',
  'prepare_generation fills a studio with a prompt; it NEVER starts a generation or spends credits, so afterwards tell',
  'the user it is ready and that they start it themselves with the Run button. Call it only when the user clearly',
  'wants something made. open_studio only switches the studio. show_code saves code in the code canvas: never read',
  'code aloud, summarise it in a sentence. end_call hangs up: use it only when the user says goodbye.',
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
export interface ShowCodeAction { type: 'show_code'; title: string; language: LiveCodeLanguage; code: string }
export interface OpenStudioAction { type: 'open_studio'; tool: LiveStudioTool }
export interface EndCallAction { type: 'end_call' }
export type LiveAction = PrepareGenerationAction | ShowCodeAction | OpenStudioAction | EndCallAction;

/**
 * The `myavatar:live-action` detail: the typed action, plus `reveal` when the user tapped a card's Open after the call
 * ended (the studio should take focus then — never during the call, the Live dialog owns focus).
 */
export type LiveActionEventDetail = LiveAction & { reveal?: true };

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
    const tool = asTool(own(args, 'tool'));
    if (!tool) return fail('invalid_args', 'Unknown studio.', 'tool', LIVE_STUDIO_TOOLS);
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
