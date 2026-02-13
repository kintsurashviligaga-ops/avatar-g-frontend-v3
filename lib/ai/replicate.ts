import Replicate from "replicate";
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! });
export async function generateMusic(prompt: string, duration: number = 30) {
  try {
    const output = await replicate.run(
      "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf298043f7c60f55056c40ae074096949",
      { input: { prompt: `${prompt}, high quality`, duration, model_version: "large", output_format: "mp3" } }
    ) as unknown;
    const audioUrl = Array.isArray(output) ? String(output[0] || '') : String(output || '');
    if (!audioUrl) {
      throw new Error('Replicate returned empty audio URL');
    }
    return { audioUrl, duration, prompt };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Music generation failed: ${message}`);
  }
}
