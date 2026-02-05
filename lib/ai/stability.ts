import { config } from "@/lib/config";
export async function generateImage(prompt: string, style: string = "photorealistic", avatarConfig?: any) {
  try {
    const engineId = config.apis.stability.engine;
    const apiHost = config.apis.stability.baseUrl;
    const enhancedPrompt = avatarConfig ? `${prompt} | Featuring: ${avatarConfig.skinTone} skin, ${avatarConfig.eyeColor} eyes` : prompt;
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
    const data = await response.json();
    return { base64: data.artifacts[0].base64, seed: data.artifacts[0].seed, prompt: enhancedPrompt };
  } catch (error: any) {
    throw new Error(`Image generation failed: ${error.message}`);
  }
}
