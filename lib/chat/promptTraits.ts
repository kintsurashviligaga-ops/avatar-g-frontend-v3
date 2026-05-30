/**
 * lib/chat/promptTraits.ts
 * ========================
 * PHASE 40 §2 / PHASE 41 §4 — Cognitive Prompt Deep-Exploitation Matrix.
 *
 * A deterministic, dependency-free extractor that mines a user's free-text
 * generation prompt for the high-signal directorial parameters our media
 * providers (LTX video, HeyGen avatar, Udio audio) can exploit. The previous
 * payload builders ignored almost all of this nuance and fell back to shallow
 * defaults (`generate_audio: false`, no camera/style/tone), so a richly worded
 * prompt produced a flat, silent clip.
 *
 * This module does NOT call any provider. It is a pure transform:
 *   extractPromptTraits(prompt) -> PromptTraits
 *   enrichVideoPrompt(prompt, traits) -> string   (safe, capped, deduped)
 *
 * Keeping it pure makes the matrix exhaustively unit-testable without ever
 * touching a paid render path.
 */

export interface PromptTraits {
  /** Camera moves the user described (dolly, orbit, pan, crane, handheld…). */
  cameraMotion: string[];
  /** Visual aesthetic / genre cues (cinematic, noir, cyberpunk, anime…). */
  aesthetic: string[];
  /** Lighting descriptors (golden hour, soft studio, neon, low-key…). */
  lighting: string[];
  /** Emotional tone / mood (dramatic, joyful, melancholic, intense…). */
  emotionalTone: string[];
  /** Delivery cadence for speech/lip-sync (slow, fast, measured). */
  cadence: 'slow' | 'fast' | 'measured' | null;
  /** Acoustic asks (cinematic sound, orchestral score, dialogue, sfx…). */
  audioCues: string[];
  /** Things to suppress, folded into a negative clause (blur, watermark…). */
  negativeCues: string[];
  /**
   * Whether an audio track should be generated. True when the prompt has any
   * explicit acoustic marker, or when the caller opts into an audio-default
   * context (e.g. @Film / @Avatar cinematic requests).
   */
  wantsAudio: boolean;
}

type Lexicon = { canonical: string; patterns: RegExp[] };

function buildLexicon(entries: Array<[string, string[]]>): Lexicon[] {
  return entries.map(([canonical, words]) => ({
    canonical,
    patterns: words.map((w) => new RegExp(`\\b${w}\\b`, 'i')),
  }));
}

const CAMERA_LEXICON = buildLexicon([
  ['slow dolly-in', ['dolly in', 'dolly-in', 'push in', 'push-in']],
  ['dolly-out', ['dolly out', 'pull back', 'pull-back', 'zoom out']],
  ['orbiting camera', ['orbit', 'orbiting', 'arc shot', 'circle around']],
  ['sweeping pan', ['pan', 'panning', 'whip pan']],
  ['vertical tilt', ['tilt', 'tilting']],
  ['crane shot', ['crane', 'jib', 'boom shot']],
  ['tracking shot', ['tracking shot', 'follow shot', 'follow cam']],
  ['handheld motion', ['handheld', 'hand-held', 'shaky cam']],
  ['aerial drone shot', ['drone', 'aerial', 'birds eye', "bird's eye", 'overhead']],
  ['close-up', ['close up', 'close-up', 'closeup', 'macro']],
  ['wide establishing shot', ['wide shot', 'establishing shot', 'wide angle', 'wide-angle']],
  ['zoom-in', ['zoom in', 'zoom-in']],
]);

const AESTHETIC_LEXICON = buildLexicon([
  ['cinematic', ['cinematic', 'filmic', 'movie-like', 'hollywood']],
  ['film noir', ['noir', 'film noir']],
  ['cyberpunk', ['cyberpunk', 'neon-future', 'blade runner']],
  ['photorealistic', ['photorealistic', 'photo-realistic', 'hyperrealistic', 'lifelike']],
  ['anime', ['anime', 'manga']],
  ['documentary', ['documentary', 'docu-style']],
  ['vintage film', ['vintage', 'retro', 'analog film', '8mm', '16mm', 'super 8']],
  ['minimalist', ['minimalist', 'minimal']],
  ['surreal', ['surreal', 'dreamlike', 'ethereal']],
  ['epic fantasy', ['fantasy', 'epic', 'mythical']],
]);

const LIGHTING_LEXICON = buildLexicon([
  ['golden-hour light', ['golden hour', 'golden-hour', 'sunset light', 'sunrise light']],
  ['soft studio lighting', ['studio lighting', 'softbox', 'soft light', 'soft lighting']],
  ['neon lighting', ['neon']],
  ['low-key dramatic lighting', ['low key', 'low-key', 'chiaroscuro', 'dramatic lighting']],
  ['high-key bright lighting', ['high key', 'high-key', 'bright lighting']],
  ['volumetric god rays', ['volumetric', 'god rays', 'light rays']],
  ['backlit rim light', ['backlit', 'rim light', 'rim-light', 'silhouette']],
  ['moody ambient light', ['moody', 'ambient light', 'candlelight', 'firelight']],
]);

const TONE_LEXICON = buildLexicon([
  ['dramatic', ['dramatic', 'dramatically', 'intense', 'tense', 'powerful']],
  ['joyful', ['joyful', 'happy', 'cheerful', 'upbeat', 'playful']],
  ['melancholic', ['melancholic', 'sad', 'somber', 'wistful', 'sorrowful']],
  ['calm', ['calm', 'serene', 'peaceful', 'tranquil', 'gentle']],
  ['energetic', ['energetic', 'dynamic', 'vibrant', 'exciting', 'lively']],
  ['mysterious', ['mysterious', 'enigmatic', 'suspenseful', 'eerie']],
  ['romantic', ['romantic', 'tender', 'intimate', 'warm']],
  ['confident', ['confident', 'bold', 'assertive', 'commanding']],
  ['inspirational', ['inspirational', 'uplifting', 'motivational', 'hopeful']],
]);

const AUDIO_LEXICON = buildLexicon([
  ['cinematic sound design', ['cinematic sound', 'sound design', 'with sound', 'with audio']],
  ['orchestral score', ['orchestral', 'orchestra', 'symphonic', 'epic score', 'soundtrack', 'score']],
  ['ambient soundscape', ['ambient sound', 'soundscape', 'atmosphere', 'ambience', 'ambiance']],
  ['spoken dialogue', ['dialogue', 'dialog', 'speaking', 'speaks', 'narration', 'narrates', 'voiceover', 'voice-over', 'voice over']],
  ['sound effects', ['sound effects', 'sfx', 'foley']],
  ['musical background', ['background music', 'music', 'musical', 'song', 'melody', 'beat']],
]);

const NEGATIVE_LEXICON = buildLexicon([
  ['blur', ['no blur', 'without blur', 'sharp', 'avoid blur']],
  ['distortion', ['no distortion', 'undistorted', 'avoid distortion']],
  ['watermark', ['no watermark', 'without watermark', 'watermark-free']],
  ['text overlay', ['no text', 'without text', 'no captions', 'no subtitles']],
  ['low quality', ['no artifacts', 'high quality only', 'avoid artifacts', 'no grain']],
]);

// Audio is implied (even without an explicit cue word) for prompts that read as
// scripted/spoken or overtly cinematic — those are the ones a mute clip ruins.
const IMPLICIT_AUDIO_RE = /\b(cinematic|film|trailer|teaser|advert|commercial|monologue|presenter|anchor|host|narrat|speech|talking|tells?|says?)\b/i;

function collectMatches(text: string, lexicon: Lexicon[]): string[] {
  const out: string[] = [];
  for (const entry of lexicon) {
    if (entry.patterns.some((re) => re.test(text))) out.push(entry.canonical);
  }
  return out;
}

export function extractPromptTraits(
  prompt: string,
  opts: { defaultAudio?: boolean } = {},
): PromptTraits {
  const text = String(prompt || '');

  const cameraMotion = collectMatches(text, CAMERA_LEXICON);
  const aesthetic = collectMatches(text, AESTHETIC_LEXICON);
  const lighting = collectMatches(text, LIGHTING_LEXICON);
  const emotionalTone = collectMatches(text, TONE_LEXICON);
  const audioCues = collectMatches(text, AUDIO_LEXICON);
  const negativeCues = collectMatches(text, NEGATIVE_LEXICON);

  let cadence: PromptTraits['cadence'] = null;
  if (/\b(fast|rapid|quick|brisk|energetic|frantic)\b/i.test(text)) cadence = 'fast';
  else if (/\b(slow|measured|deliberate|drawn out|drawn-out)\b/i.test(text)) cadence = 'slow';
  else if (/\b(steady|even|moderate)\b/i.test(text)) cadence = 'measured';

  const wantsAudio =
    audioCues.length > 0 ||
    IMPLICIT_AUDIO_RE.test(text) ||
    Boolean(opts.defaultAudio);

  return {
    cameraMotion,
    aesthetic,
    lighting,
    emotionalTone,
    cadence,
    audioCues,
    negativeCues,
    wantsAudio,
  };
}

/**
 * Deterministically fold the extracted directorial traits back INTO the prompt
 * string. This is the universally-safe exploitation channel: every video
 * provider accepts a richer prompt, and we only append descriptors the prompt
 * does not already state (so we never duplicate the user's own wording).
 *
 * The result is hard-capped to `maxLength` (LTX accepts up to 1500 chars).
 */
export function enrichVideoPrompt(
  prompt: string,
  traits: PromptTraits,
  maxLength = 1500,
): string {
  const base = String(prompt || '').trim();
  const lower = base.toLowerCase();
  const clauses: string[] = [];

  const addClause = (label: string, values: string[]) => {
    const fresh = values.filter((v) => !lower.includes(v.toLowerCase()));
    if (fresh.length > 0) clauses.push(`${label}: ${fresh.join(', ')}`);
  };

  addClause('Camera', traits.cameraMotion);
  addClause('Style', traits.aesthetic);
  addClause('Lighting', traits.lighting);
  addClause('Mood', traits.emotionalTone);
  if (traits.wantsAudio) {
    const cues = traits.audioCues.length > 0 ? traits.audioCues : ['cinematic sound design'];
    addClause('Audio', cues);
  }
  if (traits.negativeCues.length > 0) {
    clauses.push(`Avoid: ${traits.negativeCues.join(', ')}`);
  }

  if (clauses.length === 0) return base.slice(0, maxLength);

  const enriched = `${base}\n\n${clauses.join('. ')}.`;
  return enriched.length <= maxLength ? enriched : enriched.slice(0, maxLength);
}
