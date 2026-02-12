import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api/response";
import { VideoGenerationSchema, validateInput } from "@/lib/api/validation";
import { checkRateLimit, RATE_LIMITS } from "@/lib/api/rate-limit";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const rateLimitError = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE);
  if (rateLimitError) return rateLimitError;

  try {
    const body = await req.json();
    const validation = validateInput(VideoGenerationSchema, body);

    if (!validation.success) {
      return apiError(new Error(validation.error), 400, 'Invalid request');
    }

    const { prompt, duration = 4 } = validation.data;

    if (!process.env.RUNWAY_API_KEY) {
      return apiError(new Error('Service not configured'), 503, 'Service temporarily unavailable');
    }

    const response = await fetch("https://api.runwayml.com/v1/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.RUNWAY_API_KEY}`,
      },
      body: JSON.stringify({
        taskType: "gen2",
        text_prompt: prompt,
        duration,
        motion: 5,
        seed: Math.floor(Math.random() * 1000000),
      }),
    });

    if (!response.ok) {
      return apiError(new Error(`API error: ${response.status}`), 502, 'Failed to start generation');
    }

    const data = await response.json();
    return apiSuccess({ generationId: data.id, status: "pending" });
  } catch (error) {
    return apiError(error, 500);
  }
}

export async function GET(req: NextRequest) {
  const rateLimitError = await checkRateLimit(req, RATE_LIMITS.READ);
  if (rateLimitError) return rateLimitError;

  try {
    const { searchParams } = new URL(req.url);
    const generationId = searchParams.get("id");

    if (!generationId || typeof generationId !== 'string' || generationId.length === 0) {
      return apiError(new Error('Missing ID'), 400, 'Invalid request');
    }

    if (!process.env.RUNWAY_API_KEY) {
      return apiError(new Error('Service not configured'), 503, 'Service temporarily unavailable');
    }

    const response = await fetch(`https://api.runwayml.com/v1/generations/${generationId}`, {
      headers: { "Authorization": `Bearer ${process.env.RUNWAY_API_KEY}` },
    });

    if (!response.ok) {
      return apiError(new Error(`API error: ${response.status}`), 502, 'Failed to check status');
    }

    const data = await response.json();
    return apiSuccess({ status: data.status, url: data.output?.[0]?.url, progress: data.progress || 0 });
  } catch (error) {
    return apiError(error, 500);
  }
}
