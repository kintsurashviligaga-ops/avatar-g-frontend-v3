/**
 * dialogueCasting — Phase 1 of the Master-Script compiler (audio fidelity).
 *
 * Turns the parsed dialogue sheet's SPEAKER names into a stable N-character voice CASTING, replacing the
 * legacy 2-gendered-voice limit. Pure + env-driven (no heavy imports) so it is trivially unit-testable.
 *
 *   inferCastingTraits(speaker, direction) → { gender, ageBand }  (keyword-based, KA + EN)
 *   voicePool(traits)                      → ordered ElevenLabs voice IDs from env slots (persona → gender → base)
 *   castRoster(turns)                      → a DETERMINISTIC speaker → { gender, ageBand, voiceId } map: each
 *                                            distinct character gets ONE stable voice, and distinct characters
 *                                            of the same profile get DIFFERENT pool voices (round-robin) when
 *                                            more voice IDs are configured — the "casting profile seed".
 *
 * Env voice slots (all optional; the code degrades gracefully as they are added):
 *   ELEVENLABS_VOICE_ID_MALE / _FEMALE          — base gendered voices (existing)
 *   ELEVENLABS_VOICE_ID_{MALE,FEMALE}_2.._6     — extra same-gender voices → distinct same-gender characters
 *   ELEVENLABS_VOICE_ID_CHILD[_2..]             — child voices
 *   ELEVENLABS_VOICE_ID_ELDERLY_{MALE,FEMALE}   — aged voices
 *   ELEVENLABS_GEORGIAN_VOICE_ID / ELEVENLABS_VOICE_ID — shared fallbacks
 *
 * This module NEVER touches TTS settings — the ElevenLabs stability invariant (0.48, lib/audio/tts-model.ts)
 * is entirely separate from voice-ID selection.
 */
export type Gender = 'male' | 'female';
export type AgeBand = 'adult' | 'child' | 'elderly';
export interface CastingTraits { gender: Gender; ageBand: AgeBand }
export interface CastTurn { speaker: string; text: string; direction?: string | null }
export interface Casting extends CastingTraits { voiceId: string | null }

/** The reserved speaker label for folded VO narrator turns (see masterDialogueTurns). */
export const NARRATOR_SPEAKER = 'NARRATOR';

const RX = {
  elderly: /grand\s?(?:mother|father|ma|pa)|granny|grandpa|\belder(?:ly)?\b|\bold\s+(?:man|woman)\b|veteran|ბებ|ბაბუ|მოხუც|ვეტერან/i,
  child: /\b(?:child|kid|baby|toddler|infant)\b|\blittle\s+(?:boy|girl)\b|ბავშვ|პატარა|ბიჭუნა|ღიღინა/i,
  female: /\b(?:woman|women|female|mother|mom|mum|girl|lady|wife|daughter|sister|niece|aunt|queen|nurse|nino|nana|ana|mari|maia|tamar|keto)\b|ქალ|დედ|გოგო|ნინო|დეიდ|ცოლ|\bდა\b|მარ|ბებია/i,
  male: /\b(?:man|men|male|father|dad|boy|officer|recruit|soldier|grandfather|grandpa|student|king|husband|son|brother|guard|general|priest|uncle|nephew|veteran)\b|კაც|მამ|ბიჭ|ჯარისკაც|ოფიცერ|სტუდენტ|ბაბუ|ვაჟ|ძმ|ბიძ/i,
};

/** Infer a character's gender + age band from the speaker name (+ optional direction), KA + EN keywords. */
export function inferCastingTraits(speaker: string, direction?: string | null): CastingTraits {
  const s = `${speaker ?? ''} ${direction ?? ''}`.trim();
  const ageBand: AgeBand = RX.child.test(s) ? 'child' : RX.elderly.test(s) ? 'elderly' : 'adult';
  const gender: Gender = RX.female.test(s) ? 'female' : RX.male.test(s) ? 'male' : 'female';
  return { gender, ageBand };
}

function envVoice(name: string): string | null {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Base slot + its numbered siblings (_2.._6), in order, filtered to configured values. */
function scan(prefix: string): string[] {
  const out: string[] = [];
  const base = envVoice(prefix);
  if (base) out.push(base);
  for (let i = 2; i <= 6; i++) { const v = envVoice(`${prefix}_${i}`); if (v) out.push(v); }
  return out;
}

/** Ordered voice-ID pool for a profile: persona-specific slots → gender base → shared fallbacks. De-duped. */
export function voicePool(traits: CastingTraits): string[] {
  const G = traits.gender.toUpperCase(); // MALE | FEMALE
  const pool: string[] = [];
  if (traits.ageBand === 'child') pool.push(...scan('ELEVENLABS_VOICE_ID_CHILD'));
  if (traits.ageBand === 'elderly') pool.push(...scan(`ELEVENLABS_VOICE_ID_ELDERLY_${G}`), ...scan('ELEVENLABS_VOICE_ID_ELDERLY'));
  pool.push(...scan(`ELEVENLABS_VOICE_ID_${G}`));
  const fallback = [envVoice('ELEVENLABS_GEORGIAN_VOICE_ID'), envVoice('ELEVENLABS_VOICE_ID')].filter((x): x is string => !!x);
  return [...new Set([...pool, ...fallback])];
}

/**
 * Deterministic casting: each DISTINCT speaker (first-seen order) → one stable voice from its profile's pool.
 * Distinct characters sharing a profile advance a per-profile cursor, so they land on DIFFERENT pool voices
 * when the pool has more than one — and always the SAME voice for the same character. Fully deterministic.
 */
export function castRoster(turns: readonly CastTurn[]): Map<string, Casting> {
  const roster = new Map<string, Casting>();
  const cursor = new Map<string, number>();
  for (const t of turns ?? []) {
    const key = (t?.speaker ?? '').trim().toLowerCase();
    if (!key || roster.has(key)) continue;
    const traits = inferCastingTraits(t.speaker, t.direction);
    const pool = voicePool(traits);
    const sig = `${traits.gender}:${traits.ageBand}`;
    const idx = cursor.get(sig) ?? 0;
    cursor.set(sig, idx + 1);
    const voiceId = pool.length ? (pool[idx % pool.length] ?? null) : null;
    roster.set(key, { ...traits, voiceId });
  }
  return roster;
}

/** A synthesized turn: the resolved voice + gender for a speaker's line. */
export interface VoicedTurn { speaker: string; text: string; voiceId: string | null; gender: Gender }

/**
 * Prepare voiced turns for synthesis: merge consecutive lines from the SAME speaker+voice into one breath,
 * then bound the list to `cap` turns WITHOUT dropping the narrator VO spine.
 *
 * - The merge keys on SPEAKER identity (not just the resolved voice): two DISTINCT characters that happen to
 *   share a pooled voice keep their own turn boundaries (a natural pause), and a folded-in narrator never
 *   welds onto an adjacent same-voice character line. A monologue authored as many sub-lines by ONE speaker
 *   still collapses to one breath (the point of the merge).
 * - The cap RESERVES narrator turns (speaker === NARRATOR_SPEAKER) and fills the remaining slots with the
 *   other turns in order, so a long dialogue sheet can't truncate the narration past the cap.
 *
 * Pure + order-preserving (does not mutate the input).
 */
export function collapseVoicedTurns<T extends VoicedTurn>(voiced: readonly T[], cap: number): T[] {
  const merged: T[] = [];
  for (const v of voiced ?? []) {
    const last = merged[merged.length - 1];
    if (last && last.speaker === v.speaker && last.voiceId === v.voiceId && last.gender === v.gender) {
      last.text = `${last.text} ${v.text}`.trim();
    } else {
      merged.push({ ...v });
    }
  }
  if (cap <= 0) return [];
  if (merged.length <= cap) return merged;
  const isNarrator = (v: T) => v.speaker.trim().toLowerCase() === NARRATOR_SPEAKER.toLowerCase();
  const narrator = merged.filter(isNarrator);
  const rest = merged.filter((v) => !isNarrator(v)).slice(0, Math.max(0, cap - narrator.length));
  const keep = new Set<T>([...narrator, ...rest]);
  return merged.filter((v) => keep.has(v)); // preserve original (timecode) order
}
