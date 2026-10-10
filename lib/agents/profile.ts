/**
 * lib/agents/profile.ts
 * =====================
 * Agent profiles — the persona a user picked, resolved into the settings Gemini actually receives: the
 * system-instruction block, sampling, thinking, safety, Google Search grounding, and the Live voice.
 *
 * Before this module a persona was ONLY text appended to the system string; every persona ran with the same
 * 0.7 / 0.95 / 40 / 4096 / Google Search settings and no explicit safety. Now a persona can carry its own
 * generation settings, and one resolver turns it into config for chat (`toGeminiChatConfig`) and for Live
 * (`toGeminiLiveSetup`), so the two surfaces cannot drift apart.
 *
 * PURE + TOTAL, isomorphic (no I/O, no env, never throws). Every value is clamped here even when
 * lib/services/personas/personas.ts already clamped it: a custom persona arrives in a client-controlled
 * request body on every turn, and a profile can also be built by hand, so the bounds are enforced at the
 * last step before they reach Google as well.
 *
 * ⚠️ THE ORIGINAL SIX PERSONAS (AND "NO PERSONA") MUST RESOLVE TO EXACTLY TODAY'S CHAT SETTINGS. Wiring this
 * module into /api/chat/gemini is meant to change nothing for anyone already using them; the jest suite pins
 * the resolved config byte for byte.
 */

import {
  resolvePersona,
  personaSystemBlock,
  PERSONA_GENERATION_BOUNDS,
  PERSONA_SAFETY_LEVELS,
  PERSONA_THINKING_LEVELS,
  PERSONA_VOICES,
  type CustomPersonaInput,
  type Persona,
  type PersonaSafety,
  type PersonaThinking,
  type PersonaVoice,
} from '@/lib/services/personas/personas';
import { liveVoicePersona } from '@/lib/voice/voicePrompt';
// Type-only, so it is erased at build time: this module stays isomorphic even though chatStream.ts is
// `server-only`.
import type { GeminiChatConfig } from '@/lib/ai/google/chatStream';

// ─── Types ───────────────────────────────────────────────────────────────────

/** 'platform' = the BLOCK_ONLY_HIGH floor; 'strict' = BLOCK_MEDIUM_AND_ABOVE. Nothing looser exists. */
export type SafetyLevel = PersonaSafety;

/** An explicit Gemini thinking effort. */
export type ThinkingLevel = PersonaThinking;

/**
 * The profile's thinking setting.
 *
 * ⚠️ 'default' IS NOT 'off'. It means "send no thinkingConfig at all", which is what chat has always done —
 * the model then uses its own default (dynamic thinking on 2.5 Flash; 2.5 Pro cannot turn thinking off at
 * all and rejects a zero budget). Mapping the built-ins to 'off' would have silently disabled thinking for
 * every existing persona and could 400 the Pro chain, so "no opinion" needs its own value.
 */
export type ThinkingSetting = 'default' | ThinkingLevel;

export type LiveVoice = PersonaVoice;

export interface AgentProfile {
  /** 'default' when no persona is active; otherwise the persona id (built-in, or `custom:<slug>`). */
  id: string;
  /** Display name (English), when a persona is active. */
  label?: string;
  /**
   * The persona's system-instruction block, APPENDED after the platform rules ('' for the default profile).
   * Built by personaSystemBlock() — already sanitized and precedence-terminated. Trusted as produced by
   * resolveAgentProfile(); do not put raw user text here.
   */
  directive: string;
  /** The persona's tone (informational — it is already folded into `directive`). */
  tone?: string;
  temperature: number;
  /**
   * True when the PERSONA chose `temperature` (a built-in's override, or a custom persona's). False / absent = the
   * platform default above, which a Gemini 3 chat call leaves out (lib/ai/google/chatStream `samplingFor`).
   */
  personaTemperature?: boolean;
  topP: number;
  topK?: number;
  maxOutputTokens: number;
  thinking: ThinkingSetting;
  safety: SafetyLevel;
  googleSearch: boolean;
  voice: LiveVoice;
}

export interface SafetySetting {
  category: string;
  threshold: string;
}

/** The chat config this module produces — exactly what lib/ai/google/chatStream.ts consumes. */
export type ProfileChatConfig = GeminiChatConfig;

export interface ProfileLiveSetup {
  systemInstruction: string;
  temperature: number;
  voiceName: string;
}

// ─── Platform defaults ───────────────────────────────────────────────────────

export const DEFAULT_AGENT_PROFILE_ID = 'default';

/**
 * TODAY's chat settings, verbatim from the streamText call in app/api/chat/gemini/route.ts
 * (temperature 0.7, topP 0.95, topK 40, maxOutputTokens 4096, the google_search tool on, no thinkingConfig).
 * Aoede is the female voice the Live session defaults to.
 * NOTE: these are the PROFILE's values. The chat route lays each mode's output floor over maxOutputTokens (4096 cut
 * long answers short, thinking included — app/api/chat/gemini `applyChatMode`), and a Gemini 3 call leaves out the
 * default temperature / topK (lib/ai/google/chatStream `samplingFor`).
 */
export const PLATFORM_CHAT_DEFAULTS = Object.freeze({
  temperature: 0.7,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 4096,
  thinking: 'default' as ThinkingSetting,
  safety: 'platform' as SafetyLevel,
  googleSearch: true,
  voice: 'Aoede' as LiveVoice,
});

// ─── Safety ──────────────────────────────────────────────────────────────────

/** The four categories the REST client (lib/gemini/client.ts SAFETY_SETTINGS) has always configured. */
export const SAFETY_CATEGORIES = Object.freeze([
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
] as const);

/**
 * ⚠️ BLOCK_ONLY_HIGH IS THE FLOOR, NOT A DEFAULT TO BE TUNED DOWN. Georgian business and creative text —
 * ad copy, competitor talk, edgy film briefs — tripped the MEDIUM filter and came back as an empty reply
 * (lib/gemini/client.ts documents the incident), so the platform level is ONLY_HIGH; 'strict' may raise it
 * to MEDIUM for a persona that wants it. No level maps to BLOCK_NONE / OFF, so no persona can go below.
 */
const SAFETY_THRESHOLD: Readonly<Record<SafetyLevel, string>> = Object.freeze({
  platform: 'BLOCK_ONLY_HIGH',
  strict: 'BLOCK_MEDIUM_AND_ABOVE',
});

/**
 * The safetySettings for a level. A FRESH array every call, so a caller that mutates the result (e.g. to
 * add a category) can never lower the floor for the next request. Unknown levels resolve to the floor.
 */
export function safetySettingsFor(level: SafetyLevel): SafetySetting[] {
  const threshold = level === 'strict' ? SAFETY_THRESHOLD.strict : SAFETY_THRESHOLD.platform;
  return SAFETY_CATEGORIES.map((category) => ({ category, threshold }));
}

// ─── Clamping ────────────────────────────────────────────────────────────────

function clampNum(v: unknown, min: number, max: number, fallback: number, integer = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  const n = integer ? Math.round(v) : v;
  return Math.min(max, Math.max(min, n));
}

/**
 * Normalise any profile-shaped value into a valid AgentProfile: numbers clamped to
 * PERSONA_GENERATION_BOUNDS, enums checked, anything unusable replaced by the platform default. Safety can
 * only come out as 'platform' or 'strict' — a hand-built `safety: 'none'` resolves to the floor.
 */
export function clampAgentProfile(p: AgentProfile): AgentProfile {
  const B = PERSONA_GENERATION_BOUNDS;
  const D = PLATFORM_CHAT_DEFAULTS;
  const src = (p && typeof p === 'object' ? p : {}) as Partial<AgentProfile>;
  const out: AgentProfile = {
    id: typeof src.id === 'string' && src.id ? src.id : DEFAULT_AGENT_PROFILE_ID,
    ...(typeof src.label === 'string' && src.label ? { label: src.label } : {}),
    directive: typeof src.directive === 'string' ? src.directive : '',
    ...(typeof src.tone === 'string' && src.tone ? { tone: src.tone } : {}),
    temperature: clampNum(src.temperature, B.temperature.min, B.temperature.max, D.temperature),
    ...(src.personaTemperature === true ? { personaTemperature: true } : {}),
    topP: clampNum(src.topP, B.topP.min, B.topP.max, D.topP),
    ...(src.topK === undefined ? {} : { topK: clampNum(src.topK, B.topK.min, B.topK.max, D.topK, true) }),
    maxOutputTokens: clampNum(src.maxOutputTokens, B.maxOutputTokens.min, B.maxOutputTokens.max, D.maxOutputTokens, true),
    thinking: src.thinking === 'default' || PERSONA_THINKING_LEVELS.includes(src.thinking as ThinkingLevel)
      ? (src.thinking as ThinkingSetting)
      : D.thinking,
    safety: PERSONA_SAFETY_LEVELS.includes(src.safety as SafetyLevel) ? (src.safety as SafetyLevel) : D.safety,
    googleSearch: typeof src.googleSearch === 'boolean' ? src.googleSearch : D.googleSearch,
    voice: PERSONA_VOICES.includes(src.voice as LiveVoice) ? (src.voice as LiveVoice) : D.voice,
  };
  return out;
}

// ─── Resolution ──────────────────────────────────────────────────────────────

function defaultProfile(): AgentProfile {
  const D = PLATFORM_CHAT_DEFAULTS;
  return {
    id: DEFAULT_AGENT_PROFILE_ID,
    directive: '',
    temperature: D.temperature,
    topP: D.topP,
    topK: D.topK,
    maxOutputTokens: D.maxOutputTokens,
    thinking: D.thinking,
    safety: D.safety,
    googleSearch: D.googleSearch,
    voice: D.voice,
  };
}

function profileFromPersona(persona: Persona): AgentProfile {
  const D = PLATFORM_CHAT_DEFAULTS;
  return clampAgentProfile({
    id: persona.id,
    label: persona.name.en,
    directive: personaSystemBlock(persona),
    tone: persona.tone,
    temperature: persona.temperature ?? D.temperature,
    ...(typeof persona.temperature === 'number' ? { personaTemperature: true } : {}),
    topP: persona.topP ?? D.topP,
    topK: persona.topK ?? D.topK,
    maxOutputTokens: persona.maxOutputTokens ?? D.maxOutputTokens,
    thinking: persona.thinking ?? D.thinking,
    safety: persona.safety ?? D.safety,
    googleSearch: persona.googleSearch ?? D.googleSearch,
    voice: persona.voice ?? D.voice,
  });
}

/**
 * Resolve the profile for a request. `personaId` may name a built-in; `customPersona` is the inline
 * user-authored definition the client sends for a `custom:` id, and is RE-VALIDATED here on every turn
 * (sanitized directive, clamped overrides, namespaced id) — never trusted from localStorage.
 *
 * Total: junk input, an unknown id or an invalid custom persona all resolve to the default profile.
 */
export function resolveAgentProfile(input: { personaId?: string | null; customPersona?: unknown }): AgentProfile {
  try {
    const personaId = typeof input?.personaId === 'string' ? input.personaId : null;
    const raw = input?.customPersona;
    const custom = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as CustomPersonaInput) : null;
    const persona = resolvePersona(personaId, custom);
    return persona ? profileFromPersona(persona) : defaultProfile();
  } catch {
    // resolvePersona is total; this only guards a hostile getter on a hand-crafted object.
    return defaultProfile();
  }
}

// ─── Chat ────────────────────────────────────────────────────────────────────

/**
 * The Gemini chat config for a profile.
 *
 * `system` = the platform system string with the profile's persona block APPENDED — byte-identical to what
 * `applySystemPersona(platformSystem, persona)` has always produced, so the platform rules keep precedence.
 * `thinking` is omitted entirely for a 'default' profile (see ThinkingSetting); `topK` only when set;
 * `personaSampling` only when the persona chose its temperature (a Gemini 3 call sends temperature / topK only then).
 */
export function toGeminiChatConfig(profile: AgentProfile, platformSystem: string): GeminiChatConfig {
  const p = clampAgentProfile(profile);
  const base = typeof platformSystem === 'string' ? platformSystem : String(platformSystem ?? '');
  const system = p.directive ? (base ? `${base}\n\n${p.directive}` : p.directive) : base;
  return {
    system,
    temperature: p.temperature,
    ...(p.personaTemperature ? { personaSampling: true } : {}),
    topP: p.topP,
    ...(p.topK !== undefined ? { topK: p.topK } : {}),
    maxOutputTokens: p.maxOutputTokens,
    safetySettings: safetySettingsFor(p.safety),
    ...(p.thinking !== 'default' ? { thinking: { level: p.thinking } } : {}),
    googleSearch: p.googleSearch,
  };
}

// ─── Live ────────────────────────────────────────────────────────────────────

/**
 * Appended after a persona block in a Live session only. A persona written for chat ("give working code",
 * "a shot list") would otherwise have the voice model reading markdown aloud; this is the last line of the
 * instruction, where the model weighs it most.
 */
export const LIVE_SPOKEN_RULE =
  'LIVE VOICE CALL: whatever this persona asks for, deliver it as natural spoken sentences — no markdown, '
  + 'lists, code blocks or emoji. Describe code, tables and shot lists in words.';

/**
 * ⚠️ ONLY AOEDE AND CHARON ARE VERIFIED LIVE IN GEORGIAN. Kore and Puck are valid Gemini voices but nobody
 * has listened to them speak Georgian yet, so a Georgian session maps them onto the verified voice of the
 * same register (Kore → Aoede, Puck → Charon). en/ru sessions get the voice as asked.
 */
const KA_VERIFIED_VOICE: Readonly<Record<LiveVoice, LiveVoice>> = Object.freeze({
  Aoede: 'Aoede',
  Charon: 'Charon',
  Kore: 'Aoede',
  Puck: 'Charon',
});

export function liveVoiceFor(voice: LiveVoice, locale: 'ka' | 'en' | 'ru'): LiveVoice {
  const v: LiveVoice = PERSONA_VOICES.includes(voice) ? voice : PLATFORM_CHAT_DEFAULTS.voice;
  return locale === 'en' || locale === 'ru' ? v : KA_VERIFIED_VOICE[v];
}

/**
 * The Gemini Live setup for a profile.
 *
 * systemInstruction = the locale's live voice persona (lib/voice/voicePrompt.ts), then `platformSystem`
 * (platform knowledge + today's date — the caller builds it), then — only when a persona is active — its
 * block and LIVE_SPOKEN_RULE. The live session passes lib/chat/platformPrompt's buildPlatformPrompt as `platformSystem`
 * (components/voice/live/useGeminiLiveSession.ts).
 *
 * `temperature` is the profile's. NOTE: the Live session sends no temperature today (model default), so
 * putting this into generationConfig is a behaviour change the Live integrator should make deliberately.
 */
export function toGeminiLiveSetup(
  profile: AgentProfile,
  opts: { locale: 'ka' | 'en' | 'ru'; platformSystem?: string },
): ProfileLiveSetup {
  const p = clampAgentProfile(profile);
  const locale = opts?.locale === 'en' || opts?.locale === 'ru' ? opts.locale : 'ka';
  const platform = typeof opts?.platformSystem === 'string' && opts.platformSystem.trim() ? opts.platformSystem : '';
  const base = [liveVoicePersona(locale), platform].filter(Boolean).join('\n\n');
  const systemInstruction = p.directive ? `${base}\n\n${p.directive}\n${LIVE_SPOKEN_RULE}` : base;
  return {
    systemInstruction,
    temperature: p.temperature,
    voiceName: liveVoiceFor(p.voice, locale),
  };
}
