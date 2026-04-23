import { Buffer } from 'node:buffer';
import { NextRequest, NextResponse } from 'next/server';
import { generateVoice } from '@/lib/ai/elevenlabs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type OrbitService =
  | 'voice-synthesis'
  | 'image-generation'
  | 'video-generation'
  | 'music-production'
  | 'code-generation'
  | 'agent-orchestration';

const SERVICE_ALIASES: Record<string, OrbitService> = {
  voice: 'voice-synthesis',
  'voice-synthesis': 'voice-synthesis',
  'text-to-speech': 'voice-synthesis',
  image: 'image-generation',
  'image-generation': 'image-generation',
  video: 'video-generation',
  'video-generation': 'video-generation',
  music: 'music-production',
  'music-production': 'music-production',
  code: 'code-generation',
  'code-generation': 'code-generation',
  text: 'code-generation',
  agent: 'agent-orchestration',
  'agent-g': 'agent-orchestration',
  'agent-orchestration': 'agent-orchestration',
};

type ProxyResult = {
  response: Response;
  payload: unknown;
};

function resolveService(rawService: string): OrbitService | null {
  return SERVICE_ALIASES[rawService] ?? null;
}

function getPayloadData(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const record = payload as Record<string, unknown>;
  if (record.data && typeof record.data === 'object') {
    return record.data as Record<string, unknown>;
  }

  return record;
}

function extractError(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'Request failed';
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.error === 'string') {
    return record.error;
  }

  if (record.error && typeof record.error === 'object') {
    const nested = record.error as Record<string, unknown>;
    if (typeof nested.message === 'string') {
      return nested.message;
    }
  }

  if (record.data && typeof record.data === 'object') {
    return extractError(record.data);
  }

  return 'Request failed';
}

function extractPrimaryOutput(payload: unknown): string | null {
  const record = getPayloadData(payload);

  const directStringKeys = ['output', 'result', 'summary', 'url', 'audio_url', 'clientSecret'] as const;
  for (const key of directStringKeys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  if (Array.isArray(record.output) && typeof record.output[0] === 'string') {
    return record.output[0];
  }

  const job = record.job;
  if (job && typeof job === 'object') {
    const jobRecord = job as Record<string, unknown>;
    if (typeof jobRecord.id === 'string') {
      return `Job ${jobRecord.id}`;
    }
  }

  const track = record.track;
  if (track && typeof track === 'object') {
    const trackRecord = track as Record<string, unknown>;
    if (typeof trackRecord.id === 'string') {
      return `Track ${trackRecord.id}`;
    }
  }

  const video = record.video;
  if (video && typeof video === 'object') {
    const videoRecord = video as Record<string, unknown>;
    if (typeof videoRecord.id === 'string') {
      return `Video ${videoRecord.id}`;
    }
  }

  return null;
}

function buildForwardHeaders(request: NextRequest): Headers {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const authorization = request.headers.get('authorization');
  const cookie = request.headers.get('cookie');

  if (authorization) {
    headers.set('authorization', authorization);
  }

  if (cookie) {
    headers.set('cookie', cookie);
  }

  return headers;
}

async function proxyJson(
  request: NextRequest,
  pathname: string,
  body: Record<string, unknown>
): Promise<ProxyResult> {
  const response = await fetch(new URL(pathname, request.nextUrl.origin), {
    method: 'POST',
    headers: buildForwardHeaders(request),
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => null);
  return { response, payload };
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ service: string }> }
) {
  const { service } = await params;
  const resolvedService = resolveService(service);

  if (!resolvedService) {
    return jsonError('Unknown orbit service', 404);
  }

  return NextResponse.json({
    service: resolvedService,
    status: 'ready',
    endpoints: {
      'voice-synthesis': '/api/orbit/voice-synthesis',
      'image-generation': '/api/orbit/image-generation',
      'video-generation': '/api/orbit/video-generation',
      'music-production': '/api/orbit/music-production',
      'code-generation': '/api/orbit/code-generation',
      'agent-orchestration': '/api/orbit/agent-orchestration',
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ service: string }> }
) {
  const { service } = await params;
  const resolvedService = resolveService(service);

  if (!resolvedService) {
    return jsonError('Unknown orbit service', 404);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  try {
    switch (resolvedService) {
      case 'voice-synthesis': {
        const text = String(body.text ?? body.prompt ?? '').trim();
        const voiceId = String(body.provider_voice_id ?? body.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? '').trim();
        const emotion = String(body.emotion ?? 'neutral');

        if (!text) {
          return jsonError('text is required');
        }

        if (!voiceId) {
          return jsonError('Voice provider is not configured', 503);
        }

        const voice = await generateVoice(text, voiceId, emotion);
        const audioUrl = `data:audio/mpeg;base64,${Buffer.from(voice.audioBuffer).toString('base64')}`;

        return NextResponse.json({
          service: resolvedService,
          status: 'completed',
          title: String(body.title ?? 'Voice Synthesis Output'),
          output: text,
          detail: `Generated ${voice.duration}s audio clip`,
          audioUrl,
          metadata: {
            voiceId: voice.voiceId,
            duration: voice.duration,
            language: body.language ?? 'en',
          },
        });
      }

      case 'image-generation': {
        const prompt = String(body.prompt ?? '').trim();
        if (!prompt) {
          return jsonError('prompt is required');
        }

        const { response, payload } = await proxyJson(request, '/api/replicate/image', {
          prompt,
          quality: body.quality ?? 'standard',
          ratio: body.ratio ?? body.aspectRatio ?? '1:1',
          style: body.style,
          negativePrompt: body.negativePrompt,
          variant: body.variant,
        });

        if (!response.ok) {
          return jsonError(extractError(payload), response.status);
        }

        return NextResponse.json({
          service: resolvedService,
          status: 'completed',
          title: String(body.title ?? 'Image Generation Output'),
          output: extractPrimaryOutput(payload),
          detail: 'Image generation completed',
          metadata: getPayloadData(payload),
        });
      }

      case 'video-generation': {
        const prompt = String(body.prompt ?? '').trim();
        if (!prompt) {
          return jsonError('prompt is required');
        }

        const { response, payload } = await proxyJson(request, '/api/video/generate', {
          prompt,
          title: body.title ?? 'Orbit Video Job',
          resolution: body.resolution ?? '1080p',
          aspect_ratio: body.aspect_ratio ?? body.aspectRatio ?? '16:9',
          avatar_id: body.avatar_id,
          track_id: body.track_id,
          enable_lip_sync: body.enable_lip_sync ?? false,
          video_mode: body.video_mode ?? 'avatar_performance',
        });

        if (!response.ok) {
          return jsonError(extractError(payload), response.status);
        }

        const data = getPayloadData(payload);
        const job = data.job as Record<string, unknown> | undefined;

        return NextResponse.json({
          service: resolvedService,
          status: typeof job?.status === 'string' ? job.status : 'queued',
          title: String(body.title ?? 'Video Generation Job'),
          output: extractPrimaryOutput(payload),
          detail: typeof job?.id === 'string' ? `Queued video job ${job.id}` : 'Video job queued',
          metadata: data,
        });
      }

      case 'music-production': {
        const prompt = String(body.prompt ?? '').trim();
        if (!prompt) {
          return jsonError('prompt is required');
        }

        const { response, payload } = await proxyJson(request, '/api/music/generate', {
          prompt,
          lyrics: body.lyrics,
          lyrics_mode: body.lyrics_mode,
          genre: body.genre,
          mood: body.mood,
          language: body.language,
          style_tags: body.style_tags,
          use_custom_vocals: body.use_custom_vocals,
          voice_slots: body.voice_slots,
        });

        if (!response.ok) {
          return jsonError(extractError(payload), response.status);
        }

        const data = getPayloadData(payload);
        const job = data.job as Record<string, unknown> | undefined;

        return NextResponse.json({
          service: resolvedService,
          status: typeof job?.status === 'string' ? job.status : 'queued',
          title: String(body.title ?? 'Music Production Job'),
          output: extractPrimaryOutput(payload),
          detail: typeof job?.id === 'string' ? `Queued music job ${job.id}` : 'Music job queued',
          metadata: data,
        });
      }

      case 'code-generation': {
        const prompt = String(body.prompt ?? '').trim();
        const language = String(body.language ?? 'TypeScript');
        const framework = String(body.framework ?? '').trim();

        if (!prompt) {
          return jsonError('prompt is required');
        }

        const context = [
          `Generate production-ready ${language} code.`,
          framework ? `Framework/runtime: ${framework}.` : null,
          'Return the implementation first, then a short explanation.',
        ].filter(Boolean).join(' ');

        const { response, payload } = await proxyJson(request, '/api/ai', {
          agent: 'copy',
          prompt,
          context,
        });

        if (!response.ok) {
          return jsonError(extractError(payload), response.status);
        }

        const data = getPayloadData(payload);
        return NextResponse.json({
          service: resolvedService,
          status: 'completed',
          title: `${language} output`,
          output: typeof data.result === 'string' ? data.result : extractPrimaryOutput(data),
          detail: framework ? `${language} for ${framework}` : `${language} generation completed`,
          metadata: data,
        });
      }

      case 'agent-orchestration': {
        const goal = String(body.goal ?? body.prompt ?? '').trim();
        if (!goal) {
          return jsonError('goal is required');
        }

        const { response, payload } = await proxyJson(request, '/api/agent-g/execute', {
          goal,
          advanced_mode: Boolean(body.advanced_mode),
        });

        if (!response.ok) {
          return jsonError(extractError(payload), response.status);
        }

        const data = getPayloadData(payload);
        const results = data.results as Record<string, unknown> | undefined;

        return NextResponse.json({
          service: resolvedService,
          status: typeof data.status === 'string' ? data.status : 'queued',
          title: 'Agent G Task',
          output: typeof results?.summary === 'string' ? results.summary : extractPrimaryOutput(results),
          detail: typeof data.task_id === 'string' ? `Task ${data.task_id}` : 'Agent G task created',
          taskId: typeof data.task_id === 'string' ? data.task_id : undefined,
          metadata: data,
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Orbit service failed';
    return jsonError(message, 500);
  }
}