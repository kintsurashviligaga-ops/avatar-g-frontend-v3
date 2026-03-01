import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const REPLICATE_MODELS: Record<string, string> = {
  image: 'stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc',
  video: 'anotherjesse/zeroscope-v2-xl:9f747673945c62801b13b84701c783929c0ee784e4748ec062204894dda1a351',
  music: 'meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedbb',
};

type ReplicateType = 'image' | 'video' | 'music';

async function createPrediction(type: ReplicateType, prompt: string) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error('REPLICATE_API_TOKEN not configured');
  }

  const model = REPLICATE_MODELS[type];
  if (!model) {
    throw new Error(`Unknown type: ${type}`);
  }

  const [, version] = model.split(':');

  const inputMap: Record<ReplicateType, Record<string, unknown>> = {
    image: { prompt, width: 1024, height: 1024, num_outputs: 1 },
    video: { prompt, num_frames: 24, fps: 8 },
    music: { prompt, duration: 8, output_format: 'mp3' },
  };

  const res = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version,
      input: inputMap[type],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Replicate API error ${res.status}: ${err}`);
  }

  return res.json() as Promise<{ id: string; status: string; output?: unknown; urls?: { get: string } }>;
}

async function getPrediction(id: string) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error('REPLICATE_API_TOKEN not configured');
  }

  const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Replicate API error ${res.status}`);
  }

  return res.json() as Promise<{ id: string; status: string; output?: unknown; error?: string }>;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { type?: string; prompt?: string; predictionId?: string };

    // Poll existing prediction
    if (body.predictionId) {
      const prediction = await getPrediction(body.predictionId);
      return NextResponse.json({
        id: prediction.id,
        status: prediction.status,
        output: prediction.output,
        error: prediction.error,
      });
    }

    // Create new prediction
    const type = body.type as ReplicateType | undefined;
    const prompt = body.prompt;

    if (!type || !prompt) {
      return NextResponse.json({ error: 'Missing type or prompt' }, { status: 400 });
    }

    if (!['image', 'video', 'music'].includes(type)) {
      return NextResponse.json({ error: 'type must be image, video, or music' }, { status: 400 });
    }

    const prediction = await createPrediction(type, prompt);

    return NextResponse.json({
      id: prediction.id,
      status: prediction.status,
      message: `${type} generation started. Poll with predictionId to check status.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
