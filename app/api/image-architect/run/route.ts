/**
 * app/api/image-architect/run/route.ts
 * Professional image generation via Pollinations AI.
 * Flow: enhance prompt via Gemini → generate via Pollinations → try store in R2 → return URL.
 */

import { NextResponse } from "next/server";
import { smartAICall } from "@/lib/api/aiRouter";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prompt, language = "en", params = {} } = body;
    const style = params.style || "professional";

    // Step 1: Enhance the prompt via AI
    let enhancedPrompt = prompt;
    try {
      const enhanced = await smartAICall({
        prompt: `Enhance this image prompt for high-quality generation. Return ONLY the enhanced prompt, nothing else.\n\nStyle: ${style}\nOriginal: ${prompt}`,
        taskType: "creative-writing",
        language,
        maxTokens: 256,
      });
      if (enhanced.text && !enhanced.error) enhancedPrompt = enhanced.text;
    } catch {}

    // Step 2: Generate image via Pollinations
    const encodedPrompt = encodeURIComponent(enhancedPrompt);
    const imageUrl = `https://image.pollinations.ai/1024x1024?prompt=${encodedPrompt}&model=flux&enhance=true`;

    // Step 3: Try to store in R2
    let finalUrl = imageUrl;
    try {
      const uploadRes = await fetch("/api/upload?service=image-architect&jobId=" + Date.now(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: imageUrl, filename: "image_architect_" + Date.now() + ".png" }),
      });
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        if (uploadData.url) finalUrl = uploadData.url;
      }
    } catch {}

    return NextResponse.json({
      success: true,
      output: {
        type: "image",
        text: enhancedPrompt,
        files: [{ name: "generated_image.png", url: finalUrl, type: "image/png" }],
      },
      provider: "pollinations",
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      output: { type: "image", text: "", files: [] },
      error: err.message || "Image generation failed",
    }, { status: 200 });
  }
}

