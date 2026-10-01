/**
 * lib/voice/geminiLive.ts — browser-direct client for the Gemini Multimodal Live API
 * (BidiGenerateContent over WebSocket). Streams 16 kHz PCM mic audio + JPEG video frames up, and
 * receives 24 kHz PCM audio (+ transcripts, tool calls, session-management notices) down, with barge-in.
 *
 * ARCHITECTURE NOTE: a persistent WS relay CANNOT live in a Vercel serverless route (the function
 * ends with its response). So the browser connects DIRECTLY to Google using a short-lived EPHEMERAL
 * token minted server-side by /api/voice/live (never the raw API key in the client). This module is
 * the client half; the wire-format builders/parsers below are pure + unit-tested, and GeminiLiveSession
 * wraps them around a real WebSocket + the caller's audio/video capture.
 *
 * Two generations of wire helpers live side by side:
 *   • LEGACY (verified live 2026-07-24, used by GeminiLiveConversation today): buildSetupMessage,
 *     buildAudioMessage / buildVideoMessage (realtimeInput.mediaChunks), parseLiveServerEvents.
 *   • PARITY (2026-09-30): buildLiveSetup (transcription, resumption, compression, tools),
 *     buildRealtime* (realtimeInput.audio / .video / .text), buildToolResponse and parseLiveServerMessage
 *     (every server message kind). Behaviour changes stay opt-in: nothing a legacy caller does is altered.
 *
 * ── PROTOCOL NOTES (read from the official docs on 2026-09-30) ─────────────────────────────────────
 * Sources (fetched 2026-09-30): ai.google.dev/api/live (WebSockets API reference, "Last updated 2026-09-04"),
 * ai.google.dev/gemini-api/docs/live-api/capabilities ("Last updated 2026-09-18"), …/live-api/session-management
 * ("Last updated 2026-09-15"), plus the tools + ephemeral-tokens guides. Field names are the proto3 JSON
 * (camelCase) spellings.
 *
 * Client → server: every frame carries EXACTLY ONE of `setup` | `clientContent` | `realtimeInput` |
 * `toolResponse`. Clients should wait for `setupComplete` before sending anything after `setup`.
 *   setup (BidiGenerateContentSetup): model ("models/{model}"), generationConfig {responseModalities,
 *     temperature, topP, topK, maxOutputTokens, speechConfig, mediaResolution, thinkingConfig, …},
 *     systemInstruction (Content; text parts only), tools[], realtimeInputConfig, sessionResumption,
 *     contextWindowCompression, inputAudioTranscription, outputAudioTranscription, proactivity, historyConfig.
 *   - speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName — any TTS voice works on native audio.
 *   - ⚠️ speechConfig.languageCode: the capabilities guide says native-audio models "automatically choose
 *     the appropriate language and don't support explicitly setting the language code". Every allowlisted
 *     Live model is native audio, so buildLiveSetup NEVER emits it; the documented language hint is
 *     AudioTranscriptionConfig.languageCodes[] (BCP-47 hints for the input transcription).
 *   - inputAudioTranscription / outputAudioTranscription: AudioTranscriptionConfig {languageCodes[],
 *     customVocabulary[], wordTimestamp, diarization, mode: VERBATIM|SMART}; `{}` enables with defaults.
 *   - sessionResumption: SessionResumptionConfig {handle?, transparent?}. Present ⇒ the server sends
 *     sessionResumptionUpdate {newHandle, resumable}. Handles stay valid 2 h after the session ends.
 *   - contextWindowCompression: {slidingWindow: {targetTokens?}, triggerTokens?}; `{slidingWindow:{}}` =
 *     defaults (trigger at 80% of the window). Without it: audio-only sessions die at 15 min, audio+video at
 *     2 min. The CONNECTION itself is reset after ~10 min regardless (goAway first) → resume with the handle.
 *   - realtimeInputConfig: {automaticActivityDetection {disabled, startOfSpeechSensitivity,
 *     endOfSpeechSensitivity, prefixPaddingMs, silenceDurationMs}, activityHandling
 *     (START_OF_ACTIVITY_INTERRUPTS = default barge-in | NO_INTERRUPTION), turnCoverage}. The defaults are
 *     what a voice call wants (server VAD + barge-in), so it is not emitted.
 *   - tools: [{googleSearch: {}}] and/or [{functionDeclarations: [...]}]. The UI-action declarations (voice-to-action:
 *     prepare a studio, show code, end the call) live in lib/voice/liveTools.ts and ride in as LiveTool 'live_actions'.
 *   - thinking: 2.5 native-audio honours thinkingConfig.thinkingBudget (0 verified live, ~40% faster first
 *     audio). gemini-3.8-live does NOT support thinkingLevel ("omit from setup"); 3.1-flash-live defaults to
 *     `minimal`. So thinkingConfig is sent to the 2.5 family only.
 * realtimeInput (BidiGenerateContentRealtimeInput): audio | video | text | activityStart | activityEnd |
 *   audioStreamEnd | mediaResolution. ⚠️ `mediaChunks[]` is documented DEPRECATED ("Use one of audio, video,
 *   or text instead"; only the first chunk is read). Today's verified-live path still uses mediaChunks, so it
 *   stays the session default; the documented `audio` form is opt-in (GeminiLiveConfig.realtimeInputFormat).
 *   Never send both in one frame — the fields are independent streams, so the audio would be ingested twice.
 *   Audio in: raw 16-bit little-endian PCM, mimeType "audio/pcm;rate=16000" (any rate is resampled).
 *   Audio out: always 24 kHz PCM. Video: JPEG/PNG frames, max 1 fps.
 * toolResponse: {functionResponses: [{id, name, response}]} matched to toolCall ids.
 *
 * Server → client (BidiGenerateContentServerMessage): an optional top-level `usageMetadata` PLUS exactly
 * one of setupComplete | serverContent | toolCall | toolCallCancellation | goAway | sessionResumptionUpdate.
 *   serverContent: modelTurn {parts[] (inlineData audio)}, turnComplete, interrupted, generationComplete,
 *     groundingMetadata, inputTranscription, interimInputTranscription, outputTranscription,
 *     urlContextMetadata, waitingForInput, interactionStatus. Transcription = {text, languageCode}
 *     (+ `finished` on the Vertex reference — honoured when present).
 *   toolCall {functionCalls: [{id, name, args}]}; toolCallCancellation {ids[]} (the user barged in before the call's
 *     response mattered — drop whatever UI those ids produced);
 *   goAway {timeLeft: google.protobuf.Duration → JSON string like "9.5s"};
 *   sessionResumptionUpdate {newHandle, resumable}; usageMetadata {promptTokenCount, responseTokenCount,
 *     totalTokenCount, …TokensDetails[]}.
 *
 * ── WHERE THE REPO DELIBERATELY DIFFERS FROM THE DOCS (verified live, keep) ──────────────────────────
 *   • Ephemeral tokens: docs say tokens work on v1beta; this repo's token only handshakes on
 *     v1alpha …BidiGenerateContentConstrained (see buildLiveUrl), and the mint's lock field is
 *     `bidiGenerateContentSetup` (docs' `liveConnectConstraints` was rejected with HTTP 400).
 *   • Docs (AuthToken.fieldMask) say a token carrying bidiGenerateContentSetup with an empty fieldMask
 *     IGNORES the client's setup. Verified live: the client-sent voice + systemInstruction ARE honoured with
 *     today's {model}-only lock. UNCERTAIN whether new client-side fields (transcription, resumption, tools)
 *     are honoured the same way — verify with a funded key before relying on them.
 *   • Docs: a `uses: 1` token may be re-used to RESUME the same session ("Resuming a Live API session does
 *     not count as a use"). UNCERTAIN whether a resume after the mint's newSessionExpireTime (2 min) is
 *     accepted; if not, the resume path needs a fresh mint.
 *
 * STATUS: feature-flagged (NEXT_PUBLIC_GEMINI_LIVE_ENABLED / GEMINI_LIVE_ENABLED kill switches).
 */

import { LIVE_FUNCTION_DECLARATIONS, type LiveFunctionDeclaration } from './liveTools';

// Native-audio Live model: Gemini generates expressive voice audio DIRECTLY over the WS (no external
// TTS). Verified live (2026-07-24) with the project's key: ephemeral-token mint + v1alpha Constrained
// handshake + 24 kHz PCM audio out + prebuilt-voice + dated systemInstruction all honored. The earlier
// 'gemini-2.0-flash-live-001' was RETIRED by Google (absent from the key's model list → handshake would
// fail), so this native-audio model is the current default. The Live model ALLOWLIST lives in
// lib/ai/google/models.ts (bare ids; resolveLiveModel) — this constant is the same model in the
// `models/`-prefixed resource form the wire was verified with.
export const DEFAULT_LIVE_MODEL = 'models/gemini-2.5-flash-native-audio-latest';

// Built-in Google prebuilt voices for native audio (both verified live on the native-audio model). The
// female/male split mirrors the app's existing KaGender voice convention; passed via GeminiLiveConfig.voiceName.
export const GEMINI_LIVE_VOICES: Record<'female' | 'male', string> = { female: 'Aoede', male: 'Charon' };

// The Live WS host; the API VERSION + METHOD are chosen per-credential in buildLiveUrl, because they
// are NOT interchangeable:
//   • an EPHEMERAL token is honored ONLY by v1alpha + BidiGenerateContentConstrained (the token carries
//     the server-locked bidiGenerateContentSetup minted by /api/voice/live), and
//   • a raw API key uses v1beta + BidiGenerateContent (unconstrained).
// Putting a token on the v1beta/BidiGenerateContent endpoint fails the handshake (that path is api-key
// only) — matches Google's official gemini-live-ephemeral-tokens example.
const LIVE_WS_HOST = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage';
const TOKEN_METHOD = '.v1alpha.GenerativeService.BidiGenerateContentConstrained';
const KEY_METHOD = '.v1beta.GenerativeService.BidiGenerateContent';

/** Mic input format the Live API expects (16-bit LE PCM @ 16 kHz). */
export const LIVE_INPUT_AUDIO_MIME = 'audio/pcm;rate=16000';

export type LiveModality = 'AUDIO' | 'TEXT';

export interface GeminiLiveConfig {
  /** Ephemeral access token from /api/voice/live (preferred — never ship the raw API key to the client). */
  token?: string;
  /** Raw API key — dev/local only; exposes the key in the browser, so guard its use. */
  apiKey?: string;
  model?: string;
  systemInstruction?: string;
  responseModalities?: LiveModality[];
  /** Prebuilt Google voice for native audio output (e.g. 'Aoede' female / 'Charon' male). Emitted as
   *  generationConfig.speechConfig; omit to use the model's default voice. See GEMINI_LIVE_VOICES. */
  voiceName?: string;
  /** LEGACY BCP-47 hint, emitted as speechConfig.languageCode alongside a voiceName (buildSetupMessage only).
   *  ⚠️ The 2026-09 docs say native-audio models do not support an explicit language code — prefer
   *  buildLiveSetup({languageCode}), which routes it to the input-transcription hint instead. */
  languageCode?: string;
  /** Override the WS base (tests / future version bumps). */
  wsBase?: string;
  /**
   * A complete first frame to send instead of buildSetupMessage(config) — e.g. buildLiveSetup(...) or a setup
   * the server built. A bare BidiGenerateContentSetup (no `setup` key) is wrapped as `{ setup }`.
   * When set, model/systemInstruction/voiceName/languageCode/responseModalities above are ignored for the setup.
   */
  setupMessage?: object;
  /**
   * How mic/camera frames are framed on the wire. 'mediaChunks' (default) is today's verified-live path;
   * 'realtime' uses the documented realtimeInput.audio / .video fields (mediaChunks is deprecated upstream).
   * Flip to 'realtime' only after a live check.
   */
  realtimeInputFormat?: 'mediaChunks' | 'realtime';
  /** If set, a socket that has not produced `setupComplete` this many ms after opening is failed via onError
   *  + closed (so a hung handshake surfaces a retry instead of "connecting…" forever). Off by default. */
  setupTimeoutMs?: number;
}

export interface GeminiLiveCallbacks {
  onOpen?: () => void;
  onSetupComplete?: () => void;
  /** A 24 kHz int16 PCM chunk (base64) — the caller decodes + plays it. */
  onAudio?: (pcm24kBase64: string) => void;
  onText?: (text: string) => void;
  /** Server detected user barge-in — flush local playback immediately. */
  onInterrupted?: () => void;
  onTurnComplete?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (message: string) => void;
  /** Every parsed server event in the parity shape (transcripts, goAway, resumption, toolCall, usage, …).
   *  Fires in addition to the legacy callbacks above, after them, for the same message. */
  onEvent?: (event: LiveServerEvent) => void;
}

// ─── Pure wire-format builders (unit-tested) ──────────────────────────────────

/** LEGACY first message: model + generationConfig + optional system instruction (verified live 2026-07-24). */
export function buildSetupMessage(config: GeminiLiveConfig): Record<string, unknown> {
  const modalities = config.responseModalities?.length ? config.responseModalities : (['AUDIO'] as LiveModality[]);
  // Disable "thinking" for the real-time voice session — the native-audio model otherwise reasons
  // silently before speaking, adding latency. Measured live: time-to-first-audio drops ~1700ms → ~1000ms
  // (≈40% snappier) with no quality loss on conversational replies. Speed matters more than deep
  // reasoning in a live call, matching the responsiveness of the official Gemini voice app.
  const generationConfig: Record<string, unknown> = { responseModalities: modalities, thinkingConfig: { thinkingBudget: 0 } };
  // Select a built-in Google voice for native-audio output. Verified live: the v1alpha Constrained
  // (ephemeral-token) WS honors this client-sent speechConfig. Omitted entirely when no voiceName is set,
  // so the existing default-path behavior + test vectors are unchanged.
  if (config.voiceName) {
    generationConfig.speechConfig = {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voiceName } },
      ...(config.languageCode ? { languageCode: config.languageCode } : {}),
    };
  }
  const setup: Record<string, unknown> = {
    model: config.model || DEFAULT_LIVE_MODEL,
    generationConfig,
  };
  if (config.systemInstruction && config.systemInstruction.trim()) {
    setup.systemInstruction = { parts: [{ text: config.systemInstruction }] };
  }
  return { setup };
}

/**
 * LEGACY mic frame: 16 kHz int16 PCM, base64, as realtimeInput.mediaChunks.
 * ⚠️ mediaChunks is DEPRECATED upstream (2026-09 reference) but is the path verified live — see buildRealtimeAudio.
 */
export function buildAudioMessage(pcm16kBase64: string): Record<string, unknown> {
  return { realtimeInput: { mediaChunks: [{ mimeType: LIVE_INPUT_AUDIO_MIME, data: pcm16kBase64 }] } };
}

/** LEGACY camera/screen frame (default JPEG), base64, as realtimeInput.mediaChunks (deprecated upstream). */
export function buildVideoMessage(frameBase64: string, mimeType = 'image/jpeg'): Record<string, unknown> {
  return { realtimeInput: { mediaChunks: [{ mimeType, data: frameBase64 }] } };
}

// ─── Parity setup builder ────────────────────────────────────────────────────

/** 'google_search' = Google Search grounding; 'live_actions' = the UI-action declarations (lib/voice/liveTools.ts). */
export type LiveTool = 'google_search' | 'live_actions';

/** One entry of setup.tools. */
export type LiveToolBlock =
  | { googleSearch: Record<string, never> }
  | { functionDeclarations: readonly LiveFunctionDeclaration[] };

export interface BuildLiveSetupOptions {
  /** Live model id, bare or `models/`-prefixed. Allowlist it first (lib/ai/google/models.ts resolveLiveModel);
   *  a malformed or retired id falls back to DEFAULT_LIVE_MODEL here. */
  model: string;
  systemInstruction: string;
  /** Prebuilt voice (Aoede / Charon verified in Georgian). A malformed name falls back to Aoede. */
  voiceName: string;
  /** BCP-47 (e.g. 'ka-GE'). Sent ONLY as inputAudioTranscription.languageCodes (needs transcribe:true) —
   *  never as speechConfig.languageCode, which native-audio models do not support (see header). */
  languageCode?: string;
  /** 0..2; omitted when not a finite number. */
  temperature?: number;
  /** undefined → no sessionResumption field (no resumption updates, today's wire);
   *  null or '' → `sessionResumption: {}` (enable, new session);
   *  a handle from a previous `resumption` event → `{ handle }` (resume that session). */
  resumptionHandle?: string | null;
  /** Enable input + output audio transcription (captions and the chat-thread transcript). */
  transcribe?: boolean;
  /** Enable sliding-window context compression (lifts the 15-min audio / 2-min audio+video session cap). */
  compression?: boolean;
  tools?: Array<LiveTool>;
}

/** The BidiGenerateContentSetup payload (the value under `setup`, and the shape of the mint's
 *  `bidiGenerateContentSetup`). Only the fields this module emits are typed. */
export interface LiveSetup {
  model: string;
  generationConfig: {
    responseModalities: LiveModality[];
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } };
    temperature?: number;
    thinkingConfig?: { thinkingBudget: number };
  };
  systemInstruction?: { parts: Array<{ text: string }> };
  inputAudioTranscription?: { languageCodes?: string[] };
  outputAudioTranscription?: Record<string, never>;
  sessionResumption?: { handle?: string };
  contextWindowCompression?: { slidingWindow: Record<string, never> };
  tools?: LiveToolBlock[];
}

/** The complete first client frame. */
export interface LiveSetupMessage { setup: LiveSetup }

/** A bare model id (same grammar as lib/ai/google/models.ts), optionally `models/`-prefixed. */
const LIVE_MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
/** Retired families answer 404 (mirrors models.ts isRetiredModel; kept local so this browser module has
 *  no dependency on a server-policy file). */
const RETIRED_LIVE_RE = /^gemini-(?:1\.0|1\.5|2\.0)(?:-|$)/i;
/** Prebuilt voice names are single words (Aoede, Charon, Kore, Puck, Zephyr, …); case is normalised. */
const VOICE_NAME_RE = /^[A-Za-z]{2,32}$/;
/** BCP-47-ish: 'ka', 'ka-GE', 'zh-Hans', 'pt-BR'. */
const BCP47_RE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/;
/** Resumption handles are opaque server tokens: printable ASCII, no whitespace, bounded. */
const RESUMPTION_HANDLE_RE = /^[\x21-\x7E]{1,4096}$/;

/**
 * `gemini-x` / `models/gemini-x` → `models/gemini-x`; malformed or retired → DEFAULT_LIVE_MODEL.
 * The Live wire (setup.model and the mint's bidiGenerateContentSetup.model) was verified with the prefixed form.
 */
export function toLiveModelResource(id: unknown): string {
  if (typeof id !== 'string') return DEFAULT_LIVE_MODEL;
  const bare = id.trim().replace(/^models\//i, '');
  if (!LIVE_MODEL_ID_RE.test(bare) || RETIRED_LIVE_RE.test(bare)) return DEFAULT_LIVE_MODEL;
  return `models/${bare}`;
}

/** The 2.5 native-audio family takes thinkingBudget:0 (verified live); 3.x Live models must not get it. */
function takesThinkingBudget(modelResource: string): boolean {
  return /^models\/gemini-2\.5-/i.test(modelResource);
}

/**
 * Build the parity first frame `{ setup: BidiGenerateContentSetup }`. Pure and JSON-safe.
 * Use `.setup` when the server needs the bare payload (e.g. the mint's bidiGenerateContentSetup).
 * Only fields the caller opts into are emitted, so `{model, systemInstruction, voiceName}` alone produces
 * the same wire the legacy builder verified live (minus the unsupported speechConfig.languageCode).
 */
export function buildLiveSetup(opts: BuildLiveSetupOptions): LiveSetupMessage {
  const model = toLiveModelResource(opts?.model);
  const rawVoice = typeof opts?.voiceName === 'string' ? opts.voiceName.trim() : '';
  // 'charon' → 'Charon' (a case slip must not silently swap the gender to the Aoede fallback).
  const voiceName = VOICE_NAME_RE.test(rawVoice)
    ? rawVoice.charAt(0).toUpperCase() + rawVoice.slice(1).toLowerCase()
    : GEMINI_LIVE_VOICES.female;

  const generationConfig: LiveSetup['generationConfig'] = {
    // Native-audio models only support the AUDIO response modality; the answer's text arrives as
    // outputTranscription when transcribe is on.
    responseModalities: ['AUDIO'],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
  };
  if (typeof opts?.temperature === 'number' && Number.isFinite(opts.temperature)) {
    generationConfig.temperature = Math.min(2, Math.max(0, opts.temperature));
  }
  // ⚠️ thinkingBudget:0 is load-bearing on 2.5 native audio (~1.7s → ~1.0s to first audio, verified live),
  // but gemini-3.8-live rejects thinking config ("omit from setup") and 3.1-flash-live already defaults to
  // minimal thinking — so it is sent to the 2.5 family only.
  if (takesThinkingBudget(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const setup: LiveSetup = { model, generationConfig };

  const instruction = typeof opts?.systemInstruction === 'string' ? opts.systemInstruction : '';
  if (instruction.trim()) setup.systemInstruction = { parts: [{ text: instruction }] };

  if (opts?.transcribe === true) {
    const lang = typeof opts.languageCode === 'string' ? opts.languageCode.trim() : '';
    // UNCERTAIN (2026-09-30): languageCodes is in the API reference but not yet exercised live on the
    // v1alpha Constrained endpoint. It is only a HINT; omit languageCode to fall back to auto-detect.
    setup.inputAudioTranscription = BCP47_RE.test(lang) ? { languageCodes: [lang] } : {};
    setup.outputAudioTranscription = {};
  }

  if (opts?.resumptionHandle !== undefined) {
    const handle = typeof opts.resumptionHandle === 'string' ? opts.resumptionHandle.trim() : '';
    // A malformed handle can't resume anything — start a fresh (still resumable) session instead of
    // letting a garbage value fail the whole handshake.
    setup.sessionResumption = RESUMPTION_HANDLE_RE.test(handle) ? { handle } : {};
  }

  if (opts?.compression === true) setup.contextWindowCompression = { slidingWindow: {} };

  if (Array.isArray(opts?.tools)) {
    // ⚠️ Declarations FIRST, search second — the order the actions brief locked and the route tests pin. Each block
    // is emitted once however often the caller lists it; unknown names are ignored (never forwarded to Google).
    const tools: LiveToolBlock[] = [];
    if (opts.tools.includes('live_actions')) tools.push({ functionDeclarations: LIVE_FUNCTION_DECLARATIONS });
    if (opts.tools.includes('google_search')) tools.push({ googleSearch: {} });
    if (tools.length) setup.tools = tools;
  }

  return { setup };
}

// ─── Parity realtime / tool builders (documented `realtimeInput` fields) ─────────

/** Mic frame on the documented `realtimeInput.audio` stream (replaces deprecated mediaChunks). */
export function buildRealtimeAudio(pcmBase64: string, mimeType: string = LIVE_INPUT_AUDIO_MIME): { realtimeInput: { audio: { mimeType: string; data: string } } } {
  return { realtimeInput: { audio: { mimeType, data: pcmBase64 } } };
}

/** Camera/screen frame on `realtimeInput.video` (JPEG/PNG, ≤ 1 fps per the docs). */
export function buildRealtimeVideo(frameBase64: string, mimeType = 'image/jpeg'): { realtimeInput: { video: { mimeType: string; data: string } } } {
  return { realtimeInput: { video: { mimeType, data: frameBase64 } } };
}

/** Typed text into a live call on `realtimeInput.text` (does not interrupt like clientContent would). */
export function buildRealtimeText(text: string): { realtimeInput: { text: string } } {
  return { realtimeInput: { text } };
}

/** Mic muted/closed: lets server VAD finalise the turn instead of waiting on silence. Reopen by sending audio. */
export function buildAudioStreamEnd(): { realtimeInput: { audioStreamEnd: true } } {
  return { realtimeInput: { audioStreamEnd: true } };
}

export interface LiveFunctionResponse { id: string; name: string; response: Record<string, unknown> }

/** Answer a `toolCall` — each response is matched to its call by `id`. */
export function buildToolResponse(responses: readonly LiveFunctionResponse[]): { toolResponse: { functionResponses: LiveFunctionResponse[] } } {
  const functionResponses = (Array.isArray(responses) ? responses : [])
    .filter((r) => r && typeof r.id === 'string' && typeof r.name === 'string')
    .map((r) => ({ id: r.id, name: r.name, response: r.response && typeof r.response === 'object' ? r.response : {} }));
  return { toolResponse: { functionResponses } };
}

// ─── LEGACY server-message parser (kept for GeminiLiveSession's original callbacks) ────────────

/** Event shape of the LEGACY parser (`type`-tagged). The parity union is LiveServerEvent (`kind`-tagged). */
export type LegacyLiveServerEvent =
  | { type: 'setupComplete' }
  | { type: 'audio'; data: string }
  | { type: 'text'; text: string }
  | { type: 'interrupted' }
  | { type: 'turnComplete' }
  | { type: 'unknown' };

interface ServerPart { text?: string; inlineData?: { mimeType?: string; data?: string } }
interface ServerShape {
  setupComplete?: unknown;
  serverContent?: {
    modelTurn?: { parts?: ServerPart[] };
    interrupted?: boolean;
    turnComplete?: boolean;
  };
}

/**
 * Normalise one parsed server JSON object into a flat list of events (a single message can carry both
 * an audio part and a turnComplete). Never throws — an unrecognised shape yields [{type:'unknown'}].
 */
export function parseLiveServerEvents(raw: unknown): LegacyLiveServerEvent[] {
  if (!raw || typeof raw !== 'object') return [{ type: 'unknown' }];
  const msg = raw as ServerShape;
  const events: LegacyLiveServerEvent[] = [];
  if ('setupComplete' in msg && msg.setupComplete !== undefined) events.push({ type: 'setupComplete' });

  const sc = msg.serverContent;
  if (sc) {
    if (sc.interrupted) events.push({ type: 'interrupted' });
    const parts = sc.modelTurn?.parts;
    if (Array.isArray(parts)) {
      for (const p of parts) {
        if (p?.inlineData?.data && (p.inlineData.mimeType || '').includes('audio')) {
          events.push({ type: 'audio', data: p.inlineData.data });
        } else if (typeof p?.text === 'string' && p.text.length > 0) {
          events.push({ type: 'text', text: p.text });
        }
      }
    }
    if (sc.turnComplete) events.push({ type: 'turnComplete' });
  }
  return events.length > 0 ? events : [{ type: 'unknown' }];
}

// ─── Parity server-message parser ────────────────────────────────────────────

export type LiveServerEvent =
  | { kind: 'setupComplete' }
  | { kind: 'audio'; data: string; mimeType: string }
  | { kind: 'inputTranscript'; text: string; final?: boolean }
  | { kind: 'outputTranscript'; text: string; final?: boolean }
  | { kind: 'turnComplete' }
  | { kind: 'interrupted' }
  | { kind: 'goAway'; timeLeftMs?: number }
  | { kind: 'resumption'; handle: string; resumable: boolean }
  | { kind: 'usage'; totalTokens?: number }
  | { kind: 'toolCall'; calls: Array<{ id: string; name: string; args: unknown }> }
  | { kind: 'toolCallCancellation'; ids: string[] }
  | { kind: 'error'; message: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const nonNegInt = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined;

/** google.protobuf.Duration → ms. Canonical JSON is a string ("9s", "0.500s"); a {seconds, nanos} object is
 *  tolerated. Anything else → undefined (the caller should treat goAway as "reconnect now"). */
export function parseDurationMs(v: unknown): number | undefined {
  if (typeof v === 'string') {
    const m = /^\s*(\d{1,12}(?:\.\d{1,9})?)s\s*$/.exec(v);
    return m ? Math.round(parseFloat(m[1]!) * 1000) : undefined;
  }
  if (isObj(v)) {
    const s = typeof v.seconds === 'string' ? Number(v.seconds) : v.seconds;
    const n = v.nanos === undefined ? 0 : v.nanos;
    if (typeof s === 'number' && Number.isFinite(s) && s >= 0 && typeof n === 'number' && Number.isFinite(n) && n >= 0) {
      return Math.round(s * 1000 + n / 1e6);
    }
  }
  return undefined;
}

function transcriptOf(v: unknown): { text: string; final?: boolean } | null {
  if (!isObj(v)) return null;
  const text = typeof v.text === 'string' ? v.text : '';
  const finished = v.finished === true;
  // A bare `finished` marker (empty text) is still a useful "close this caption" signal.
  if (!text && !finished) return null;
  return finished ? { text, final: true } : { text };
}

function parseMessageObject(msg: Obj): LiveServerEvent[] {
  const events: LiveServerEvent[] = [];

  if (msg.setupComplete !== undefined && msg.setupComplete !== null) events.push({ kind: 'setupComplete' });

  const sc = msg.serverContent;
  if (isObj(sc)) {
    // Barge-in first: the consumer must flush playback before anything else in this frame.
    if (sc.interrupted === true) events.push({ kind: 'interrupted' });

    const input = transcriptOf(sc.inputTranscription);
    if (input) events.push({ kind: 'inputTranscript', ...input });
    // ⚠️ interimInputTranscription ("subject to frequent updates") is deliberately NOT surfaced: whether it
    // is a delta or a replacement is undocumented, and a consumer that appends inputTranscript text would
    // duplicate every word. Revisit after a live check.

    const modelTurn = sc.modelTurn;
    const parts = isObj(modelTurn) && Array.isArray(modelTurn.parts) ? modelTurn.parts : [];
    for (const p of parts) {
      if (!isObj(p)) continue;
      const inline = p.inlineData;
      if (isObj(inline) && typeof inline.data === 'string' && inline.data.length > 0) {
        const mimeType = typeof inline.mimeType === 'string' ? inline.mimeType : '';
        if (mimeType.toLowerCase().startsWith('audio/')) events.push({ kind: 'audio', data: inline.data, mimeType });
      }
      // ⚠️ Text parts are NOT surfaced: native-audio sessions answer in AUDIO only (the words arrive as
      // outputTranscription), and the text parts a thinking model does emit are thought summaries — a
      // reasoning trace must never become a caption or a chat-thread message.
    }

    const output = transcriptOf(sc.outputTranscription);
    if (output) events.push({ kind: 'outputTranscript', ...output });

    if (sc.turnComplete === true) events.push({ kind: 'turnComplete' });
  }

  const tc = msg.toolCall;
  if (isObj(tc) && Array.isArray(tc.functionCalls)) {
    const calls: Array<{ id: string; name: string; args: unknown }> = [];
    for (const fc of tc.functionCalls) {
      if (!isObj(fc) || typeof fc.name !== 'string' || !fc.name) continue;
      calls.push({ id: typeof fc.id === 'string' ? fc.id : '', name: fc.name, args: fc.args === undefined ? {} : fc.args });
    }
    if (calls.length) events.push({ kind: 'toolCall', calls });
  }

  const tcc = msg.toolCallCancellation;
  if (isObj(tcc) && Array.isArray(tcc.ids)) {
    // Bounded: ids only ever name calls this session made; a flood of junk must not become a flood of UI work.
    const ids = tcc.ids.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 256).slice(0, 64);
    if (ids.length) events.push({ kind: 'toolCallCancellation', ids });
  }

  if (isObj(msg.goAway)) {
    const timeLeftMs = parseDurationMs(msg.goAway.timeLeft);
    events.push(timeLeftMs === undefined ? { kind: 'goAway' } : { kind: 'goAway', timeLeftMs });
  }

  const sru = msg.sessionResumptionUpdate;
  if (isObj(sru)) {
    const raw = typeof sru.newHandle === 'string' ? sru.newHandle : '';
    const handle = RESUMPTION_HANDLE_RE.test(raw) ? raw : '';
    // proto3 JSON omits `false`; per the reference newHandle is empty whenever resumable=false, so a
    // non-empty handle with no flag means resumable.
    const resumable = handle.length > 0 && sru.resumable !== false;
    events.push({ kind: 'resumption', handle, resumable });
  }

  const um = msg.usageMetadata;
  if (isObj(um)) {
    const total = nonNegInt(um.totalTokenCount);
    const prompt = nonNegInt(um.promptTokenCount);
    const response = nonNegInt(um.responseTokenCount);
    const totalTokens = total ?? (prompt !== undefined || response !== undefined ? (prompt ?? 0) + (response ?? 0) : undefined);
    events.push(totalTokens === undefined ? { kind: 'usage' } : { kind: 'usage', totalTokens });
  }

  // Not a documented server message (the WS reports failures as close codes), but tolerate an
  // `{error:{message}}` / `{error:"…"}` frame so it can never be silently dropped.
  const err = msg.error;
  if (typeof err === 'string' && err.trim()) events.push({ kind: 'error', message: err.slice(0, 500) });
  else if (isObj(err)) {
    const m = typeof err.message === 'string' && err.message.trim() ? err.message : 'Live API error';
    events.push({ kind: 'error', message: m.slice(0, 500) });
  }

  return events;
}

/**
 * Parse ONE server frame (the JSON object, or its raw JSON string) into parity events, in the order a
 * player should apply them: setupComplete, interrupted, inputTranscript, audio…, outputTranscript,
 * turnComplete, toolCall, toolCallCancellation, goAway, resumption, usage, error. A frame can yield several (e.g.
 * audio + turnComplete + usage). Unknown kinds (generationComplete, groundingMetadata, waitingForInput, …) yield
 * nothing. Malformed input → []. Never throws.
 */
export function parseLiveServerMessage(raw: unknown): LiveServerEvent[] {
  try {
    let value: unknown = raw;
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch { return []; }
    }
    return isObj(value) ? parseMessageObject(value) : [];
  } catch {
    // Hostile shapes (throwing getters/proxies) must never break the socket's message loop.
    return [];
  }
}

/**
 * Build the authenticated WS URL. The credential dictates BOTH the query param AND the version+method:
 * ephemeral token → v1alpha/BidiGenerateContentConstrained + ?access_token; api key (dev-only) →
 * v1beta/BidiGenerateContent + ?key. `wsBase` overrides only the host (tests / future host changes).
 */
export function buildLiveUrl(config: GeminiLiveConfig): string {
  const host = config.wsBase || LIVE_WS_HOST;
  if (config.token) return `${host}${TOKEN_METHOD}?access_token=${encodeURIComponent(config.token)}`;
  if (config.apiKey) return `${host}${KEY_METHOD}?key=${encodeURIComponent(config.apiKey)}`;
  return `${host}${KEY_METHOD}`;
}

// ─── Session controller (WebSocket wrapper) ───────────────────────────────────

/** Mic frames spoken between socket-open and setupComplete are held (not dropped) up to this many chunks
 *  (≈ 5 s at the 4096-sample ScriptProcessor cadence); older ones are discarded first. */
const PRE_SETUP_AUDIO_CAP = 64;

export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private ready = false;
  private closed = false;
  private pendingAudio: string[] = [];
  private setupTimer: ReturnType<typeof setTimeout> | null = null;
  private lastResumptionHandle: string | null = null;

  constructor(private config: GeminiLiveConfig, private cb: GeminiLiveCallbacks = {}) {}

  get isReady(): boolean { return this.ready; }

  /** The latest RESUMABLE handle from sessionResumptionUpdate (null until one arrives). Pass it as
   *  buildLiveSetup({resumptionHandle}) on the reconnect after a goAway / dropped socket. */
  get resumptionHandle(): string | null { return this.lastResumptionHandle; }

  connect(): void {
    if (this.ws) return;
    if (!this.config.token && !this.config.apiKey) {
      this.cb.onError?.('No Live credential (ephemeral token or API key) provided');
      return;
    }
    let socket: WebSocket;
    try {
      socket = new WebSocket(buildLiveUrl(this.config));
    } catch (e) {
      this.cb.onError?.(e instanceof Error ? e.message : 'WebSocket construct failed');
      return;
    }
    socket.binaryType = 'arraybuffer';
    this.ws = socket;
    this.closed = false;

    socket.onopen = () => {
      this.cb.onOpen?.();
      this.rawSend(this.firstFrame());
      this.armSetupTimer();
    };
    // ⚠️ A real WebSocket fires onclose a macrotask AFTER close(). If this instance is reconnected in
    // between (close() → connect(), e.g. a resume after goAway), the OLD socket's late events must not
    // touch the NEW one: its onclose would null this.ws / flip `ready`, its frames would play stale audio.
    // So each handler first checks it still belongs to the current socket (this.ws === null after a
    // client close() still lets that close report onClose, exactly as before).
    socket.onmessage = (ev: MessageEvent) => { if (this.ws === socket) void this.handleMessage(ev.data); };
    socket.onerror = () => { if (this.ws === socket) this.cb.onError?.('WebSocket error'); };
    socket.onclose = (ev: CloseEvent) => {
      if (this.ws !== null && this.ws !== socket) return;
      this.clearSetupTimer();
      this.ready = false; this.closed = true; this.ws = null; this.pendingAudio = [];
      this.cb.onClose?.(ev.code, ev.reason);
    };
  }

  private firstFrame(): object {
    const custom = this.config.setupMessage;
    if (custom && typeof custom === 'object') {
      return 'setup' in custom ? custom : { setup: custom };
    }
    return buildSetupMessage(this.config);
  }

  private armSetupTimer(): void {
    const ms = this.config.setupTimeoutMs;
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return;
    this.clearSetupTimer();
    this.setupTimer = setTimeout(() => {
      this.setupTimer = null;
      if (this.ready || !this.ws) return;
      this.cb.onError?.('Live setup timed out');
      this.close();
    }, ms);
  }

  private clearSetupTimer(): void {
    if (this.setupTimer) { clearTimeout(this.setupTimer); this.setupTimer = null; }
  }

  private async handleMessage(data: unknown): Promise<void> {
    let text: string;
    if (typeof data === 'string') text = data;
    else if (data instanceof ArrayBuffer) text = new TextDecoder().decode(data);
    else if (typeof Blob !== 'undefined' && data instanceof Blob) text = await data.text();
    else return;

    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return; }

    for (const ev of parseLiveServerEvents(parsed)) {
      switch (ev.type) {
        case 'setupComplete':
          this.ready = true;
          this.clearSetupTimer();
          this.flushPendingAudio();
          this.cb.onSetupComplete?.();
          break;
        case 'audio': this.cb.onAudio?.(ev.data); break;
        case 'text': this.cb.onText?.(ev.text); break;
        case 'interrupted': this.cb.onInterrupted?.(); break;
        case 'turnComplete': this.cb.onTurnComplete?.(); break;
        default: break;
      }
    }

    for (const ev of parseLiveServerMessage(parsed)) {
      if (ev.kind === 'resumption' && ev.resumable && ev.handle) this.lastResumptionHandle = ev.handle;
      this.cb.onEvent?.(ev);
    }
  }

  private rawSend(obj: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify(obj)); } catch (e) { this.cb.onError?.(e instanceof Error ? e.message : 'send failed'); }
    }
  }

  private audioFrame(pcm16kBase64: string): object {
    return this.config.realtimeInputFormat === 'realtime' ? buildRealtimeAudio(pcm16kBase64) : buildAudioMessage(pcm16kBase64);
  }

  private flushPendingAudio(): void {
    const queued = this.pendingAudio;
    this.pendingAudio = [];
    for (const chunk of queued) this.rawSend(this.audioFrame(chunk));
  }

  /**
   * Stream a 16 kHz PCM mic chunk (base64). Before setupComplete the chunk is HELD (bounded) and flushed
   * right after it — the docs require waiting for setupComplete, and dropping it lost the user's first words.
   */
  sendAudioChunk(pcm16kBase64: string): void {
    if (!pcm16kBase64) return;
    if (!this.ready) {
      if (!this.ws || this.closed) return;
      this.pendingAudio.push(pcm16kBase64);
      if (this.pendingAudio.length > PRE_SETUP_AUDIO_CAP) this.pendingAudio.shift();
      return;
    }
    this.rawSend(this.audioFrame(pcm16kBase64));
  }

  /** Stream one camera/screen frame (base64). Frames before setupComplete are dropped (stale by the time
   *  the session is up; the next one follows within a second). */
  sendVideoFrame(frameBase64: string, mimeType = 'image/jpeg'): void {
    if (!frameBase64 || !this.ready) return;
    this.rawSend(this.config.realtimeInputFormat === 'realtime' ? buildRealtimeVideo(frameBase64, mimeType) : buildVideoMessage(frameBase64, mimeType));
  }

  /** Typed text into the live call (realtimeInput.text). No-op before setupComplete. */
  sendText(text: string): void {
    if (!text || !this.ready) return;
    this.rawSend(buildRealtimeText(text));
  }

  /** Answer a toolCall event. No-op before setupComplete. */
  sendToolResponse(responses: readonly LiveFunctionResponse[]): void {
    if (!this.ready) return;
    const msg = buildToolResponse(responses);
    if (msg.toolResponse.functionResponses.length) this.rawSend(msg);
  }

  /** Tell the server the mic stream paused (mute) so it can finalise the turn; resume by sending audio. */
  endAudioStream(): void {
    if (!this.ready) return;
    this.rawSend(buildAudioStreamEnd());
  }

  /**
   * Local barge-in: the caller flushes its own playback queue immediately (millisecond-reactive) and
   * we keep streaming mic audio, which drives the server's own VAD to interrupt the in-flight turn.
   * (With automatic activity detection — the default — there is no client "cancel" frame; continued
   * input IS the signal. activityStart/activityEnd exist only when automatic detection is disabled.)
   */
  interrupt(): void { this.cb.onInterrupted?.(); }

  close(): void {
    this.clearSetupTimer();
    this.ready = false;
    this.closed = true;
    this.pendingAudio = [];
    const ws = this.ws;
    this.ws = null;
    if (ws) { try { ws.close(1000, 'client closed'); } catch { /* noop */ } }
  }

  get isClosed(): boolean { return this.closed; }
}
