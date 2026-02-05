import Replicate from "replicate";
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! });
export async function generateMusic(prompt: string, duration: number = 30) {
  try {
    const output = await replicate.run(
      "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf298043f7c60f55056c40ae074096949",
      { input: { prompt: `${prompt}, high quality`, duration, model_version: "large", output_format: "mp3" } }
    ) as string;
    return { audioUrl: output, duration, prompt };
  } catch (error: any) {
    throw new Error(`Music generation failed: ${error.message}`);
  }
}
