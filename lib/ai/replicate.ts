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
      "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf298043f7c60f55056c40ae074096949",
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
 * Music COVER via Replicate MusicGen-melody: condition generation on an uploaded
 * track's MELODY (`input_audio` + `continuation:false`) and re-imagine it in the
 * requested style/prompt. `melodyUrl` must be an https URL Replicate can fetch.
 */
export async function generateMusicCover(prompt: string, melodyUrl: string, duration: number = 30) {
  try {
    const output = (await replicate.run(
      "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf298043f7c60f55056c40ae074096949",
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
