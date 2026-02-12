import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { ImageGenerationSchema, validateInput } from "@/lib/api/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/api/rate-limit";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const rateLimitError = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE);
  if (rateLimitError) return rateLimitError;

  try {
    const body = await req.json();
    const validation = validateInput(ImageGenerationSchema, body);

    if (!validation.success) {
      return apiError(new Error(validation.error), 400, 'Invalid request');
    }

    const { prompt, width = 1024, height = 1024 } = validation.data;

    if (!process.env.STABILITY_API_KEY) {
      return apiError(new Error('Service not configured'), 503, 'Service temporarily unavailable');
    }

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

    if (!response.ok) {
      return apiError(new Error(`API error: ${response.status}`), 502, 'Failed to generate image');
    }

    const data = await response.json();
    const imageBase64 = data.artifacts?.[0]?.base64;
    if (!imageBase64) {
      return apiError(new Error('No image in response'), 502, 'Failed to generate image');
    }

    const imageBuffer = Buffer.from(imageBase64, "base64");
    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": imageBuffer.length.toString(),
      },
    });
  } catch (error) {
    return apiError(error, 500);
  }
}
