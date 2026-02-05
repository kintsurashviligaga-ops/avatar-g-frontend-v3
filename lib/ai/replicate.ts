import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
});

export async function generateMusic(
  prompt: string,
  duration: number = 30,
  vocals: boolean = false,
  voiceId?: string
) {
  try {
    const output = await replicate.run(
      "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf298043f7c60f55056c40ae074096949",
      {
        input: {
          prompt: `${prompt}, high quality, master recording`,
          duration: duration,
          model_version: "large",
          output_format: "mp3",
          normalization_strategy: "peak"
        }
      }
    );

    let vocalTrack = null;
    if (vocals && voiceId) {
      const { generateVoice } = await import('./elevenlabs');
      const lyrics = `AI-generated vocals for: ${prompt}`;
      vocalTrack = await generateVoice(lyrics, voiceId, "neutral");
    }

    return {
      musicUrl: output,
      vocalTrack,
      duration,
      prompt
    };
  } catch (error: any) {
    console.error("Replicate error:", error);
    throw new Error(`Music generation failed: ${error.message}`);
  }
}
