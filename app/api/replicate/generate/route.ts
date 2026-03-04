import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const REPLICATE_MODELS: Record<string, string> = {
  image: 'stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc',
  video: 'anotherjesse/zeroscope-v2-xl:9f747673945c62801b13b84701c783929c0ee784e4748ec062204894dda1a351',
  music: 'meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedbb',
};

type ReplicateType = 'image' | 'video' | 'music';

function parseCandidates(...raw: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw) {
    if (!value) continue;
    const chunks = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    for (const chunk of chunks) {
      if (seen.has(chunk)) continue;
      seen.add(chunk);
      out.push(chunk);
    }
  }
  return out;
}

function resolveVersionCandidates(type: ReplicateType): string[] {
  const defaults = REPLICATE_MODELS[type];
  const envCommon = process.env.REPLICATE_VERSION_FALLBACKS;

  if (type === 'image') {
    return parseCandidates(process.env.REPLICATE_IMAGE_VERSIONS, process.env.REPLICATE_IMAGE_VERSION, envCommon, defaults);
  }

  if (type === 'video') {
    return parseCandidates(process.env.REPLICATE_VIDEO_VERSIONS, process.env.REPLICATE_VIDEO_VERSION, envCommon, defaults);
  }

  return parseCandidates(process.env.REPLICATE_AUDIO_VERSIONS, process.env.REPLICATE_AUDIO_VERSION, process.env.REPLICATE_MUSIC_VERSIONS, process.env.REPLICATE_MUSIC_VERSION, envCommon, defaults);
}

async function createPrediction(type: ReplicateType, prompt: string) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error('REPLICATE_API_TOKEN not configured');
  }

  const versions = resolveVersionCandidates(type);
  if (!versions.length) {
    throw new Error(`No model versions configured for type: ${type}`);
  }

  const inputMap: Record<ReplicateType, Record<string, unknown>> = {
    image: { prompt, width: 1024, height: 1024, num_outputs: 1 },
    video: { prompt, num_frames: 24, fps: 8 },
    music: { prompt, duration: 8, output_format: 'mp3' },
  };

  let lastError = 'Unknown error';
  for (const modelRef of versions) {
    const version = modelRef.includes(':') ? modelRef.split(':')[1] : modelRef;

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

    if (res.ok) {
      const payload = await res.json() as { id: string; status: string; output?: unknown; urls?: { get: string } };
      return { ...payload, selectedVersion: version };
    }

    const err = await res.text();
    lastError = `Replicate API error ${res.status}: ${err}`;

    if (res.status === 422 || res.status === 404) {
      continue;
    }

    throw new Error(lastError);
  }

  throw new Error(lastError);
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
      version: prediction.selectedVersion,
      message: `${type} generation started. Poll with predictionId to check status.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('Replicate API error 429')) {
      return NextResponse.json({
        status: 'throttled',
        error: message,
        message: 'Replicate rate limit reached for current account credit. Retry shortly or increase account credit.',
      }, { status: 200 });
    }

    if (message.includes('Replicate API error 422')) {
      return NextResponse.json({
        status: 'model_unavailable',
        error: message,
        message: 'Selected Replicate model/version is unavailable for this account. Update model version or permissions.',
      }, { status: 200 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
