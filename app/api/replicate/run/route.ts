import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/replicate/run
 * Runs a Replicate model prediction.
 * Body: { model: string, input: Record<string, unknown> }
 * model format: "owner/name:version" or "owner/name" (uses latest)
 */
export async function POST(req: NextRequest) {
  try {
    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      return NextResponse.json(
        { error: 'REPLICATE_API_TOKEN not configured. Add it to Vercel env vars.' },
        { status: 500 },
      );
    }

    const body = await req.json();
    const { model, input } = body as { model?: string; input?: Record<string, unknown> };

    if (!model || typeof model !== 'string') {
      return NextResponse.json({ error: 'model is required (e.g. "stability-ai/sdxl:abc123...")' }, { status: 400 });
    }

    if (!input || typeof input !== 'object') {
      return NextResponse.json({ error: 'input object is required' }, { status: 400 });
    }

    // Determine if model string includes a version
    const hasVersion = model.includes(':');
    let version: string;
    let modelId: string;

    if (hasVersion) {
      const [m, v] = model.split(':');
      modelId = m ?? model;
      version = v ?? '';
    } else {
      // Get latest version from model endpoint
      const modelRes = await fetch(`https://api.replicate.com/v1/models/${model}`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });
      if (!modelRes.ok) {
        return NextResponse.json({ error: `Model not found: ${model}` }, { status: 404 });
      }
      const modelData = await modelRes.json();
      version = modelData.latest_version?.id ?? '';
      modelId = model;
    }

    if (!version) {
      return NextResponse.json({ error: 'Could not resolve model version' }, { status: 400 });
    }

    // Create prediction
    const predictionRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({ version, input }),
    });

    if (!predictionRes.ok) {
      const errorText = await predictionRes.text();
      return NextResponse.json(
        { error: 'Replicate API error', details: errorText },
        { status: predictionRes.status },
      );
    }

    const prediction = await predictionRes.json();

    return NextResponse.json({
      id: prediction.id,
      status: prediction.status,
      model: modelId,
      urls: prediction.urls,
      output: prediction.output,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
