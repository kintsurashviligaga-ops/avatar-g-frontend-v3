/**
 * lib/chat/sfxTriggers.ts
 * =======================
 * PHASE 25 (VECTOR 1) — contextual SFX keyword enrichment. PURE, zero-dependency, zero-network,
 * zero-LLM. It augments the EXISTING per-scene SFX cue text with a precise, curated sound phrase for
 * high-impact domain nouns (stadium/goal/gunshot/explosion/storm/birds/ocean…) BEFORE the brief reaches
 * synthesizeSfx() (ElevenLabs Sound Generation). It does NOT touch the synth, the upload, the ffmpeg
 * mix, or the ducking filtergraph — the intensity hint is a lexical signal inside the EL prompt, not a
 * mix parameter, so the -12dB duck under speech/vocals is unchanged.
 *
 * Why: the Director Agent already writes good per-scene cues when it runs; the GAP is the path where the
 * Prompt Agent is bypassed (pre-baked sceneScripts) and the SFX brief falls back to the raw user message
 * ("make a football film") → a generic soundscape. This lookup table fills exactly that gap.
 */

export interface SfxTrigger {
  pattern: RegExp;
  cue: string;
  intensity: 'soft' | 'medium' | 'loud';
}

/** Curated, CLOSED set (no user input ever constructs a RegExp). Ordered most-specific → generic. */
export const SFX_TRIGGERS: SfxTrigger[] = [
  { pattern: /\b(goal|scored|penalty)\b/i, cue: 'stadium eruption, crowd cheering, airhorn blast', intensity: 'loud' },
  { pattern: /\b(stadium|football|soccer|match|liga)\b/i, cue: 'stadium crowd roar, distant chants, referee whistle, boot striking ball', intensity: 'loud' },
  { pattern: /\b(explos\w*|blast|detonat\w*|grenade|bomb)\b/i, cue: 'deep explosion boom, debris scatter, low rumble', intensity: 'loud' },
  { pattern: /\b(gun|gunshot|pistol|rifle|sniper|gunfire)\b/i, cue: 'sharp gunshot crack, short reverb tail, distant echo', intensity: 'loud' },
  { pattern: /\b(applause|ovation|clapping)\b/i, cue: 'sustained crowd applause, cheering', intensity: 'medium' },
  { pattern: /\b(crowd|audience|concert|festival|rally)\b/i, cue: 'large crowd murmur, distant applause, festival ambience', intensity: 'medium' },
  { pattern: /\b(storm|hurricane|gale|blizzard)\b/i, cue: 'howling wind gusts, driving rain, low thunder rumble', intensity: 'loud' },
  { pattern: /\b(rain|downpour|drizzle|thunder)\b/i, cue: 'rain on rooftops and glass, rolling thunder, water dripping', intensity: 'medium' },
  { pattern: /\b(wind|breeze|gust)\b/i, cue: 'wind gusts, leaves rustling', intensity: 'soft' },
  { pattern: /\b(birds?|birdsong|dawn|forest|jungle)\b/i, cue: 'birdsong dawn chorus, leaves rustling, light breeze', intensity: 'soft' },
  { pattern: /\b(ocean|sea|waves?|beach|shore|surf)\b/i, cue: 'ocean waves breaking, seagulls, wet sand footsteps', intensity: 'medium' },
  { pattern: /\b(fire|flame|burning|campfire|blaze)\b/i, cue: 'crackling fire, wood popping, ember ambience', intensity: 'medium' },
  { pattern: /\b(city|street|traffic|urban|downtown)\b/i, cue: 'city street ambience, distant traffic, passing cars', intensity: 'soft' },
  { pattern: /\b(car|engine|race|racing|motor)\b/i, cue: 'revving engine, tyres on tarmac, whooshing pass-by', intensity: 'medium' },
];

const INTENSITY_WORD: Record<SfxTrigger['intensity'], string> = {
  soft: 'subtle',
  medium: 'clear',
  loud: 'powerful, dominant',
};

/**
 * Prepend the matched trigger cues (+ one intensity word for the strongest match) to the existing SFX
 * text. No match → returns the input UNCHANGED. Clamped to ≤280 chars (matches synthesizeSfx's
 * brief.slice(0,280) so nothing is silently truncated downstream). Pure → unit-testable.
 */
export function enrichSfxBrief(text: string): string {
  const src = (text || '').trim();
  if (!src) return src;
  const hits: SfxTrigger[] = [];
  const seen = new Set<string>();
  for (const t of SFX_TRIGGERS) {
    if (t.pattern.test(src) && !seen.has(t.cue)) {
      hits.push(t);
      seen.add(t.cue);
    }
  }
  if (hits.length === 0) return src;
  const rank: Record<SfxTrigger['intensity'], number> = { loud: 3, medium: 2, soft: 1 };
  const strongest = hits.reduce((a, b) => (rank[b.intensity] > rank[a.intensity] ? b : a));
  const prefix = `${hits.map((h) => h.cue).join(', ')} (${INTENSITY_WORD[strongest.intensity]})`;
  return `${prefix}. ${src}`.slice(0, 280);
}
