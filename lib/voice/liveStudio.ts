/**
 * lib/voice/liveStudio.ts — how a voice request's settings land on the studio's real controls.
 *
 * The model speaks in loose terms ("vertical", "30 seconds", "watercolor"); the studio's panels offer fixed choices (a
 * video's lengths, music's 15/30/60/90 s or the full song, the image style list). These pure helpers map one onto the
 * other — and say what was actually applied, so the model never claims "24 seconds" when the panel took 8.
 * Used by OmniStudio's Live listener; unit-tested in liveStudio.test.ts.
 */

export type VideoOrientation = 'landscape' | 'vertical' | 'square' | 'portrait';

/** A frame shape → the video panel's orientation (it has four; 3:4 and 4:3 go to their nearest). */
export function videoOrientationFor(aspect: string): VideoOrientation | null {
  switch (aspect) {
    case '16:9': case '4:3': return 'landscape';
    case '9:16': return 'vertical';
    case '1:1': return 'square';
    case '4:5': case '3:4': return 'portrait';
    default: return null;
  }
}

/** The video panel's orientation → the frame shape it renders. */
export function aspectForOrientation(o: VideoOrientation): string {
  return o === 'landscape' ? '16:9' : o === 'vertical' ? '9:16' : o === 'square' ? '1:1' : '4:5';
}

export const MUSIC_LENGTHS = [15, 30, 60, 90] as const;
export type MusicLength = 0 | (typeof MUSIC_LENGTHS)[number];

/** Seconds → the music panel's nearest length; anything past 90 s is the full song (0). */
export function snapMusicSeconds(sec: number): MusicLength {
  if (!Number.isFinite(sec)) return 30;
  if (sec > 100) return 0;
  let best: MusicLength = MUSIC_LENGTHS[0];
  for (const l of MUSIC_LENGTHS) if (Math.abs(l - sec) < Math.abs(best - sec)) best = l;
  return best;
}

/** Common spoken words for a style, in the three languages, → the panel's canonical name. */
const STYLE_SYNONYMS: Readonly<Record<string, string>> = {
  realistic: 'photorealistic', photo: 'photorealistic', photographic: 'photorealistic', 'რეალისტური': 'photorealistic',
  'реалистичный': 'photorealistic', film: 'cinematic', movie: 'cinematic', 'კინო': 'cinematic', 'кино': 'cinematic',
  'კინემატოგრაფიული': 'cinematic', 'кинематографичный': 'cinematic', 'ანიმე': 'anime', 'аниме': 'anime',
  'აკვარელი': 'watercolor', 'акварель': 'watercolor', watercolour: 'watercolor', '3d': '3d render', 'oil': 'oil painting',
  'ზეთი': 'oil painting', 'масло': 'oil painting', pixel: 'pixel art', 'documentary': 'documentary', 'დოკუმენტური': 'documentary',
  'документальный': 'documentary', 'ჰორორი': 'horror', 'ужасы': 'horror', 'რომანტიკული': 'romantic', 'романтичный': 'romantic',
};

/**
 * A spoken style → one of `options` (case-insensitive; exact, synonym, then a word that contains or is contained), or null
 * when nothing on the panel is close — the caller then leaves the panel alone and tells the model so.
 */
export function matchStyle(spoken: string, options: readonly string[]): string | null {
  const raw = spoken.trim().toLowerCase();
  if (!raw) return null;
  const want = STYLE_SYNONYMS[raw] ?? raw;
  const byLower = new Map(options.map((o) => [o.toLowerCase(), o]));
  if (byLower.has(want)) return byLower.get(want)!;
  for (const [lower, o] of byLower) {
    if (lower === 'auto') continue;
    if (lower.includes(want) || (want.length >= 4 && want.includes(lower))) return o;
  }
  return null;
}
