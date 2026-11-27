/**
 * lib/avatar/studio/catalog.ts — the Virtual Studio's presenters, voices, tones and paces. Pure, client-safe.
 *
 * TWO ENGINES, BECAUSE GOOGLE HAS NO SINGLE ONE THAT DOES IT ALL (Phase 8.6 research, 2026-11-15):
 *  - 'live'  Vertex gemini-3.8-live Live Avatar, recorded. Prebuilt faces only (Kira, Ben, Leo open on our project —
 *            probe 2026-10-25; Aria and Mia were refused). The voice is NAMED (speechConfig: Algieba, Kore, …), the lip
 *            sync is the model's own, and the same face and voice carry through every scene. 704×1280 portrait.
 *  - 'omni'  Gemini Omni 1.2 Flash image-to-video. Any built-in face is the first frame (the Avatar panel's presets,
 *            lib/studio/templates; an Art Director face later). Omni speaks Georgian in ITS OWN voice: its docs say
 *            "Uploading audio references is unsupported" and "Voice editing is not supported", so a named voice can
 *            only be DUBBED over its mouth (lib/avatar/speechMatch) — lips approximate, labelled so in the UI.
 * Built-in faces only (GG 2026-10-22); a custom face is refused before any charge (lib/avatar/curated).
 */
import { AVATAR_TEMPLATES } from '@/lib/studio/templates';

export type StudioEngine = 'live' | 'omni';
export type Gender = 'female' | 'male';
export type PresenterLook = 'professional' | 'casual';
export type StudioFormat = '16:9' | '9:16';
type L10n = { ka: string; en: string; ru: string };

export interface Presenter {
  id: string;
  engine: StudioEngine;
  gender: Gender;
  look: PresenterLook;
  label: L10n;
  /**
   * Card image (public path). For 'omni' it is also the clip's first frame. null for the Live faces until the paid probe
   * (decision D4) saves one still of each: Google publishes no image of its prebuilt avatars, and we never invent one.
   */
  thumb: string | null;
  /** Live: the prebuilt avatarName. Omni: the face path the server loads (curatedFace). */
  face: string;
  /** The format the face is drawn for; the other one is composed (Live 16:9 = keyed onto a background). */
  nativeFormat: StudioFormat;
  /** The voice it starts with. */
  defaultVoice: VoiceId;
}

// ── Voices (Gemini prebuilt voices; Kore and Algieba confirmed in Google's Gemini-TTS voice table) ─────────────

export type VoiceId =
  | 'Algieba' | 'Kore' | 'Charon' | 'Puck' | 'Orus' | 'Fenrir' | 'Achird'
  | 'Aoede' | 'Leda' | 'Zephyr' | 'Sulafat';

export interface Voice { id: VoiceId; gender: Gender; character: L10n }

export const VOICES: readonly Voice[] = [
  { id: 'Algieba', gender: 'male', character: { ka: 'რბილი, თბილი', en: 'Smooth', ru: 'Мягкий' } },
  { id: 'Charon', gender: 'male', character: { ka: 'ინფორმატიული', en: 'Informative', ru: 'Информативный' } },
  { id: 'Orus', gender: 'male', character: { ka: 'მტკიცე', en: 'Firm', ru: 'Твёрдый' } },
  { id: 'Achird', gender: 'male', character: { ka: 'მეგობრული', en: 'Friendly', ru: 'Дружелюбный' } },
  { id: 'Puck', gender: 'male', character: { ka: 'ენერგიული', en: 'Upbeat', ru: 'Бодрый' } },
  { id: 'Fenrir', gender: 'male', character: { ka: 'აღფრთოვანებული', en: 'Excitable', ru: 'Эмоциональный' } },
  { id: 'Kore', gender: 'female', character: { ka: 'მტკიცე, მკაფიო', en: 'Firm', ru: 'Твёрдый' } },
  { id: 'Aoede', gender: 'female', character: { ka: 'მსუბუქი', en: 'Breezy', ru: 'Лёгкий' } },
  { id: 'Leda', gender: 'female', character: { ka: 'ახალგაზრდული', en: 'Youthful', ru: 'Молодой' } },
  { id: 'Zephyr', gender: 'female', character: { ka: 'ნათელი', en: 'Bright', ru: 'Яркий' } },
  { id: 'Sulafat', gender: 'female', character: { ka: 'თბილი', en: 'Warm', ru: 'Тёплый' } },
];

export const DEFAULT_VOICE: Record<Gender, VoiceId> = { male: 'Algieba', female: 'Kore' };

export function voiceById(id: unknown): Voice | null {
  return VOICES.find((v) => v.id === id) ?? null;
}

// ── Presenters ─────────────────────────────────────────────────────────────────────────────────────────────

export const LIVE_PRESENTERS: readonly Presenter[] = [
  { id: 'live-kira', engine: 'live', gender: 'female', look: 'professional', face: 'Kira', thumb: null, nativeFormat: '9:16', defaultVoice: 'Kore',
    label: { ka: 'კირა', en: 'Kira', ru: 'Кира' } },
  { id: 'live-ben', engine: 'live', gender: 'male', look: 'professional', face: 'Ben', thumb: null, nativeFormat: '9:16', defaultVoice: 'Algieba',
    label: { ka: 'ბენი', en: 'Ben', ru: 'Бен' } },
  { id: 'live-leo', engine: 'live', gender: 'male', look: 'casual', face: 'Leo', thumb: null, nativeFormat: '9:16', defaultVoice: 'Charon',
    label: { ka: 'ლეო', en: 'Leo', ru: 'Лео' } },
];

/** The cinematic shelf IS the Avatar panel's built-in faces, so a preset added there shows up here too. */
const CASUAL_IDS = new Set(['social-story', 'creator-explainer']);
export const OMNI_PRESENTERS: readonly Presenter[] = AVATAR_TEMPLATES.map((t) => ({
  id: `omni-${t.id}`,
  engine: 'omni' as const,
  gender: t.values.gender,
  look: CASUAL_IDS.has(t.id) ? ('casual' as const) : ('professional' as const),
  label: t.label,
  thumb: t.thumb,
  face: t.values.preset,
  nativeFormat: t.values.format === '9:16' ? ('9:16' as const) : ('16:9' as const),
  defaultVoice: DEFAULT_VOICE[t.values.gender],
}));

export const PRESENTERS: readonly Presenter[] = [...LIVE_PRESENTERS, ...OMNI_PRESENTERS];

export function presenterById(id: unknown): Presenter | null {
  return PRESENTERS.find((p) => p.id === id) ?? null;
}

export function filterPresenters(f: { engine?: StudioEngine; gender?: Gender; look?: PresenterLook } = {}): Presenter[] {
  return PRESENTERS.filter((p) => (!f.engine || p.engine === f.engine) && (!f.gender || p.gender === f.gender) && (!f.look || p.look === f.look));
}

// ── Tone and pace (prompt-only: no Google engine has a gesture, rate or pitch parameter) ───────────────────────

export type Tone = 'calm' | 'serious' | 'friendly' | 'excited' | 'inspiring';
export const TONES: readonly Tone[] = ['calm', 'serious', 'friendly', 'excited', 'inspiring'];

export const TONE_LABEL: Record<Tone, L10n> = {
  calm: { ka: 'მშვიდი', en: 'Calm', ru: 'Спокойный' },
  serious: { ka: 'სერიოზული', en: 'Serious', ru: 'Серьёзный' },
  friendly: { ka: 'მეგობრული', en: 'Friendly', ru: 'Дружелюбный' },
  excited: { ka: 'ენთუზიაზმით', en: 'Excited', ru: 'Воодушевлённый' },
  inspiring: { ka: 'შთამაგონებელი', en: 'Inspiring', ru: 'Вдохновляющий' },
};

/** How the voice sounds (Live: speaking style; Omni: the voice line of the prompt). */
export const TONE_VOICE: Record<Tone, string> = {
  calm: 'calm, unhurried and reassuring',
  serious: 'serious, measured and authoritative',
  friendly: 'warm, friendly and conversational',
  excited: 'energetic and excited, with a smile in the voice',
  inspiring: 'inspiring and confident, building gently toward each key point',
};

/** How the body moves (Omni acting direction; Live avatars only show natural expressions). */
export const TONE_ACTING: Record<Tone, string> = {
  calm: 'relaxed posture, slow small nods, soft eye contact with the camera',
  serious: 'upright posture, steady eye contact, minimal deliberate hand movement',
  friendly: 'open smile, light nods, relaxed open-palm gestures',
  excited: 'animated face, lively hand gestures, leans slightly toward the camera',
  inspiring: 'confident stance, purposeful open-hand gestures on key words, steady eye contact',
};

export type Pace = 'slower' | 'natural' | 'faster';
export const PACES: readonly Pace[] = ['slower', 'natural', 'faster'];
/** Speech-rate factor used by the length estimate (and the dub's exact tempo when it is the dub's speed). */
export const PACE_FACTOR: Record<Pace, number> = { slower: 0.88, natural: 1, faster: 1.12 };
export const PACE_TEXT: Record<Pace, string> = { slower: 'a little slower than normal', natural: 'a natural presenting pace', faster: 'a little faster than normal' };
