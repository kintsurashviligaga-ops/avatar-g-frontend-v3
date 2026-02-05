export async function generateImage(
  prompt: string,
  style: string = "photorealistic",
  avatarConfig?: any
) {
  try {
    const engineId = "stable-diffusion-xl-1024-v1-0";
    
    const enhancedPrompt = avatarConfig 
      ? `${prompt} | featuring person with ${avatarConfig.skinTone} skin tone, ${avatarConfig.eyeColor} eyes, ${avatarConfig.style} appearance`
      : prompt;

    const response = await fetch(
      `https://api.stability.ai/v1/generation/${engineId}/text-to-image`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${process.env.STABILITY_API_KEY}`
        },
        body: JSON.stringify({
          text_prompts: [{ text: enhancedPrompt, weight: 1 }],
          cfg_scale: 7.5,
          height: 1024,
          width: 1024,
          samples: 1,
          steps: 50,
          style_preset: style === "photorealistic" ? "photographic" : style
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Stability AI error: ${response.status}`);
    }

    const data = await response.json();
    const imageBase64 = data.artifacts[0].base64;
    const imageBuffer = Buffer.from(imageBase64, 'base64');

    return {
      imageBuffer,
      seed: data.artifacts[0].seed,
      prompt: enhancedPrompt
    };
  } catch (error: any) {
    console.error("Stability AI error:", error);
    throw new Error(`Image generation failed: ${error.message}`);
  }
}
