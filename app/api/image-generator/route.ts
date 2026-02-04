import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { prompt, width = 1024, height = 1024 } = await req.json();
    if (!prompt) return NextResponse.json({ error: "Prompt is required" }, { status: 400 });

    const response = await fetch("https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.STABILITY_API_KEY}`,
      },
      body: JSON.stringify({
        text_prompts: [{ text: prompt }],
        cfg_scale: 7,
        samples: 1,
        width,
        height,
        steps: 30,
      }),
    });

    if (!response.ok) throw new Error("Stability AI error");
    const data = await response.json();
    const imageBase64 = data.artifacts?.[0]?.base64;
    if (!imageBase64) throw new Error("No image generated");

    const imageBuffer = Buffer.from(imageBase64, "base64");
    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": imageBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Image generator error:", error);
    return NextResponse.json({ error: "Failed to generate image" }, { status: 500 });
  }
}
