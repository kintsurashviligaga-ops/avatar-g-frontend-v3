/**
 * lib/studio/musicRegen.ts — the music RE-ROLL contract behind OmniStudio's "Regenerate" button on a track.
 *
 * A re-roll must re-run the SAME request that produced the track (same brief + settings → a fresh variation).
 *
 * ⚠️ THE SPEC USED TO CARRY ONLY prompt / genre / instrumental / lyrics. The re-roll POST therefore sent no
 * `durationSec` (the route defaults to 30 s — a 60 s, 90 s or full song came back as a 30 s clip), no
 * `voiceType` (the singer's gender was silently dropped) and no `tempo`. The spec now records all three, and the
 * body builder re-validates them, because the spec is persisted with the message (localStorage, any older build)
 * and a reloaded bubble re-rolls from whatever was stored.
 *
 * The spec also records the TEMPLATE CARD the request selected (`templateId`, an id only), so a re-roll of a card's
 * track gets the same server-resolved descriptor the original did (lib/studio/templateContext). It is kept only while
 * the spec's own values still select that card, because the route re-checks exactly that and would ignore it anyway.
 *
 * And the GRANULAR CONTROLS (lib/ai/musicControls): `genre` is the style LINE the request sent ("georgian folk, jazz"
 * — one label on a spec from before multi-select, and a renamed one brought up to date: an older spec's 'folk' was the
 * Georgian Folk chip and re-rolls as 'georgian folk'), resent as both `style` and the `styles` list; the singer is the
 * 4-stop `vocalGender` (Auto included, so a re-roll of an Auto song stays Auto — a spec persisted earlier stored
 * `voiceType`, which is still read); and the Weirdness / Style influence sliders. A field an older spec lacks is
 * omitted, and the route applies its own default (Auto, 50, 50).
 *
 * Pure and client-safe — imported by the studio component; the route clamps every field again server-side.
 */
import { TEMPLATE_ID_RX, matchMusicTemplate } from '@/lib/studio/templates';
import { clampSlider, cleanStyles, isVocalGender, musicStyleLine, stylesFromLine, type VocalGender } from '@/lib/ai/musicControls';

export type MusicTempo = 'slow' | 'medium' | 'fast';
/** The singer as specs persisted before the 4-stop control stored it (`voiceType`). New specs store `vocalGender`. */
export type MusicVoiceType = 'female' | 'male' | 'duet';

export type MusicRegenSpec = {
  kind: 'music';
  prompt: string;
  /** The style LINE the request sent (lib/ai/musicControls `musicStyleLine`): up to three labels joined by ", ". */
  genre: string;
  instrumental: boolean;
  lyrics?: string;
  /** 0 = "full song", otherwise 15–90. ABSENT on specs persisted before this field existed → the route's 30 s default. */
  durationSec?: number;
  tempo?: MusicTempo;
  /** The singer — a SONG only; never stored on an instrumental. 'auto' is stored too, so the re-roll says it. */
  vocalGender?: VocalGender;
  /** 0–100 — ABSENT on specs persisted before the sliders existed → the route's neutral 50. */
  weirdness?: number;
  styleInfluence?: number;
  /** The template card the original request selected (lib/studio/templates) — absent when none applied. */
  templateId?: string;
};

const TEMPOS: ReadonlySet<string> = new Set<MusicTempo>(['slow', 'medium', 'fast']);
const VOICES: ReadonlySet<string> = new Set<MusicVoiceType>(['female', 'male', 'duet']);

/** The route's own clamp (app/api/ai/music, `durationSec`): 0 = full song, anything else 15–90. Junk → undefined. */
function normDuration(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  return v === 0 ? 0 : Math.max(15, Math.min(90, Math.round(v)));
}

/** The route's own reading of the singer (parseMusicControls): `vocalGender`, else an older body's `voiceType`. */
function normVocal(vocalGender: unknown, voiceType: unknown): VocalGender | undefined {
  if (isVocalGender(vocalGender)) return vocalGender;
  return typeof voiceType === 'string' && VOICES.has(voiceType) ? (voiceType as MusicVoiceType) : undefined;
}

/** A slider as stored: a finite number, clamped 0–100. Anything else is ABSENT (the route then uses 50). */
function normSlider(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? clampSlider(v) : undefined;
}

/**
 * Style values an earlier build sent that the studio has since renamed, keyed lowercase. A Map, not an object literal,
 * so a label like "constructor" cannot look up an Object.prototype member.
 *
 * ⚠️ 'folk' WAS THE GEORGIAN FOLK CHIP, and the Georgian Folk card's genre, until Round 3 changed the value to
 * 'georgian folk'. Without this, a track saved before that re-rolls as generic folk. A Round-2 spec saved from the card
 * also loses its `templateId`, because the card no longer matches 'folk', so the re-roll drops the Georgian descriptor
 * as well. (From 2026-06-13 to 06-24 the panel's 'folk' chip meant generic folk, so a re-roll of a track from those
 * eleven days now comes back Georgian. The chip has meant Georgian Folk ever since.)
 */
const LEGACY_STYLES: ReadonlyMap<string, string> = new Map([['folk', 'georgian folk']]);

/**
 * The style line the route will compose from: the cleaned labels, renamed ones brought up to date (LEGACY_STYLES), then
 * re-joined. A line with no usable label is kept as given.
 */
function normGenre(genre: string): string {
  const styles = cleanStyles(stylesFromLine(genre).map((s) => LEGACY_STYLES.get(s.toLowerCase()) ?? s));
  return styles.length ? musicStyleLine(styles) : genre;
}

/**
 * The template card a music request's OWN values select — what the route will re-derive from the same body
 * (style line, tempo, length, instrumental, singer; an absent length is the route's 30 s default, and Auto names no
 * singer). Pass what the request SENDS, not the raw panel: a trained or cloned voice sends no singer, and that changes
 * which card matches.
 */
export function musicRequestTemplateId(v: {
  genre: string; instrumental: boolean; durationSec?: number; tempo?: string; vocalGender?: string;
  /** An older spec's singer, read when `vocalGender` is absent. */
  voiceType?: string;
}): string | null {
  const sung = normVocal(v.vocalGender, v.voiceType);
  return matchMusicTemplate({
    genre: normGenre(v.genre),
    tempo: v.tempo ?? '',
    duration: normDuration(v.durationSec) ?? 30,
    instrumental: v.instrumental,
    voiceType: sung && sung !== 'auto' ? sung : '',
  });
}

/**
 * Build a re-roll spec from the values the original request ACTUALLY SENT (not the live panel — the user may
 * have changed it since). Lyrics and the singer are dropped on an instrumental, exactly as the request drops them.
 */
export function makeMusicRegenSpec(m: {
  prompt: string; genre: string; instrumental: boolean; lyrics?: string;
  durationSec?: number; tempo?: string; vocalGender?: string;
  /** An older spec's singer (female / male / duet), read when `vocalGender` is absent. */
  voiceType?: string;
  weirdness?: number; styleInfluence?: number; templateId?: string | null;
}): MusicRegenSpec {
  const genre = typeof m.genre === 'string' ? normGenre(m.genre) : '';
  const durationSec = normDuration(m.durationSec);
  const tempo = typeof m.tempo === 'string' && TEMPOS.has(m.tempo) ? (m.tempo as MusicTempo) : undefined;
  const vocalGender = m.instrumental ? undefined : normVocal(m.vocalGender, m.voiceType);
  const lyrics = !m.instrumental && typeof m.lyrics === 'string' && m.lyrics.trim() ? m.lyrics : undefined;
  const weirdness = normSlider(m.weirdness);
  const styleInfluence = normSlider(m.styleInfluence);
  // A persisted spec (localStorage, any older build) is re-validated like every other field: a malformed id, or one
  // its own values no longer select, is dropped rather than re-sent.
  const templateId = typeof m.templateId === 'string' && TEMPLATE_ID_RX.test(m.templateId)
    && musicRequestTemplateId({ genre, instrumental: m.instrumental, durationSec, tempo, vocalGender }) === m.templateId
    ? m.templateId
    : undefined;
  return {
    kind: 'music',
    prompt: m.prompt,
    genre,
    instrumental: m.instrumental,
    ...(lyrics ? { lyrics } : {}),
    ...(durationSec !== undefined ? { durationSec } : {}),
    ...(tempo ? { tempo } : {}),
    ...(vocalGender ? { vocalGender } : {}),
    ...(weirdness !== undefined ? { weirdness } : {}),
    ...(styleInfluence !== undefined ? { styleInfluence } : {}),
    ...(templateId ? { templateId } : {}),
  };
}

/** The /api/ai/music POST body for a re-roll. A field the spec lacks is OMITTED, so the route applies its own default. */
export function musicRegenBody(spec: MusicRegenSpec): Record<string, unknown> {
  const s = makeMusicRegenSpec(spec);
  const styles = stylesFromLine(s.genre);
  return {
    prompt: s.prompt,
    style: s.genre,
    ...(styles.length ? { styles } : {}),
    instrumental: s.instrumental,
    ...(s.durationSec !== undefined ? { durationSec: s.durationSec } : {}),
    ...(s.tempo ? { tempo: s.tempo } : {}),
    ...(s.vocalGender ? { vocalGender: s.vocalGender } : {}),
    ...(s.weirdness !== undefined ? { weirdness: s.weirdness } : {}),
    ...(s.styleInfluence !== undefined ? { styleInfluence: s.styleInfluence } : {}),
    ...(s.lyrics ? { lyrics: s.lyrics } : {}),
    ...(s.templateId ? { templateId: s.templateId } : {}),
  };
}

/**
 * The seconds the route BILLS this re-roll at (a re-roll never carries an audioReference, so no flat-30 cover
 * rule): full song → the 90 s tier, absent → the route's 30 s default. Feeds the credit toast so the deduction
 * shown is the deduction made.
 */
export function musicRegenBilledSeconds(spec: MusicRegenSpec): number {
  const d = normDuration(spec.durationSec);
  return d === undefined ? 30 : d === 0 ? 90 : d;
}
