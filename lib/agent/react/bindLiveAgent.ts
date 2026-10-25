import 'server-only';

/**
 * Live binding for the ReAct coordinator (STEP 3). Wires the injected seams of ./coordinator
 * to real infrastructure:
 *   - llm      → llmText, Gemini only (MASTER TASK v3.1: no env value brings back the old DeepSeek / Atlas /
 *                Anthropic chain).
 *   - tools    → web_search, scrape_webpage, prepare_instagram_post (⛔ prepare-only), quote_montage_to_music and
 *                quote_media_edit when the request carries the user's files and AGENT_G_MEDIA_EXEC is open to them, and
 *                quote_audio_from_link when AGENT_G_MEDIA_EXEC is open to them (all quote only, see MEDIA).
 *                They are the typed allowlist LIVE_TOOL_SPECS (lib/agent/tools/registry): each input is parsed by its
 *                schema before the tool runs, each tool has a per-request call limit and an effect class, and no
 *                effect lets the model start a job or spend credits.
 *
 * web_search is Gemini + Google Search grounding (lib/agent/tools/googleSearch.ts), in Tavily's old
 * `{ answer, results[] }` shape. The Tavily leg is gone.
 *
 * MEDIA: ONE TOOL, AND IT ONLY QUOTES. `orchestrate_media` was removed because it called startAdRenderJob, which only
 * INSERTED a `generation_jobs` row: nothing ever processed it, and no credit was reserved or debited. A media tool came
 * back only with a real worker and the ledger reserve/refund saga behind it, and that is lib/agent/media (Agent G's
 * media execution, slice 1): `quote_montage_to_music` cuts the clips the user attached to THIS request to the music
 * track they attached, on the beat. The tool analyses, plans and prices (montageExec.quoteMontage); it renders nothing
 * and spends nothing. The signed quote goes back to the caller (`onMediaQuote` → the route's `mediaQuote`), and the
 * render runs only when the user confirms it (/api/agent/media/montage `run`: the existing montage lane, one job per
 * quote, QC, refund, audit). The tool exists only when AGENT_G_MEDIA_EXEC opens it to this user (the route decides,
 * from the session) AND the request carries files; the agent never sees a URL it could swap for someone else's, and
 * every file is checked to be the caller's own (lib/security/callerMedia). Every other render still belongs to the
 * Studio lanes: the agent writes the brief and sends the user there (AGENT_MEDIA_NOTE).
 *
 * `quote_audio_from_link` is the same contract for "take the MP3 out of this video": it checks the link (a direct media
 * file on a public host; a video platform is refused by name, never worked around), its rights and its size, and
 * returns the plan (lib/agent/media/audioExtract.quoteAudioExtract). It downloads and decodes nothing; the signed plan
 * goes back through `onAudioQuote` (the route's `audioQuote`) and the extraction runs only on the user's Start
 * (/api/agent/media/audio `run`: the lease queue, its worker, QC, the user's private storage). It is free.
 *
 * `analyze_media` (effect `inspect`) reads one attached file, or a public YouTube video, whole, with Gemini by reference
 * (lib/agent/media/analyzeExec) and returns what is in it: scenes, moments, the words spoken, the things on screen. It
 * changes nothing and charges the user nothing; it is offered only when AGENT_G_FILE_ANALYSIS opens it to this user
 * (each call is a paid model call). Its times are a reading: cuts are still planned and checked by FFmpeg.
 *
 * `quote_media_edit` is the same contract for one of the attached videos: the model names the edits (typed, bounded),
 * never a file path; the edits are resolved against the file (lib/agent/media/editExec.quoteEdit: the exact range kept,
 * the frame, the length) and the signed plan goes back through `onEditQuote` (the route's `editQuote`). ffmpeg runs only
 * on the user's Start (/api/agent/media/edit `run`). Free.
 *
 * The coordinator's control flow is unit-tested at $0 (coordinator.test.ts); this file's wiring is tested with
 * every provider mocked (bindLiveAgent.test.ts).
 */
import { imageQuoteTool, type ImageToolContext } from '@/lib/image/studio/agentTool';
import { llmText } from '@/lib/ai/llmText';
import { chatModelChain, geminiTierModel } from '@/lib/ai/google/models';
import { newRunMeter, type AgentRunMetrics } from '@/lib/ai/usageMetrics';
import { structuredLog } from '@/lib/logger';
import { runReActLoop, type AgentTool, type ReActResult } from './coordinator';
import { z } from 'zod';
import { scrapeWebpage, scrapeWebpageInput } from '@/lib/agent/tools/scrapeWebpage';
import { prepareInstagramPost, prepareInstagramPostInput } from '@/lib/agent/tools/prepareInstagramPost';
import { groundedWebSearch } from '@/lib/agent/tools/googleSearch';
import { bindTools, defineTool, type ToolSpec } from '@/lib/agent/tools/registry';
import { MAX_TOTAL_SEC } from '@/lib/services/montage/montagePlan';
import type { QuoteResult } from '@/lib/agent/media/montageExec';
import type { AudioQuoteResult } from '@/lib/agent/media/audioExtract';
import type { EditQuoteResult } from '@/lib/agent/media/editExec';
import {
  ASPECTS, FITS, GRADES, MAX_ADJUST, MAX_CAPTION_CHARS, MAX_ERASE_BOXES, MAX_FADE_SEC, MAX_VOLUME_DB, MIN_VOLUME_DB, OVERLAY_LOOKS,
} from '@/lib/agent/media/editPlan';
import { editAskOf, type EditAsk } from '@/lib/agent/media/editWords';
import {
  ANCHORS, MAX_CUE_TEXT, MAX_CUES, MAX_IMAGE_SIZE, MAX_LAYER_TEXT, MAX_LAYERS, MIN_SIZE, MOTIONS_IN, TEXT_ROLES, TEXT_STYLES,
} from '@/lib/agent/media/layers';
import { MAX_SPEED, MIN_SPEED } from '@/lib/video/editFilters';

export interface AgentContext extends ImageToolContext {
  userId: string;
  /** The files the user attached to THIS request (their upload paths or our signed links), in their order. */
  files?: string[];
  /** Agent G's media execution is open to this user (lib/agent/media/access, decided from the session by the route). */
  media?: boolean;
  /** Receives every signed quote the media tool makes; the route hands the last one to the client's confirm card. */
  onMediaQuote?: (quote: Extract<QuoteResult, { ok: true }>) => void;
  /** Receives every signed audio-extraction plan; the route hands the last one to the client's Start card. */
  onAudioQuote?: (quote: Extract<AudioQuoteResult, { ok: true }>) => void;
  /** Receives every signed edit plan; the route hands the last one to the client's Start card. */
  onEditQuote?: (quote: Extract<EditQuoteResult, { ok: true }>) => void;
  /** Agent G's whole-file analysis is open to this user (AGENT_G_FILE_ANALYSIS, decided from the session by the route). */
  analyze?: boolean;
}

/** Appended to the system prompt when the agent has no media tool: it cannot render, so it must not promise a render. */
export const AGENT_MEDIA_NOTE =
  'You cannot start video, image or music renders from here. When the user wants media made, put a ' +
  'ready-to-use brief (prompt, style, duration, aspect) in your final answer and tell them to run it in the ' +
  'MyAvatar Studio, where it is created and billed.';

/** Appended instead when the request carries the user's files and the montage tool is on. */
export const AGENT_MONTAGE_NOTE =
  'The user attached files to this request. When they want their video clips cut to their music track, call ' +
  'quote_montage_to_music: it analyses the files, finds the beat and returns the plan and its price. It renders ' +
  'nothing: the user sees the plan with a Confirm button and the edit starts only when they press it. Tell them what ' +
  'the plan is (shots, length, beat, format, any clip left out and why) and that it starts on Confirm; never say it is ' +
  'already made. For any other video, image or music render, put a ready-to-use brief in your final answer and tell ' +
  'them to run it in the MyAvatar Studio, where it is created and billed.';

/** Added to either note when the audio tool is on: the agent plans the extraction and never claims it ran. */
export const AGENT_AUDIO_NOTE =
  'When the user sends a link to a video or audio file and wants its sound as an MP3, call quote_audio_from_link with ' +
  'that link. It checks the source and its rights and returns the plan; it downloads nothing. Video platforms ' +
  '(YouTube, TikTok, Instagram, Facebook and the like) are refused by their terms: never look for a way around that; ' +
  'tell the user to upload their own or a licensed file in the MyAvatar chat instead. The extraction starts only when ' +
  'the user presses Start on the plan in the MyAvatar chat, and it is free; never say the MP3 is already made.';

/** Added when the edit tool is on: the agent plans the edit of an attached video and never claims it ran. */
export const AGENT_EDIT_NOTE =
  'When the user wants one of the videos or pictures they attached edited (trimmed, sped up or slowed down, reframed to ' +
  '9:16, 16:9, 1:1 or 4:5, cropped, with bars or over a blurred copy of itself, a colour look, brighter, darker, more ' +
  'contrast, more or less colour, warmer or cooler, sharper, a vignette, mirrored, turned 90°, 180° or 270°, a zoom in ' +
  'or out, a shake, a glitch, steadied, fades, louder, quieter, silent, background noise taken out, the sound evened ' +
  'out, a still frame as a thumbnail; text, a CTA, a logo from another attached picture, a blur or mosaic put on it; ' +
  'caption lines the user gave with their times), ' +
  'call quote_media_edit with the edits and the file number. Text is drawn exactly as the user said it: never reword, ' +
  'translate or invent it. Captions of what is spoken, or a translation of them, are not available yet (a paid call ' +
  'is the owner\'s decision): say so instead of making lines up. A logo, watermark or subtitles that stay in one place ' +
  'can be erased (op erase); a moving person or object, or the background, cannot (that needs a paid AI call). ' +
  'Playing a video backwards is not available. ' +
  'The tool reads the file and returns the plan; it edits nothing. The edit starts only when the user presses Start ' +
  'on the plan in the MyAvatar chat, and it is free; never say it is done.';

/** Added when the analysis tool is on: what it is for, and that its times are a reading, not a cut. */
export const AGENT_ANALYZE_NOTE =
  'To know what is in a video, a sound file, a PDF or a picture the user attached (what happens, the scenes, the best ' +
  'moments, what is said and by whom), or in a public YouTube video they linked, call analyze_media. It reads the whole ' +
  'file and returns a description with times in seconds; it changes nothing and costs the user nothing. Its times are ' +
  'a reading: any cut is planned by quote_media_edit or the montage, which check them against the file. A YouTube link ' +
  'is analysed only: never offer to download it or take its sound.';

/** Each quote downloads and decodes every attached file: two per request (say, a second format) is plenty. */
export const MAX_QUOTES_PER_RUN = 2;
/** The tool is offered only for a request with files, and only when media execution is open to this user. */
export const montageToolOn = (ctx: AgentContext): boolean => ctx.media === true && (ctx.files?.length ?? 0) > 0;
/** The audio tool needs no files (the link is in the user's words), only media execution open to this user. */
export const audioToolOn = (ctx: AgentContext): boolean => ctx.media === true;
/** An audio quote reads a link's headers only (no download), but two per request is plenty. */
export const MAX_AUDIO_QUOTES_PER_RUN = 2;
/** The edit tool needs an attached file to edit, and media execution open to this user. */
export const editToolOn = (ctx: AgentContext): boolean => ctx.media === true && (ctx.files?.length ?? 0) > 0;
/** An edit quote probes one file: three per request (a second try with other numbers) is plenty. */
export const MAX_EDIT_QUOTES_PER_RUN = 3;
/** The analysis tool reads an attached file or a YouTube link, when its flag is open to this user. */
export const analyzeToolOn = (ctx: AgentContext): boolean => ctx.analyze === true;
/** Each analysis is a paid model call over a whole file: two per request. */
export const MAX_ANALYSES_PER_RUN = 2;

type RunMeter = ReturnType<typeof newRunMeter>;

/** One step's model call never runs longer than this. */
export const LLM_STEP_TIMEOUT_MS = 40_000;
/** A first attempt that still has the step-down behind it stops this long before the run's deadline. */
export const STEP_DOWN_RESERVE_MS = 12_000;
/** The step-down is tried only with at least this much of the run left. */
export const MIN_LLM_ATTEMPT_MS = 5_000;

/**
 * The model a step that missed retries on: the next model of the chat's Flash chain (3.6 Flash after 3.8 Flash
 * today), so one slow or busy model no longer ends a task.
 */
export function stepDownModel(): string | undefined {
  const primary = geminiTierModel('flash');
  return chatModelChain('standard').find((id) => id !== primary);
}

/** A run with at most this much time (a Live call's ask_agent_g: 45 s) answers from the quick models. */
export const QUICK_RUN_MS = 60_000;
/**
 * A quick run's step models, fastest first. Vertex probe 2026-10-25 with Agent G's prompt: 3.6 Flash 3.0–3.6 s,
 * 3.1 Flash-Lite 2.1 s; 3.8 Flash 4.9 s with thinking 'low' once, then over 33 s in GG's Live call.
 */
export const QUICK_STEP_MODELS = ['gemini-3.6-flash', 'gemini-3.1-flash-lite'] as const;
/** A quick run's attempt never takes longer than this, so the fallback and the next steps keep their time. */
export const QUICK_STEP_TIMEOUT_MS = 20_000;

/**
 * Collapse the ReAct transcript into a single llmText call. The system prompt and the transcript so far are the same
 * prefix on every step of a run, which is what Gemini's implicit context cache keys on; the meter records the hits.
 *
 * ⚠️ EACH CALL FITS THE RUN'S DEADLINE. The call used to get a flat 40 s, so a step started late in a Live task's 45 s
 * budget outlived the call that asked for it, and a model that missed ended the run (GG's task failed twice,
 * 2026-10-25). Now the first attempt stops STEP_DOWN_RESERVE_MS before the deadline, and a miss is retried once in
 * whatever time is left: on stepDownModel(), or for a quick run on the next QUICK_STEP_MODELS entry.
 *
 * ⚠️ JSON MODE. Every turn is one JSON object, and the call asks for exactly that: given the tool list as prose, 3.6
 * Flash answered a turn with a native function call it could not form (finishReason MALFORMED_FUNCTION_CALL, no text),
 * which ended GG's Live task (2026-10-25 10:27Z).
 */
function llmAdapterFor(meter: RunMeter, deadlineMs?: number, quick = false) {
  const [firstModel, fallback] = quick ? QUICK_STEP_MODELS : [undefined, stepDownModel()];
  const cap = quick ? QUICK_STEP_TIMEOUT_MS : LLM_STEP_TIMEOUT_MS;
  return async (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string | null> => {
    const system = messages.find((m) => m.role === 'system')?.content;
    const convo = messages
      .filter((m) => m.role !== 'system')
      .map((m) => (m.role === 'assistant' ? `Assistant: ${m.content}` : m.content))
      .join('\n\n');
    const call = (timeoutMs: number, geminiModel?: string) => llmText({
      system, user: convo, maxTokens: 1500, temperature: 0.4, timeoutMs, googleOnly: true, json: true,
      ...(geminiModel ? { geminiModel } : {}),
      onUsage: (u) => meter.addLlm(u),
    });
    const left = () => (deadlineMs ? deadlineMs - Date.now() : Infinity);
    const first = fallback
      ? Math.max(left() - STEP_DOWN_RESERVE_MS, Math.min(left(), MIN_LLM_ATTEMPT_MS))
      : left();
    const text = await call(Math.max(1, Math.min(cap, first)), firstModel);
    if (text != null || !fallback || left() < MIN_LLM_ATTEMPT_MS) return text;
    return call(Math.min(cap, left()), fallback);
  };
}

/** Each tool call timed into the run's meter (search, page reads and quotes are most of a run's wall clock). */
function timed(tools: AgentTool[], meter: RunMeter): AgentTool[] {
  return tools.map((t) => ({
    ...t,
    run: async (input: unknown) => {
      const started = Date.now();
      try { return await t.run(input); } finally { meter.addTool(Date.now() - started); }
    },
  }));
}

/** The goal rides along so the montage quote reads the user's words (aspect, length) from it. */
type LiveCtx = AgentContext & { goal: string };

/** Numbers a model sends as text ("30") are read as numbers; anything else is left for the schema to refuse. */
const num = (schema: z.ZodNumber) => z.preprocess((v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v), schema);

/** A point in a video, in seconds (a 10-hour cap; the quote checks it against the file). */
const at = () => num(z.number().min(0).max(36_000));
const ANCHOR = z.enum(ANCHORS as unknown as [string, ...string[]]);
const TEXT_STYLE = z.enum(TEXT_STYLES as unknown as [string, ...string[]]);
const MOTION_IN = z.enum(MOTIONS_IN as unknown as [string, ...string[]]);
/** When a layer shows (Media Studio v2.1): the whole result, its first or last seconds, a range, or all but its last seconds. */
const layerTime = { fromSec: at().optional(), toSec: at().optional(), firstSec: at().optional(), lastSec: at().optional(), beforeLastSec: at().optional() };
/**
 * A layer to put on (lib/agent/media/layers LayerAsk), flat: `kind` says which. A picture is one of the attached files,
 * named by its number (`picture`), never a link the model writes.
 */
const layerAdd = z.object({
  kind: z.enum(['text', 'image', 'mask']),
  text: z.string().trim().min(1).max(MAX_LAYER_TEXT).optional(),
  role: z.enum(TEXT_ROLES as unknown as [string, ...string[]]).optional(),
  picture: num(z.number().int().min(1).max(13)).optional(),
  anchor: ANCHOR.optional(),
  size: num(z.number().min(MIN_SIZE).max(MAX_IMAGE_SIZE)).optional(),
  style: TEXT_STYLE.optional(),
  motionIn: MOTION_IN.optional(),
  beats: z.boolean().optional(),
  mode: z.enum(['blur', 'mosaic']).optional(),
  ...layerTime,
}).strict();
/** Which layer of Agent G's own last edit a change or a removal is about. */
const layerTarget = z.object({
  kind: z.enum(['text', 'image', 'mask']).optional(),
  where: z.enum(['top', 'bottom', 'left', 'right', 'center']).optional(),
  all: z.boolean().optional(),
}).strict();
const layerChange = z.object({
  target: layerTarget.optional(),
  moveH: z.enum(['left', 'center', 'right']).optional(),
  moveV: z.enum(['top', 'middle', 'bottom']).optional(),
  anchor: ANCHOR.optional(),
  sizeBy: num(z.number().min(0.25).max(4)).optional(),
  style: TEXT_STYLE.optional(),
  motionIn: MOTION_IN.optional(),
  text: z.string().trim().min(1).max(MAX_LAYER_TEXT).optional(),
  beats: z.boolean().optional(),
  ...layerTime,
}).strict();
/**
 * Caption lines the user gave (typed or read out), with their times: never a transcript or a translation of ours. The
 * layer and track shapes are strict: a field the model invents (a picture's link, a track's „transcript" source) is
 * refused, not dropped.
 */
const captionTrack = z.object({
  lang: z.enum(['ka', 'en', 'ru', 'und']),
  cues: z.array(z.object({ startSec: at(), endSec: at(), text: z.string().trim().min(1).max(MAX_CUE_TEXT) }).strict()).min(1).max(MAX_CUES),
  style: TEXT_STYLE.optional(),
}).strict();

/** A light-and-colour change: -100 (less) to 100 (more), 0 = as it is. */
const signedAdjust = () => num(z.number().int().min(-MAX_ADJUST).max(MAX_ADJUST));

/** A place of the picture itself to erase (a logo, a watermark, subtitles that stay there), and when. */
const eraseBox = z.object({
  at: ANCHOR, fromSec: at().optional(), toSec: at().optional(), firstSec: at().optional(), lastSec: at().optional(),
}).strict();

/**
 * One edit as the model may ask it (lib/agent/media/editWords EditAsk), every field bounded. One flat object (the
 * function-declaration subset has no tagged union): `op` says which edit, and only that op's own fields may be set
 * (editAskOf); the quote resolves the rest against the file.
 */
const editAsk = z.object({
  op: z.enum([
    'trim', 'speed', 'erase', 'aspect', 'grade', 'fade', 'volume', 'mute', 'overlay', 'caption', 'thumbnail', 'layers', 'captions',
    'adjust', 'flip', 'rotate', 'motion', 'stabilize', 'denoise', 'loudness',
  ]),
  fromSec: at().optional(), toSec: at().optional(), lastSec: at().optional(), cutEndSec: at().optional(),
  factor: num(z.number().min(MIN_SPEED).max(MAX_SPEED)).optional(),
  to: z.enum(ASPECTS as unknown as [string, ...string[]]).optional(),
  fit: z.enum(FITS as unknown as [string, ...string[]]).optional(),
  brightness: signedAdjust().optional(), contrast: signedAdjust().optional(), saturation: signedAdjust().optional(), warmth: signedAdjust().optional(),
  sharpen: num(z.number().int().min(0).max(MAX_ADJUST)).optional(), vignette: num(z.number().int().min(0).max(MAX_ADJUST)).optional(),
  axis: z.enum(['horizontal', 'vertical']).optional(),
  deg: num(z.number().int().min(-270).max(270)).optional(),
  zoom: z.enum(['in', 'out']).optional(),
  shake: z.boolean().optional(),
  glitch: z.boolean().optional(),
  style: z.enum(GRADES as unknown as [string, ...string[]]).optional(),
  look: z.enum(OVERLAY_LOOKS as unknown as [string, ...string[]]).optional(),
  inSec: num(z.number().min(0).max(MAX_FADE_SEC)).optional(),
  outSec: num(z.number().min(0).max(MAX_FADE_SEC)).optional(),
  db: num(z.number().min(MIN_VOLUME_DB).max(MAX_VOLUME_DB)).optional(),
  text: z.string().trim().min(1).max(MAX_CAPTION_CHARS).optional(),
  atSec: at().optional(),
  add: z.array(layerAdd).min(1).max(MAX_LAYERS).optional(),
  change: z.array(layerChange).min(1).max(MAX_LAYERS).optional(),
  remove: z.array(layerTarget).min(1).max(MAX_LAYERS).optional(),
  track: captionTrack.optional(),
  deliver: z.enum(['burned', 'both', 'file']).optional(),
  off: z.boolean().optional(),
  boxes: z.array(eraseBox).min(1).max(MAX_ERASE_BOXES).optional(),
}).refine((a) => editAskOf(withSource(a)) !== null, { message: 'A field was set that its op does not take.' });

/** A track the model passes on is the user's own lines: typed (lib/agent/media/editWords editAskOf takes no other). */
function withSource(a: Record<string, unknown>): Record<string, unknown> {
  const t = a.track as Record<string, unknown> | undefined;
  return t ? { ...a, track: { ...t, source: 'typed' } } : a;
}

/** The model's edits as the quote takes them: a picture layer's file number → that attached file, a track marked typed. */
export function editsForQuote(edits: ReadonlyArray<Record<string, unknown>>, files: readonly string[]): { ok: true; edits: EditAsk[] } | { ok: false; message: string } {
  const out: EditAsk[] = [];
  for (const raw of edits) {
    const a = withSource(raw);
    if (a.op === 'layers' && Array.isArray(a.add)) {
      const add: Record<string, unknown>[] = [];
      for (const l of a.add as Record<string, unknown>[]) {
        const { picture, ...rest } = l;
        if (rest.kind !== 'image') { add.push(rest); continue; }
        const ref = typeof picture === 'number' ? files[picture - 1] : undefined;
        if (!ref) return { ok: false, message: `A picture layer needs the number of an attached picture (${files.length} attached).` };
        add.push({ ...rest, ref });
      }
      out.push({ ...a, add } as unknown as EditAsk);
    } else {
      out.push(a as unknown as EditAsk);
    }
  }
  return { ok: true, edits: out };
}

/**
 * The live agent's allowlist (lib/agent/tools/registry): every tool it can call, typed, with its effect. Nothing here
 * starts a render or spends a credit; the one media tool quotes, and its plan runs only on the user's Confirm.
 */
export const LIVE_TOOL_SPECS: ReadonlyArray<ToolSpec<LiveCtx>> = [
  imageQuoteTool,
  defineTool({
    name: 'web_search',
    effect: 'read',
    description: 'Search the live web for facts, trends, prices, or news. Input {query}. Returns {answer, results[]}.',
    input: z.object({ query: z.string().trim().min(1).max(400) }),
    limit: 8,
    run: async ({ query }, ctx) => {
      const r = await groundedWebSearch(query, { userId: ctx.userId, maxResults: 5 });
      return r.ok ? { answer: r.answer, results: r.results } : { error: `search unavailable (${r.code})` };
    },
  }),
  defineTool({
    name: 'scrape_webpage',
    effect: 'read',
    description: 'Fetch one URL and return its readable text, plus `published` (YYYY-MM-DD) when the page states its date. Input {url}. JS-heavy/anti-bot sites may fail — prefer web_search for those.',
    input: scrapeWebpageInput,
    limit: 8,
    run: async (input) => scrapeWebpage(input),
  }),
  defineTool({
    name: 'prepare_instagram_post',
    effect: 'prepare',
    description: 'PREPARE ONLY — assemble a caption + hashtags + media reference for the user to post themselves. Input {caption, hashtags?, mediaUrl?}. NEVER publishes.',
    input: prepareInstagramPostInput,
    limit: 4,
    run: async (input) => prepareInstagramPost(input),
  }),
  // quote_montage_to_music: plan and price only, from the request's own files (see MEDIA in the header). The model
  // gives the shape (aspect, length), never a file: the files are the ones attached to this request.
  defineTool({
    name: 'quote_montage_to_music',
    effect: 'quote',
    confirms: 'montage_run',
    description:
      "PLAN ONLY — cut the video clips the user attached to the music track they attached, on the beat. Input {aspect?: '9:16'|'16:9'|'1:1', targetSec?}. " +
      'Uses only the files attached to this request. Returns the plan (shots, length, bpm, format, unused files) and its price in credits; renders nothing until the user confirms.',
    input: z.object({ aspect: z.enum(['9:16', '16:9', '1:1']).optional(), targetSec: num(z.number().positive().max(MAX_TOTAL_SEC)).optional() }),
    offered: (ctx) => montageToolOn(ctx),
    limit: MAX_QUOTES_PER_RUN,
    run: async ({ aspect, targetSec }, ctx) => {
      // Loaded on use: ffmpeg and the storage client stay off the path of every request that has no files.
      const [{ quoteMontage }, { liveMontageDeps }] = await Promise.all([
        import('@/lib/agent/media/montageExec'),
        import('@/lib/agent/media/montageLive'),
      ]);
      const r = await quoteMontage(liveMontageDeps(), { userId: ctx.userId, files: ctx.files, prompt: ctx.goal, aspect, targetSec });
      if (!r.ok) return { error: r.error, message: r.message, ...(r.files ? { files: r.files.map((f) => f + 1) } : {}) };
      ctx.onMediaQuote?.(r);
      const q = r.quote;
      // The model gets the plan, never the token or the signed links: those go to the user's confirm card only.
      return {
        planned: true,
        rendered: false,
        credits: q.credits,
        shots: q.shots,
        clips: q.clips,
        lengthSec: q.totalSec,
        aspect: q.aspect,
        beatSynced: q.beatSynced,
        bpm: q.bpm,
        unusedFiles: q.unusedFiles.map((f) => f + 1),
        next: 'The user confirms the plan on its card; nothing starts before that.',
      };
    },
  }),
  // quote_audio_from_link: plan only, from a link the user sent (see MEDIA in the header). A platform refusal names the
  // platform so the agent can offer the upload instead; the plan's token never reaches the model.
  defineTool({
    name: 'quote_audio_from_link',
    effect: 'quote',
    confirms: 'audio_extract_run',
    description:
      'PLAN ONLY — take the sound out of a video or audio file at a public link, as an MP3 (192 kbps). Input {url}. ' +
      'Checks that the link is a direct media file (video platforms are refused), its rights and size; returns the plan. Downloads nothing until the user presses Start; free.',
    input: z.object({ url: z.string().trim().min(8).max(2048) }),
    offered: (ctx) => audioToolOn(ctx),
    limit: MAX_AUDIO_QUOTES_PER_RUN,
    run: async ({ url }, ctx) => {
      // Loaded on use: the storage client and the source checks stay off the path of every other request.
      const [{ quoteAudioExtract }, { liveAudioDeps }] = await Promise.all([
        import('@/lib/agent/media/audioExtract'),
        import('@/lib/agent/media/audioLive'),
      ]);
      const r = await quoteAudioExtract(liveAudioDeps(), { userId: ctx.userId, url });
      if (!r.ok) {
        return {
          error: r.error,
          message: r.message,
          ...(r.platform ? { platform: r.platform, offer: 'Ask the user to upload their own or a licensed copy of the file in the MyAvatar chat.' } : {}),
        };
      }
      ctx.onAudioQuote?.(r);
      const q = r.quote;
      return {
        planned: true,
        extracted: false,
        credits: q.credits,
        host: q.host,
        name: q.name,
        bytes: q.bytes,
        rights: q.rights.status === 'licensed' ? `licensed (${q.rights.license ?? 'licence named by the source'})` : q.rights.status,
        format: `MP3 ${q.bitrateKbps} kbps`,
        maxMinutes: Math.round(q.maxSec / 60),
        next: q.rights.status === 'unverified'
          ? 'The rights could not be checked: pressing Start is the user saying the file is theirs or licensed to them. Nothing starts before that.'
          : 'The user presses Start on the plan; nothing starts before that.',
      };
    },
  }),
  // quote_media_edit: plan only, on one of the request's own files (see MEDIA in the header). The model names the file
  // by its number and the edits by their typed fields; the plan's token never reaches the model.
  defineTool({
    name: 'quote_media_edit',
    effect: 'quote',
    confirms: 'media_edit_run',
    description:
      'PLAN ONLY — edit one video or picture the user attached. Input {file?: number (1 = the first attached file), edits: [{op, ...}]}, ops: ' +
      "trim {fromSec?, toSec?} or {lastSec} or {cutEndSec}; speed {factor 0.25-4}; aspect {to: '9:16'|'16:9'|'1:1'|'4:5', fit?: 'crop'|'pad'}; " +
      "grade {style: 'vintage'|'cinematic'|'neon'|'noir'|'dramatic'}; fade {inSec?, outSec?}; volume {db}; mute; overlay {look?: 'light-leak'|'grain'} (video only); thumbnail {atSec?} (a still JPEG); " +
      "layers {add?: [{kind: 'text', text, role?: 'title'|'cta'|'price'|'lower-third'|'label', anchor?, style?: 'minimal'|'premium'|'bold'|'brand'|'cinematic', motionIn?, fromSec?, toSec?, lastSec?, beforeLastSec?} " +
      "| {kind: 'image', picture: number (the attached logo), anchor?, size?} | {kind: 'mask', mode: 'blur'|'mosaic', anchor?}], " +
      "change?: [{target?: {kind?, where?, all?}, moveH?, moveV?, anchor?, sizeBy?, style?, motionIn?, text?}], remove?: [{kind?, where?, all?}]} (change and remove: only on Agent G's own last edit); " +
      "captions {track?: {lang, cues: [{startSec, endSec, text}]}, deliver?: 'burned'|'both'|'file', off?: true}; " +
      "erase {boxes: [{at: anchor, fromSec?, toSec?, firstSec?, lastSec?}]} (a text, logo, watermark or subtitles IN the picture itself that stay in one place, filled in from around it; never a person, an object or the background). " +
      'Returns the resolved plan (range kept, frame, length, layers); edits nothing until the user presses Start; free.',
    input: z.object({ file: num(z.number().int().min(1).max(13)).optional(), edits: z.array(editAsk).min(1).max(9) }),
    offered: (ctx) => editToolOn(ctx),
    limit: MAX_EDIT_QUOTES_PER_RUN,
    run: async ({ file, edits }, ctx) => {
      const ref = ctx.files?.[(file ?? 1) - 1];
      if (!ref) return { error: 'bad_input', message: `There is no attached file ${file ?? 1}.` };
      const asks = editsForQuote(edits as ReadonlyArray<Record<string, unknown>>, ctx.files ?? []);
      if (!asks.ok) return { error: 'bad_input', message: asks.message };
      // Loaded on use: ffmpeg and the storage client stay off the path of every request that has no files.
      const [{ quoteEdit }, { liveEditDeps }] = await Promise.all([
        import('@/lib/agent/media/editExec'),
        import('@/lib/agent/media/editLive'),
      ]);
      const r = await quoteEdit(liveEditDeps(), { userId: ctx.userId, file: ref, edits: asks.edits });
      if (!r.ok) return { error: r.error, message: r.message };
      ctx.onEditQuote?.(r);
      const q = r.quote;
      return {
        planned: true,
        edited: false,
        credits: q.credits,
        edits: q.edits,
        output: q.plan.output,
        lengthSec: q.plan.durationSec,
        frame: `${q.plan.width}x${q.plan.height}`,
        sound: q.plan.hasAudio,
        next: 'The user presses Start on the plan; nothing starts before that.',
      };
    },
  }),
  // analyze_media: describe one attached file (or a public YouTube video) with Gemini, by reference. The model names the
  // file by its number, never a path; the answer is a description and starts nothing.
  defineTool({
    name: 'analyze_media',
    effect: 'inspect',
    description:
      "READ ONLY — what is in one file the user attached, or in a public YouTube video. Input {file?: number (1 = the first attached file), youtube?: url, focus?: 'overview'|'scenes'|'moments'|'transcript'|'question', question?}. " +
      'Returns {summary, scenes[{startSec,endSec,description}], moments[{atSec,why}], transcript[{startSec,speaker,text}], speakers, objects, answer}. Changes nothing; free for the user.',
    input: z.object({
      file: num(z.number().int().min(1).max(13)).optional(),
      youtube: z.string().trim().url().max(300).optional(),
      focus: z.enum(['overview', 'scenes', 'moments', 'transcript', 'question']).optional(),
      question: z.string().trim().min(1).max(500).optional(),
    }),
    offered: (ctx) => analyzeToolOn(ctx),
    limit: MAX_ANALYSES_PER_RUN,
    run: async ({ file, youtube, focus, question }, ctx) => {
      if (youtube && file) return { error: 'bad_input', message: 'Name one file or one YouTube link, not both.' };
      let source: { kind: 'file'; ref: string } | { kind: 'youtube'; url: string };
      if (youtube) source = { kind: 'youtube', url: youtube };
      else {
        const ref = ctx.files?.[(file ?? 1) - 1];
        if (!ref) return { error: 'bad_input', message: `There is no attached file ${file ?? 1}.` };
        source = { kind: 'file', ref };
      }
      // Loaded on use: ffprobe and the model transport stay off the path of every request that does not analyse.
      const [{ analyzeMedia }, { liveAnalyzeDeps }, { checkRateLimitByKey, RATE_LIMITS }] = await Promise.all([
        import('@/lib/agent/media/analyzeExec'),
        import('@/lib/agent/media/analyzeLive'),
        import('@/lib/api/rate-limit'),
      ]);
      // The same per-account daily ceiling as POST /api/agent/media/analyze: a read is booked against the AI budget, not
      // the user's credits, so two per run must not become unbounded across runs.
      if (await checkRateLimitByKey(ctx.userId, RATE_LIMITS.ANALYZE_USER)) {
        return { error: 'daily_limit', message: 'The daily limit for file analysis is reached; try again tomorrow.' };
      }
      const r = await analyzeMedia(liveAnalyzeDeps(), {
        userId: ctx.userId, source, ...(focus ? { focus } : {}), ...(question ? { question } : {}), lang: langOfGoal(ctx.goal),
      });
      if (!r.ok) return { error: r.error, message: r.message };
      return { ...r.analysis, lengthSec: r.source.durationSec, type: r.source.type };
    },
  }),
];

/** The user's language for the analysis' words, from the script of their goal (ka · ru · en). */
function langOfGoal(goal: string): 'ka' | 'en' | 'ru' {
  const ka = (goal.match(/[ა-ჿ]/g) ?? []).length;
  const ru = (goal.match(/[Ѐ-ӿ]/g) ?? []).length;
  const en = (goal.match(/[A-Za-z]/g) ?? []).length;
  if (ka >= ru && ka >= en && ka > 0) return 'ka';
  return ru > en ? 'ru' : 'en';
}

/** Build the real tool registry for one authenticated request. */
export function buildLiveToolRegistry(ctx: AgentContext, opts?: { goal?: string }): AgentTool[] {
  return bindTools(LIVE_TOOL_SPECS, { ...ctx, goal: opts?.goal ?? '' });
}

/** A run's result plus what it used (server-side: the route does not send it to the browser). */
export interface LiveAgentResult extends ReActResult {
  metrics: AgentRunMetrics;
}

/**
 * Run the autonomous agent against a user goal with live infrastructure. Every run logs `agent_run_metrics` (tokens,
 * context-cache hits, model and tool time, estimated provider cost; no user id, no text) — the per-task baseline of
 * Agent G PART 5 (G3/G7), queryable in the deployment's logs.
 */
export async function runLiveAgent(
  userGoal: string,
  ctx: AgentContext,
  opts?: { maxSteps?: number; systemExtra?: string; deadlineMs?: number },
): Promise<LiveAgentResult> {
  const meter = newRunMeter();
  const mediaNote = montageToolOn(ctx) ? AGENT_MONTAGE_NOTE : AGENT_MEDIA_NOTE;
  const systemExtra = [
    mediaNote, audioToolOn(ctx) ? AGENT_AUDIO_NOTE : '', editToolOn(ctx) ? AGENT_EDIT_NOTE : '',
    analyzeToolOn(ctx) ? AGENT_ANALYZE_NOTE : '', opts?.systemExtra?.trim(),
  ].filter(Boolean).join('\n\n');
  const result = await runReActLoop({
    llm: llmAdapterFor(meter, opts?.deadlineMs, opts?.deadlineMs !== undefined && opts.deadlineMs - Date.now() <= QUICK_RUN_MS),
    tools: timed(buildLiveToolRegistry(ctx, { goal: userGoal }), meter),
    userGoal,
    maxSteps: opts?.maxSteps,
    systemExtra,
    deadlineMs: opts?.deadlineMs,
  });
  const metrics = meter.finish();
  try {
    structuredLog('info', 'agent_run_metrics', {
      stopReason: result.stopReason, steps: result.steps.length,
      tools: result.steps.filter((st) => st.tool).map((st) => st.tool), ...metrics,
    });
  } catch { /* a log line never breaks a run */ }
  return { ...result, metrics };
}
