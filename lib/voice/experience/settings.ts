import type { PERSONA_VOICES } from '@/lib/services/personas/personas';

export const PERSONALITY_CATALOGUE_VERSION = 1 as const;
export const PERSONALITIES = {
  friendly: { ka: 'მეგობრული', en: 'Friendly', ru: 'Дружелюбный', directive: 'Warm, attentive and conversational.' },
  professional: { ka: 'პროფესიონალური', en: 'Professional', ru: 'Профессиональный', directive: 'Precise, clear and concise.' },
  critical: { ka: 'კრიტიკული', en: 'Critical', ru: 'Критический', directive: 'Offer constructive, evidence-based criticism and specific improvements.' },
  sarcastic: { ka: 'სარკასტული', en: 'Sarcastic', ru: 'Саркастичный', directive: 'Only when invited, use restrained playful irony; never humiliate or insult.' },
  humorous: { ka: 'იუმორისტული', en: 'Humorous', ru: 'С юмором', directive: 'Use occasional relevant light humor, without repetitive jokes or scripted laughter.' },
  calm: { ka: 'მშვიდი', en: 'Calm', ru: 'Спокойный', directive: 'Patient, measured and clear, without false reassurance.' },
  creative: { ka: 'შემოქმედებითი', en: 'Creative', ru: 'Творческий', directive: 'Imaginative and expressive while staying focused on the actual task.' },
  coach: { ka: 'მწვრთნელი', en: 'Coach', ru: 'Наставник', directive: 'Encourage improvement with specific, appropriately challenging feedback.' },
} as const;
export type Personality = keyof typeof PERSONALITIES;
export type VoiceLanguage = 'auto' | 'ka' | 'en' | 'ru';
export interface VoicePreferences {
  version: 1;
  personality: Personality;
  voice: typeof PERSONA_VOICES[number];
  pace: 'slow' | 'normal' | 'brisk';
  responseLength: 'brief' | 'balanced' | 'detailed';
  humor: 'off' | 'light' | 'moderate';
  sarcasm: 'off' | 'light' | 'moderate';
  expressiveness: 'restrained' | 'natural' | 'expressive';
  eagerness: 'eager' | 'normal' | 'patient';
  language: VoiceLanguage;
  tone: 'auto' | 'gentle' | 'serious' | 'upbeat';
}
export const DEFAULT_VOICE_PREFERENCES: Readonly<VoicePreferences> = Object.freeze({
  version: 1, personality: 'friendly', voice: 'Aoede', pace: 'normal', responseLength: 'brief',
  humor: 'light', sarcasm: 'off', expressiveness: 'natural', eagerness: 'normal', language: 'auto', tone: 'auto',
});
function oneOf<T extends string>(v: unknown, values: readonly T[], fallback: T): T {
  return typeof v === 'string' && values.includes(v as T) ? v as T : fallback;
}
/** Fixed enums only. Unknown keys, prompt text, credentials and future schemas never enter a prompt. */
export function validateVoicePreferences(raw: unknown): VoicePreferences {
  const d = DEFAULT_VOICE_PREFERENCES;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...d };
  const r = raw as Record<string, unknown>;
  if (r.version !== undefined && r.version !== 1) return { ...d };
  const personality = oneOf(r.personality, Object.keys(PERSONALITIES) as Personality[], d.personality);
  return {
    version: 1, personality, voice: oneOf(r.voice, ['Aoede', 'Charon'], d.voice),
    pace: oneOf(r.pace, ['slow', 'normal', 'brisk'], d.pace),
    responseLength: oneOf(r.responseLength, ['brief', 'balanced', 'detailed'], d.responseLength),
    humor: oneOf(r.humor, ['off', 'light', 'moderate'], d.humor),
    sarcasm: personality === 'sarcastic' ? oneOf(r.sarcasm, ['off', 'light', 'moderate'], 'light') : 'off',
    expressiveness: oneOf(r.expressiveness, ['restrained', 'natural', 'expressive'], d.expressiveness),
    eagerness: oneOf(r.eagerness, ['eager', 'normal', 'patient'], d.eagerness),
    language: oneOf(r.language, ['auto', 'ka', 'en', 'ru'], d.language),
    tone: oneOf(r.tone, ['auto', 'gentle', 'serious', 'upbeat'], d.tone),
  };
}
export function selectPersonality(p: VoicePreferences, personality: Personality): VoicePreferences {
  return validateVoicePreferences({ ...p, personality, sarcasm: personality === 'sarcastic' ? 'light' : 'off' });
}
export const VOICE_UI_APPROVAL_RULE = 'VOICE FINANCIAL RULE: Speech, a spoken yes, a countdown and model claims NEVER authorize a paid job. Prepare or explain the quote and direct the user to the authenticated UI confirmation. Never claim a job started without a successful backend result. Barge-in stops speech only, never a durable Studio job.';
export interface VoiceStyle {
  tone: string; energy: 'low' | 'normal' | 'lively'; pace: VoicePreferences['pace'];
  emphasis: 'meaningful-only'; pauseIntent: 'thought-boundaries'; humorIntent: VoicePreferences['humor'];
  expressiveCue: 'none' | 'optional-amusement';
}
export function voiceStyle(p: VoicePreferences, sensitive = false): VoiceStyle {
  return {
    tone: sensitive ? 'serious' : p.tone === 'auto' ? p.personality : p.tone,
    energy: sensitive || p.personality === 'calm' ? 'low' : p.expressiveness === 'expressive' ? 'lively' : 'normal',
    pace: p.pace, emphasis: 'meaningful-only', pauseIntent: 'thought-boundaries',
    humorIntent: sensitive ? 'off' : p.humor,
    expressiveCue: !sensitive && p.humor !== 'off' && p.personality === 'humorous' ? 'optional-amusement' : 'none',
  };
}
/** Prompt guidance, not undocumented prosody API fields or proof of audio quality. */
export function voiceStyleInstruction(raw: unknown): string {
  const p = validateVoicePreferences(raw);
  return [
    'VOICE PRESENTATION v1 (style only; platform truth, tools, permissions and pricing stay unchanged).',
    PERSONALITIES[p.personality].directive,
    `Delivery: ${p.pace} pace, ${p.expressiveness} expression, ${p.tone} tone. Humor: ${p.humor}; sarcasm: ${p.sarcasm}.`,
    p.responseLength === 'brief' ? 'Usually speak 1–3 short sentences. Summarize long reports and offer detail on screen.'
      : p.responseLength === 'balanced' ? 'Give concise conversational explanations; avoid lengthy enumerations.' : 'Give requested detail in manageable spoken turns; pause for the user.',
    'Never read Markdown punctuation, raw URLs, code or stage-direction tags. Explicit complete reading belongs to the separate Listen control; do not silently summarize a requested complete reading.',
    'Optional amusement is contextual, never mandatory laughter. No humor or sarcasm during billing, security, safety, distress or serious complaints. Do not pretend to have human feelings; be transparent that you are AI.',
    p.language === 'auto' ? 'Follow the language the user speaks, including KA/EN/RU switching.' : `Prefer ${p.language}; honor explicit language changes.`,
    VOICE_UI_APPROVAL_RULE,
  ].join('\n');
}
