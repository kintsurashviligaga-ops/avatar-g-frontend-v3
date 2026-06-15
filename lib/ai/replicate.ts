import Replicate from "replicate";

// useFileOutput:false → `replicate.run()` returns the model's RAW output (a plain
// URL string for MusicGen) instead of wrapping file outputs in a `FileOutput`
// stream object. On replicate SDK v1.x the default (true) returns FileOutput
// instances whose `String(...)` is NOT the URL ("[object Object]") — so the old
// `String(output[0])` produced a broken music URL and the film stitched SILENT.
// This is the root-cause fix for "no music in the video".
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN!, useFileOutput: false });

/**
 * Robustly extract a playable audio URL from a Replicate output, tolerant of
 * every shape the SDK/model can return: a plain URL string, an array of them, a
 * `{ audio }` object, or a `FileOutput` (which exposes `.url()`). Returns '' when
 * nothing usable is present so the caller can fail cleanly.
 */
function extractAudioUrl(output: unknown): string {
  const fromOne = (v: unknown): string => {
    if (!v) return '';
    if (typeof v === 'string') return v;
    const obj = v as { url?: unknown; audio?: unknown };
    // replicate FileOutput (SDK v1.x): `.url()` → URL | string.
    if (typeof obj.url === 'function') {
      try {
        const u = (obj.url as () => unknown)();
        return typeof u === 'string' ? u : String((u as URL | null)?.href ?? '');
      } catch {
        return '';
      }
    }
    if (typeof obj.url === 'string') return obj.url;
    if (typeof obj.audio === 'string') return obj.audio;
    return '';
  };
  if (Array.isArray(output)) {
    for (const item of output) {
      const u = fromOne(item);
      if (u) return u;
    }
    return '';
  }
  return fromOne(output);
}

export async function generateMusic(prompt: string, duration: number = 30) {
  try {
    const output = (await replicate.run(
      "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb",
      { input: { prompt: `${prompt}, high quality`, duration, model_version: "large", output_format: "mp3" } }
    )) as unknown;
    const audioUrl = extractAudioUrl(output);
    if (!audioUrl || !/^https?:\/\//i.test(audioUrl)) {
      throw new Error('Replicate returned no usable audio URL');
    }
    return { audioUrl, duration, prompt };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Music generation failed: ${message}`);
  }
}

/**
 * Sing CUSTOM lyrics in an UPLOADED voice — zero-shot vocal cloning via MiniMax
 * music-01 (no training, no RVC model file). This is the "create a song in MY
 * voice" feature: give it a >15s sample of the user's voice + lyrics, and it
 * generates a song that sings those lyrics in that person's vocal timbre.
 *
 * References (all must be https URLs Replicate can fetch; voice/song/instrumental
 * must each be a .wav/.mp3 LONGER THAN 15 seconds):
 *   • voiceUrl        → voice_file        clone THIS person's vocal timbre
 *   • songUrl         → song_file         a full reference song → remix its style
 *   • instrumentalUrl → instrumental_file sing over THIS backing track
 *
 * Lyrics: newline = new line, blank line = pause. Wrapping the lyrics in `##`
 * tells MiniMax to add instrumental accompaniment (a FULL song) rather than an
 * a-cappella vocal — we do that automatically when no backing track is supplied.
 * MiniMax caps lyrics at ~350–400 chars.
 */
export async function generateVoiceSong(
  lyrics: string,
  opts: { voiceUrl?: string; songUrl?: string; instrumentalUrl?: string; accompaniment?: boolean } = {},
) {
  try {
    const clean = lyrics.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 360);
    if (!clean) throw new Error('lyrics are required to sing');
    // Only wrap in ## (auto-accompaniment) when the caller didn't give a backing
    // track of its own — otherwise the song/instrumental reference IS the backing.
    const withAcc = opts.accompaniment !== false && !opts.instrumentalUrl && !opts.songUrl;
    const formatted = withAcc ? `##\n${clean}\n##` : clean;
    const input: Record<string, unknown> = { lyrics: formatted, sample_rate: 44100, bitrate: 256000 };
    if (opts.voiceUrl) input.voice_file = opts.voiceUrl;
    if (opts.songUrl) input.song_file = opts.songUrl;
    if (opts.instrumentalUrl) input.instrumental_file = opts.instrumentalUrl;
    const output = (await replicate.run(
      'minimax/music-01:0254c7e2f54315b667dbae03da7c155822ba29ffe0457be5bc246d564be486bd',
      { input },
    )) as unknown;
    const audioUrl = extractAudioUrl(output);
    if (!audioUrl || !/^https?:\/\//i.test(audioUrl)) {
      throw new Error('MiniMax returned no usable audio URL');
    }
    return { audioUrl, prompt: lyrics };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Voice song failed: ${message}`);
  }
}

/**
 * Music COVER via Replicate MusicGen-melody: condition generation on an uploaded
 * track's MELODY (`input_audio` + `continuation:false`) and re-imagine it in the
 * requested style/prompt. `melodyUrl` must be an https URL Replicate can fetch.
 */
export async function generateMusicCover(prompt: string, melodyUrl: string, duration: number = 30) {
  try {
    const output = (await replicate.run(
      "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb",
      {
        input: {
          prompt: `${prompt}, high quality`,
          input_audio: melodyUrl,
          continuation: false,            // use the audio as a MELODY, not a continuation
          model_version: "stereo-melody-large",
          duration,
          output_format: "mp3",
        },
      }
    )) as unknown;
    const audioUrl = extractAudioUrl(output);
    if (!audioUrl || !/^https?:\/\//i.test(audioUrl)) {
      throw new Error('Replicate returned no usable cover audio URL');
    }
    return { audioUrl, duration, prompt };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Music cover failed: ${message}`);
  }
}

/**
 * Upscale an image to a higher resolution + sharper detail via Real-ESRGAN.
 * `imageUrl` must be an https URL Replicate can fetch; returns the upscaled URL.
 */
export async function upscaleImage(imageUrl: string, scale: 2 | 4 = 2): Promise<string> {
  const output = (await replicate.run(
    'nightmareai/real-esrgan:b3ef194191d13140337468c916c2c5b96dd0cb06dffc032a022a31807f6a5ea8',
    { input: { image: imageUrl, scale, face_enhance: false } },
  )) as unknown;
  const url = extractAudioUrl(output); // generic URL extractor (string | {url} | FileOutput)
  if (!url || !/^https?:\/\//i.test(url)) throw new Error('Upscale returned no usable URL');
  return url;
}
