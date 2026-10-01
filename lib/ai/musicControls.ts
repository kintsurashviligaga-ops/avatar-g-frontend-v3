/**
 * lib/ai/musicControls.ts — the music panel's GRANULAR controls, from the request body to each engine.
 *
 * What the panel sends: up to three style labels (`styles`), the singer (`vocalGender`: auto / female / male / duet —
 * owner decision 2026-10-01 A-e) and two sliders, Weirdness and Style influence (0–100, 50 = neutral). There is NO
 * Variety slider: decision A-d merged it into Weirdness, so "more varied" and "more unusual" are one dial.
 *
 * ⚠️ ON LYRIA AND ELEVENLABS THE SLIDERS ARE APPROXIMATE, BY DESIGN. Neither engine has a knob for either quantity —
 * each takes one text brief — so a slider can only add a sentence to that brief (`promptDirectives`). The panel labels
 * them „approximate" in ka/en/ru, and the route returns `controls.mode` ('prompt' | 'native') so the result card can
 * say which it was. Two engines take them natively: MusicGen (sampling temperature + classifier-free guidance,
 * `musicgenParams`) and the Udio gateway's Suno-style fields (`udioParams`) — the latter ONLY with MUSIC_SUNO_PARAMS
 * on, which is off by default until one live probe confirms the gateway's field names and scales.
 *
 * ⚠️ THE MIDDLE BAND ADDS NOTHING. A slider nobody touched (50), or one nudged a little, must leave the brief exactly as
 * it was — otherwise every track would carry steering text nobody asked for, and every "neutral" track would change the
 * day this shipped. Only a deliberate move out of NEUTRAL_LOW…NEUTRAL_HIGH writes a sentence.
 *
 * ⚠️ NO CLIENT TEXT REACHES A PROMPT THROUGH HERE except the style labels, and those pass sanitizeStyle (one visible
 * line, no bidi or zero-width characters), comma stripping (one label = one tag, so a label cannot smuggle extra tags
 * past the cap), a per-label cap and a count cap. Every directive is a fixed sentence picked by the slider's band; the
 * numbers themselves never enter a prompt.
 *
 * Pure and isomorphic (the studio's re-roll spec imports it): no I/O, and the one env read takes the env as a parameter.
 */
import { sanitizeStyle } from '@/lib/studio/style';

export type VocalGender = 'auto' | 'female' | 'male' | 'duet';
export const VOCAL_GENDERS: readonly VocalGender[] = ['auto', 'female', 'male', 'duet'];

/** The most styles one track can blend — the panel's chips stop here. */
export const MAX_STYLES = 3;
/**
 * One label's cap, in characters. The studio's longest is 13 ("georgian folk"); 3 × 24 + two ", " separators = 76, so
 * the joined line always fits the route's 80-character `style` cap (lib/studio/style STYLE_MAX).
 */
export const STYLE_LABEL_MAX = 24;

/** Slider scale: 0–100. */
export const SLIDER_MIN = 0;
export const SLIDER_MAX = 100;
/** Where both sliders start, and the value that sends no native parameter. */
export const SLIDER_DEFAULT = 50;
/** The neutral band, inclusive: a slider inside it adds nothing to the brief. */
export const NEUTRAL_LOW = 35;
export const NEUTRAL_HIGH = 65;
/** Past these the STRONG sentence replaces the mild one (symmetric around 50, like the neutral band). */
export const STRONG_LOW = 15;
export const STRONG_HIGH = 85;

export interface MusicControls {
  /** 0–MAX_STYLES cleaned labels, in the order picked (the first leads). Empty = the request sent none. */
  styles: string[];
  /** The singer. 'auto' = no preference: the brief carries no vocal descriptor and the engine decides. */
  vocalGender: VocalGender;
  /** 0–100, 50 neutral. Low = familiar, high = experimental (Variety is merged in here). */
  weirdness: number;
  /** 0–100, 50 neutral. Low = the style is loose inspiration, high = follow it strictly. */
  styleInfluence: number;
}

export function isVocalGender(v: unknown): v is VocalGender {
  return v === 'auto' || v === 'female' || v === 'male' || v === 'duet';
}

/** A slider value: a finite number clamped to 0–100 and rounded. Anything else is the neutral default. */
export function clampSlider(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return SLIDER_DEFAULT;
  return Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, Math.round(v)));
}

/** True inside the neutral band — the slider asks for nothing. */
export function isSliderNeutral(v: number): boolean {
  const n = clampSlider(v);
  return n >= NEUTRAL_LOW && n <= NEUTRAL_HIGH;
}

/** One label: sanitizeStyle'd, commas out, capped at STYLE_LABEL_MAX code points (never half a surrogate pair). */
function cleanLabel(raw: unknown): string {
  const line = sanitizeStyle(raw).replace(/,/g, ' ').replace(/ {2,}/g, ' ').trim();
  return Array.from(line).slice(0, STYLE_LABEL_MAX).join('').trim();
}

/**
 * Up to MAX_STYLES cleaned labels, de-duplicated case-insensitively, in the order given. A non-array is []. Only the
 * first 20 entries are looked at, so a hostile array costs nothing to walk.
 */
export function cleanStyles(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw.slice(0, 20)) {
    const label = cleanLabel(item);
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length === MAX_STYLES) break;
  }
  return out;
}

/**
 * The ONE style line the engines read — "georgian folk, jazz" — a comma-separated tag list, which is the Udio
 * gateway's own `style` format and reads naturally in a text brief ("Style: georgian folk, jazz."). The template
 * match compares it too, so a card lights (and adds its context) only while its genre is the sole style.
 */
export function musicStyleLine(styles: readonly string[]): string {
  return styles.join(', ');
}

/** The inverse of musicStyleLine, through the same cleaning — a re-roll spec stores the line and resends the list. */
export function stylesFromLine(line: unknown): string[] {
  return typeof line === 'string' ? cleanStyles(line.split(',')) : [];
}

/**
 * Tap a style chip. Picking adds it at the end (the first pick leads); tapping a picked one removes it — except the
 * last, because an engine needs a style; at the cap an unpicked chip changes nothing (the panel disables it rather than
 * silently dropping an earlier pick). Returns the SAME array when nothing changed.
 */
export function toggleStyle(current: string[], id: string, max = MAX_STYLES): string[] {
  if (current.includes(id)) return current.length > 1 ? current.filter((s) => s !== id) : current;
  return current.length < max ? [...current, id] : current;
}

/**
 * The controls a request body carries. `vocalGender` is the field; the older `voiceType` (female / male / duet) is
 * still read when it is absent — a re-roll spec persisted by an earlier build sends that. Junk falls back to the
 * neutral defaults: no styles, Auto, 50, 50.
 */
export function parseMusicControls(body: unknown): MusicControls {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const legacy = b.voiceType === 'female' || b.voiceType === 'male' || b.voiceType === 'duet' ? b.voiceType : 'auto';
  return {
    styles: cleanStyles(b.styles),
    vocalGender: isVocalGender(b.vocalGender) ? b.vocalGender : legacy,
    weirdness: clampSlider(b.weirdness),
    styleInfluence: clampSlider(b.styleInfluence),
  };
}

type Band = 'strong-low' | 'low' | 'neutral' | 'high' | 'strong-high';

function band(v: number): Band {
  const n = clampSlider(v);
  if (n < STRONG_LOW) return 'strong-low';
  if (n < NEUTRAL_LOW) return 'low';
  if (n <= NEUTRAL_HIGH) return 'neutral';
  if (n <= STRONG_HIGH) return 'high';
  return 'strong-high';
}

// English: every engine behind the route reads English, and these are appended AFTER promptToEnglish so they are
// never sent through the translator. Affirmative phrasing — "no X" tends to read as a request for X.
const WEIRDNESS: Readonly<Record<Exclude<Band, 'neutral'>, string>> = {
  'strong-low': 'Keep it conventional and familiar: a classic structure, expected chord changes and a polished, mainstream arrangement.',
  low: 'Lean conventional: a familiar structure and a straightforward arrangement.',
  high: 'Add some surprise: an unexpected sound, an unusual chord change or an inventive turn in the arrangement.',
  'strong-high': 'Make it experimental and unpredictable: an unconventional structure, unusual sounds and bold, inventive arrangement choices throughout.',
};

const STYLE_INFLUENCE: Readonly<Record<Exclude<Band, 'neutral'>, string>> = {
  'strong-low': 'Treat the stated style as loose inspiration only and blend in other influences freely.',
  low: 'Follow the stated style loosely, leaving room for other influences.',
  high: 'Stay close to the stated style, with its typical instruments, rhythm and production.',
  'strong-high': 'Adhere strictly to the stated style: its signature instruments, rhythm and production from start to finish.',
};

/**
 * The sentences the sliders add to a TEXT brief — Weirdness first, then Style influence; [] while both sit in the
 * neutral band. This is the whole of the control on Lyria and ElevenLabs Music, hence „approximate".
 */
export function promptDirectives(c: Pick<MusicControls, 'weirdness' | 'styleInfluence'>): string[] {
  const out: string[] = [];
  const w = band(c.weirdness);
  if (w !== 'neutral') out.push(WEIRDNESS[w]);
  const s = band(c.styleInfluence);
  if (s !== 'neutral') out.push(STYLE_INFLUENCE[s]);
  return out;
}

/** 0–100 → 0–1, two decimals. */
const unit = (v: number): number => Math.round(clampSlider(v)) / 100;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * The Udio gateway's native controls (Suno-style models). A field is present only when it says something: a slider at
 * exactly 50 sends nothing, so the gateway keeps its own default; the singer only for a SONG with a chosen solo gender
 * (Auto has no stop, and a duet has no native one — the brief's descriptor carries it). Wire names live in the client
 * (lib/udio/client.ts), which sends these only with MUSIC_SUNO_PARAMS on.
 */
export interface UdioControlParams {
  vocalGender?: 'female' | 'male';
  /** 0–1 — Style influence. */
  styleWeight?: number;
  /** 0–1 — Weirdness. */
  weirdnessConstraint?: number;
}

export function udioParams(c: MusicControls, opts: { instrumental: boolean }): UdioControlParams {
  const out: UdioControlParams = {};
  if (!opts.instrumental && (c.vocalGender === 'female' || c.vocalGender === 'male')) out.vocalGender = c.vocalGender;
  if (clampSlider(c.styleInfluence) !== SLIDER_DEFAULT) out.styleWeight = unit(c.styleInfluence);
  if (clampSlider(c.weirdness) !== SLIDER_DEFAULT) out.weirdnessConstraint = unit(c.weirdness);
  return out;
}

/** MusicGen's own defaults (Replicate meta/musicgen): the value each slider's 50 stands for. */
export const MUSICGEN_DEFAULT_TEMPERATURE = 1;
export const MUSICGEN_DEFAULT_GUIDANCE = 3;

/**
 * MusicGen's native controls: Weirdness → sampling temperature 0.7…1.3 (more diverse, less predictable output),
 * Style influence → classifier-free guidance 1…5 (how closely the output follows the text). Both centred on the model's
 * own defaults, so 50 sends nothing and the ranges stay where MusicGen still makes music rather than noise.
 */
export interface MusicgenControlParams {
  temperature?: number;
  classifierFreeGuidance?: number;
}

export function musicgenParams(c: Pick<MusicControls, 'weirdness' | 'styleInfluence'>): MusicgenControlParams {
  const out: MusicgenControlParams = {};
  const w = clampSlider(c.weirdness);
  const s = clampSlider(c.styleInfluence);
  if (w !== SLIDER_DEFAULT) out.temperature = round2(MUSICGEN_DEFAULT_TEMPERATURE + ((w - SLIDER_DEFAULT) / 50) * 0.3);
  if (s !== SLIDER_DEFAULT) out.classifierFreeGuidance = round2(MUSICGEN_DEFAULT_GUIDANCE + ((s - SLIDER_DEFAULT) / 50) * 2);
  return out;
}

/** MUSIC_SUNO_PARAMS — the Udio gateway's native control fields. OFF unless explicitly on (1 / true / on). */
export function musicSunoParamsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^(1|true|on)$/i.test((env.MUSIC_SUNO_PARAMS ?? '').trim());
}

/** The provider ids of the route's failover chain. */
export type MusicEngineId = 'lyria' | 'udio' | 'elevenlabs-music' | 'musicgen';
/** 'native' — the engine received the controls as parameters; 'prompt' — only as sentences in its brief. */
export type MusicControlMode = 'native' | 'prompt';

/** How the controls reached `engine` — what the response's `controls.mode` reports for the result card. */
export function controlModeFor(engine: MusicEngineId, env: NodeJS.ProcessEnv = process.env): MusicControlMode {
  if (engine === 'musicgen') return 'native';
  if (engine === 'udio') return musicSunoParamsEnabled(env) ? 'native' : 'prompt';
  return 'prompt';
}
