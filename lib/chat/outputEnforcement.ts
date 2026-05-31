/**
 * lib/chat/outputEnforcement.ts
 * =============================
 * PHASE 52 TASK 5 — Strict Input-Prompt Mirroring & Agent Obedience.
 *
 * THE PROBLEM
 * -----------
 * Generation providers are probabilistic. A user types "anamorphic widescreen
 * techno trailer" and the model, left to its own devices, drifts: the score
 * comes back ambient, the frame comes back portrait. The user's words are the
 * brief — they must behave as un-bypassable context anchors, not loose
 * suggestions the sampler is free to ignore.
 *
 * THE FIX
 * -------
 * A deterministic, dependency-free keyword→operational-variable mapper. Before
 * a payload is transmitted to Udio (music), Replicate/LTX (video) or ElevenLabs
 * (voice), we mine the prompt for the directives the provider exposes as hard
 * parameters and FORCE them into the request — overriding a contradictory or
 * absent default. What the user typed is replicated inside the final asset.
 *
 * This module calls no provider and performs no IO → it is exhaustively
 * unit-testable without ever touching a paid render path. Each extractor takes
 * the raw prompt and returns the explicit variables the caller must apply.
 */

// ─── Shared helpers ────────────────────────────────────────────────────────

type Rule = { canonical: string; patterns: RegExp[] };

function rules(entries: Array<[string, string[]]>): Rule[] {
  return entries.map(([canonical, words]) => ({
    canonical,
    patterns: words.map((w) => new RegExp(`(?:^|[^a-z0-9])${w}(?:[^a-z0-9]|$)`, 'i')),
  }));
}

function firstMatch(text: string, rs: Rule[]): string | null {
  for (const r of rs) {
    if (r.patterns.some((re) => re.test(text))) return r.canonical;
  }
  return null;
}

function allMatches(text: string, rs: Rule[]): string[] {
  const out: string[] = [];
  for (const r of rs) {
    if (r.patterns.some((re) => re.test(text))) out.push(r.canonical);
  }
  return out;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

// ─── MUSIC (Udio) ────────────────────────────────────────────────────────────

export interface MusicDirectives {
  /** Canonical genre keywords lifted verbatim from the prompt (techno, jazz…). */
  genres: string[];
  /** Tempo descriptors (uptempo, 128 bpm, slow ballad…). */
  tempo: string[];
  /** Mood / energy descriptors (dark, euphoric, melancholic…). */
  moods: string[];
  /** Instrumentation cues (synth, orchestral, acoustic guitar…). */
  instruments: string[];
  /** True when the prompt explicitly asks for an instrumental / no-vocals track. */
  forceInstrumental: boolean;
  /** True when the prompt explicitly asks for vocals / lyrics / singing. */
  forceVocal: boolean;
  /** All style anchors joined into one comma list for the Udio `style` field. */
  styleTags: string[];
}

const MUSIC_GENRE = rules([
  ['techno', ['techno']],
  ['house', ['house', 'deep house', 'tech house']],
  ['trance', ['trance', 'psytrance']],
  ['drum and bass', ['drum and bass', 'dnb', 'd&b', 'jungle']],
  ['dubstep', ['dubstep', 'brostep']],
  ['edm', ['edm', 'electro', 'electronic dance']],
  ['hip hop', ['hip hop', 'hip-hop', 'rap', 'trap', 'boom bap', 'drill']],
  ['lo-fi', ['lo-fi', 'lofi', 'chillhop']],
  ['ambient', ['ambient', 'drone music']],
  ['cinematic score', ['cinematic score', 'film score', 'epic score', 'trailer music']],
  ['orchestral', ['orchestral', 'symphonic', 'orchestra']],
  ['rock', ['rock', 'hard rock', 'punk', 'grunge']],
  ['metal', ['metal', 'heavy metal', 'death metal', 'metalcore']],
  ['pop', ['pop', 'synthpop', 'electropop', 'k-pop']],
  ['jazz', ['jazz', 'bebop', 'swing']],
  ['blues', ['blues', 'rhythm and blues', 'r&b', 'rnb', 'soul']],
  ['funk', ['funk', 'funky']],
  ['disco', ['disco']],
  ['reggae', ['reggae', 'dub', 'dancehall']],
  ['classical', ['classical', 'baroque', 'piano sonata']],
  ['folk', ['folk', 'acoustic', 'singer-songwriter']],
  ['country', ['country', 'bluegrass', 'americana']],
  ['georgian folk', ['georgian folk', 'polyphonic', 'qartuli', 'sakartvelo']],
]);

const MUSIC_TEMPO = rules([
  ['uptempo', ['uptempo', 'fast', 'high tempo', 'driving', 'banging', 'high energy', 'energetic']],
  ['downtempo', ['downtempo', 'slow', 'mellow', 'laid back', 'laid-back', 'chill', 'relaxed']],
  ['mid-tempo', ['mid tempo', 'mid-tempo', 'moderate tempo', 'groovy']],
]);

const MUSIC_MOOD = rules([
  ['dark', ['dark', 'gritty', 'menacing', 'ominous', 'sinister']],
  ['euphoric', ['euphoric', 'uplifting', 'anthemic', 'triumphant', 'epic']],
  ['melancholic', ['melancholic', 'sad', 'somber', 'wistful', 'emotional']],
  ['dreamy', ['dreamy', 'ethereal', 'atmospheric', 'lush']],
  ['aggressive', ['aggressive', 'intense', 'heavy', 'hard-hitting']],
  ['romantic', ['romantic', 'tender', 'sensual', 'intimate']],
  ['happy', ['happy', 'joyful', 'cheerful', 'feel good', 'feel-good', 'sunny']],
]);

const MUSIC_INSTRUMENT = rules([
  ['synthesizer', ['synth', 'synths', 'synthesizer', 'analog synth']],
  ['808 bass', ['808', '808s', 'sub bass', 'subbass']],
  ['electric guitar', ['electric guitar', 'guitar riff', 'shredding']],
  ['acoustic guitar', ['acoustic guitar', 'fingerpicked']],
  ['piano', ['piano', 'grand piano', 'keys']],
  ['strings', ['strings', 'violin', 'cello', 'string section']],
  ['brass', ['brass', 'trumpet', 'saxophone', 'sax', 'horns']],
  ['drum machine', ['drum machine', '909', '707', 'tr-808']],
  ['percussion', ['percussion', 'tribal drums', 'congas', 'bongos']],
  ['choir', ['choir', 'choral', 'vocal pads']],
]);

const INSTRUMENTAL_RE = /(?:^|[^a-z])(instrumental|no vocals|no lyrics|without vocals|without lyrics|karaoke|backing track)(?:[^a-z]|$)/i;
const VOCAL_RE = /(?:^|[^a-z])(vocals?|lyrics|sung|singing|singer|vocalist|rapper|choir|verse|chorus|hook|with words)(?:[^a-z]|$)/i;

/**
 * Mine a music prompt for the directives Udio exposes as hard style anchors.
 * The caller folds `styleTags` into the Udio `style` field and applies
 * `forceInstrumental` to `make_instrumental` so the genre/tempo/mood the user
 * typed cannot be quietly swapped for a generic bed.
 */
export function extractMusicDirectives(prompt: string): MusicDirectives {
  const text = String(prompt || '');
  const genres = allMatches(text, MUSIC_GENRE);
  const tempo = allMatches(text, MUSIC_TEMPO);
  const moods = allMatches(text, MUSIC_MOOD);
  const instruments = allMatches(text, MUSIC_INSTRUMENT);
  const forceInstrumental = INSTRUMENTAL_RE.test(text);
  const forceVocal = !forceInstrumental && VOCAL_RE.test(text);

  // Order matters for the provider: genre first (the strongest anchor), then
  // mood, tempo and instrumentation refine it.
  const styleTags = dedupe([...genres, ...moods, ...tempo, ...instruments]);

  return { genres, tempo, moods, instruments, forceInstrumental, forceVocal, styleTags };
}

/**
 * Merge mined style anchors with any caller-supplied style string, putting the
 * user's typed keywords FIRST so the provider weights them highest. Returns a
 * single comma-joined string (or undefined when there is nothing to send).
 */
export function buildEnforcedMusicStyle(
  prompt: string,
  existingStyle?: string,
  existingTags?: string[],
): { style: string | undefined; styleTags: string[]; forceInstrumental: boolean } {
  const d = extractMusicDirectives(prompt);
  const supplied = dedupe([
    ...(existingStyle ? existingStyle.split(/[,;]/) : []),
    ...(existingTags ?? []),
  ]);
  const merged = dedupe([...d.styleTags, ...supplied]);
  return {
    style: merged.length > 0 ? merged.join(', ') : (existingStyle?.trim() || undefined),
    styleTags: merged,
    forceInstrumental: d.forceInstrumental,
  };
}

// ─── VIDEO (LTX / Replicate) — aspect / orientation lock ──────────────────────

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '4:5' | '2.39:1';

const ASPECT_RULES: Array<{ ratio: AspectRatio; patterns: RegExp[] }> = [
  {
    ratio: '9:16',
    patterns: [
      /(?:^|[^a-z0-9])(vertical|portrait|9:16|9x16)(?:[^a-z0-9]|$)/i,
      /(?:^|[^a-z0-9])(reels?|tiktok|tik tok|shorts?|story|stories)(?:[^a-z0-9]|$)/i,
    ],
  },
  {
    ratio: '2.39:1',
    patterns: [
      /(?:^|[^a-z0-9])(anamorphic|cinemascope|cinema scope|2\.39:1|2\.35:1|2\.40:1|ultrawide|ultra-wide|ultra wide)(?:[^a-z0-9]|$)/i,
    ],
  },
  {
    ratio: '1:1',
    patterns: [/(?:^|[^a-z0-9])(square|1:1|1x1)(?:[^a-z0-9]|$)/i],
  },
  {
    ratio: '4:5',
    patterns: [/(?:^|[^a-z0-9])(4:5|4x5|instagram portrait)(?:[^a-z0-9]|$)/i],
  },
  {
    ratio: '16:9',
    patterns: [
      /(?:^|[^a-z0-9])(16:9|16x9|widescreen|wide screen|landscape|horizontal|cinematic wide)(?:[^a-z0-9]|$)/i,
    ],
  },
];

/**
 * Detect an EXPLICIT orientation/aspect directive in the prompt text. Returns
 * null when the prompt says nothing about framing (so the caller's own default
 * / UI selection wins). When the user DID state a frame, that wins over a
 * contradictory default — "anamorphic" never silently becomes portrait.
 *
 * Vertical / portrait is checked first because "vertical cinematic" should
 * resolve to 9:16 (the explicit orientation), not 16:9 (the softer "cinematic"
 * cue) — orientation nouns are higher-signal than aesthetic adjectives.
 */
export function extractAspectDirective(prompt: string): AspectRatio | null {
  const text = String(prompt || '');
  for (const rule of ASPECT_RULES) {
    if (rule.patterns.some((re) => re.test(text))) return rule.ratio;
  }
  return null;
}

// ─── VOICE (ElevenLabs) — delivery lock ───────────────────────────────────────

export interface VoiceDirectives {
  /** Explicit language ask (georgian, english, russian) when stated. */
  language: 'ka' | 'en' | 'ru' | null;
  /** Delivery pace lifted from the prompt. */
  cadence: 'slow' | 'fast' | 'measured' | null;
  /** Emotional delivery (calm, excited, authoritative…). */
  emotion: string | null;
  /**
   * Suggested ElevenLabs voice_settings derived from the directives. `stability`
   * rises for measured/authoritative delivery and falls for excited/expressive;
   * `style` rises with emotional intensity. Always within ElevenLabs' 0–1 range.
   */
  voiceSettings: { stability: number; similarity_boost: number; style: number };
}

const VOICE_LANG = rules([
  ['ka', ['georgian', 'kartuli', 'ქართულ', 'sakartvelo']],
  ['ru', ['russian', 'русск']],
  ['en', ['english', 'in english']],
]);

const VOICE_EMOTION = rules([
  ['excited', ['excited', 'energetic', 'enthusiastic', 'hyped', 'upbeat']],
  ['calm', ['calm', 'soothing', 'gentle', 'relaxed', 'soft-spoken']],
  ['authoritative', ['authoritative', 'commanding', 'confident', 'assertive', 'serious']],
  ['warm', ['warm', 'friendly', 'inviting', 'reassuring']],
  ['dramatic', ['dramatic', 'intense', 'emotional', 'powerful']],
]);

/**
 * Mine a voice/TTS prompt for delivery directives and translate them into
 * concrete ElevenLabs voice_settings so the synthesized read MATCHES the asked
 * tone (a "calm, measured narration" is not delivered hyperactively).
 */
export function extractVoiceDirectives(prompt: string): VoiceDirectives {
  const text = String(prompt || '');
  const language = (firstMatch(text, VOICE_LANG) as 'ka' | 'en' | 'ru' | null);

  let cadence: VoiceDirectives['cadence'] = null;
  if (/(?:^|[^a-z])(fast|rapid|quick|brisk|frantic|snappy)(?:[^a-z]|$)/i.test(text)) cadence = 'fast';
  else if (/(?:^|[^a-z])(slow|measured|deliberate|drawn out|drawn-out|unhurried)(?:[^a-z]|$)/i.test(text)) cadence = 'slow';
  else if (/(?:^|[^a-z])(steady|even|moderate|measured)(?:[^a-z]|$)/i.test(text)) cadence = 'measured';

  const emotion = firstMatch(text, VOICE_EMOTION);

  // Map directives → ElevenLabs voice_settings. Baseline is the platform's
  // balanced default; directives nudge stability/style deterministically.
  let stability = 0.5;
  let style = 0.3;
  if (emotion === 'calm' || emotion === 'authoritative' || cadence === 'slow' || cadence === 'measured') {
    stability = 0.75; // steadier, less wobble for composed delivery
  }
  if (emotion === 'excited' || emotion === 'dramatic' || cadence === 'fast') {
    stability = 0.3; // more expressive variation
    style = 0.6;
  }
  if (emotion === 'warm') style = 0.45;

  return {
    language,
    cadence,
    emotion,
    voiceSettings: {
      stability: Math.max(0, Math.min(1, stability)),
      similarity_boost: 0.85,
      style: Math.max(0, Math.min(1, style)),
    },
  };
}
