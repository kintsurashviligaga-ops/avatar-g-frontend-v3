import { config } from "@/lib/config";

interface AvatarConfig {
  skinTone?: string;
  eyeColor?: string;
}

interface StabilityArtifact {
  base64?: string;
  seed?: number;
}

interface StabilityResponse {
  artifacts?: StabilityArtifact[];
}

export async function generateImage(
  prompt: string,
  style: string = "photorealistic",
  avatarConfig?: AvatarConfig
) {
  try {
    const engineId = config.apis.stability.engine;
    const apiHost = config.apis.stability.baseUrl;
    const stylePrompt = style ? `${prompt} | Style: ${style}` : prompt;
    const enhancedPrompt = avatarConfig
      ? `${stylePrompt} | Featuring: ${avatarConfig.skinTone} skin, ${avatarConfig.eyeColor} eyes`
      : stylePrompt;
    const response = await fetch(`${apiHost}/generation/${engineId}/text-to-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${process.env.STABILITY_API_KEY}`
      },
      body: JSON.stringify({
        text_prompts: [{ text: enhancedPrompt, weight: 1 }],
        cfg_scale: config.apis.stability.cfgScale,
        samples: 1,
        steps: config.apis.stability.steps,
        width: config.apis.stability.width,
        height: config.apis.stability.height
      })
    });
    if (!response.ok) throw new Error(`Stability AI error: ${response.status}`);
    const data = (await response.json()) as StabilityResponse;
    const artifact = data.artifacts?.[0];
    if (!artifact?.base64) {
      throw new Error("Image generation failed: no artifacts returned");
    }

    return { base64: artifact.base64, seed: artifact.seed, prompt: enhancedPrompt };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Image generation failed: ${message}`);
  }
}
