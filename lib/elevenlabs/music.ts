import 'server-only';

// ElevenLabs Music — the v330 master audio layer. Unlike the legacy Udio path
// (async start → workId → poll), ElevenLabs Music returns the finished track
// SYNCHRONOUSLY as audio bytes from POST /v1/music, so it slots in at the
// assemble step (where the MusicGen fallback already runs synchronously) with no
// poll machinery. force_instrumental toggles a sung song (music video) vs. an
// instrumental score (narrative film). Docs: https://elevenlabs.io/docs/api-reference/music
const EL_MUSIC_URL = 'https://api.elevenlabs.io/v1/music';

/** True when an ElevenLabs key is configured (Music shares the account key). */
export function hasElevenLabsMusicKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean((env.ELEVENLABS_API_KEY || '').trim());
}

export interface ComposeMusicInput {
  prompt: string;
  /** Track length in ms; clamped to the API's 3,000–600,000 ms window. */
  lengthMs: number;
  /** force_instrumental — true for a vocal-free score, false (default) for a sung song. */
  instrumental?: boolean;
  modelId?: 'music_v1' | 'music_v2';
  signal?: AbortSignal;
}

export interface ComposeMusicResult {
  audio: Buffer;
  contentType: string;
}

/**
 * Compose a complete track (sung vocals + backing, or instrumental) via ElevenLabs
 * Music. Returns the raw MP3 bytes. Throws on a missing key, a non-200, or an empty
 * body so the caller can fall back (MusicGen) and the film is never silently broken.
 */
export async function composeElevenLabsMusic(input: ComposeMusicInput): Promise<ComposeMusicResult> {
  const key = (process.env.ELEVENLABS_API_KEY || '').trim();
  if (!key) throw new Error('ELEVENLABS_API_KEY is not configured');
  const music_length_ms = Math.max(3_000, Math.min(600_000, Math.round(input.lengthMs)));
  const res = await fetch(EL_MUSIC_URL, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      prompt: input.prompt.slice(0, 2_000),
      music_length_ms,
      model_id: input.modelId ?? 'music_v1',
      output_format: 'mp3_44100_128',
      ...(input.instrumental ? { force_instrumental: true } : {}),
    }),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ElevenLabs Music ${res.status}: ${detail.slice(0, 300)}`);
  }
  const audio = Buffer.from(await res.arrayBuffer());
  if (audio.length < 1_024) throw new Error('ElevenLabs Music returned an empty track');
  return { audio, contentType: 'audio/mpeg' };
}

/**
 * Build an ElevenLabs Music prompt + instrumental flag from a film brief. Mirrors the
 * genre / vocalist / lyric-language / mood detection used for the legacy Udio request
 * so a music video gets a real sung song and a narrative film gets a cohesive score.
 */
export function buildElevenMusicPrompt(o: { brief: string; totalSec: number; musicVideoMode?: boolean; vocalGender?: 'male' | 'female' }): {
  prompt: string;
  instrumental: boolean;
} {
  const brief = (o.brief || '').trim();
  const lower = brief.toLowerCase();
  const isMusicVideo =
    o.musicVideoMode === true ||
    /\bmusic video\b/.test(lower) ||
    (/\bmusic\b|\bsong\b|\bbeat\b|\bvocal|\br&b\b|\brnb\b|\bpop\b|\bhip[- ]?hop\b/.test(lower) && /\bsing|\bsinger\b|\bvocal|\blyric/.test(lower)) ||
    /მუსიკალური ვიდეო|სიმღერ|მომღერ/.test(brief);

  if (!isMusicVideo) {
    return {
      prompt:
        `Fully-instrumental cinematic film score for a ${o.totalSec}-second short film. ` +
        `Match the era, mood and intensity of: "${brief.slice(0, 400)}". Orchestral, emotional, ` +
        `with a clear dynamic arc — a quiet build that swells and resolves. No vocals, no lyrics.`,
      instrumental: true,
    };
  }

  const genre =
    /\br&b\b|\brnb\b/.test(lower) ? 'R&B' :
    /hip[- ]?hop|\brap\b/.test(lower) ? 'hip-hop' :
    /\bfolk[- ]?pop\b/.test(lower) ? 'folk-pop' :
    /\bpop\b/.test(lower) ? 'pop' :
    /\brock\b/.test(lower) ? 'rock' :
    /\belectronic|\bedm\b|\bsynth/.test(lower) ? 'electronic' : 'pop';
  // Explicit selector wins; otherwise infer from the brief (default male tenor).
  const female = o.vocalGender ? o.vocalGender === 'female' : (/\bwoman\b|\bfemale\b|\bgirl\b|\bher\b|\bshe\b/.test(lower) || /ქალ|გოგო/.test(brief));
  const vocalist = female ? 'a powerful female lead vocalist' : 'a powerful male tenor lead vocalist';
  const georgian = /\bgeorgian\b/.test(lower) || /ქართ/.test(brief);
  const lyricLang = georgian ? 'sung in Georgian' : 'sung lyrics';
  const moody = /\bmoody\b|\bnight\b|\bneon\b|atmospheric|\bdark\b/.test(lower) || /ღამ|ნეონ/.test(brief);

  return {
    prompt:
      `An original ${genre} song for a ${o.totalSec}-second music video, with ${vocalist} ${lyricLang}. ` +
      `${moody ? 'Moody, atmospheric, ' : ''}modern studio production, a catchy hook, and a clear lead vocal on top. ` +
      `Theme: "${brief.slice(0, 300)}".`,
    instrumental: false,
  };
}
