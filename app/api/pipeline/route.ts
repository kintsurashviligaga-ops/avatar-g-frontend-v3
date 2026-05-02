import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import {
  getFlow,
  buildFinalPrompt,
  getCreditCost,
  getEstimatedSeconds,
} from '@/lib/agent-g-clarifier';
import { SERVICE_REGISTRY } from '@/lib/registry';
import type { ServiceId } from '@/lib/registry';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Schema ───────────────────────────────────────────────────────────────────

const MediaFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['image', 'video', 'audio', 'document']),
  mimeType: z.string(),
  dataUrl: z.string(),
});

const PipelineRequestSchema = z.object({
  action: z.enum(['detect_intent', 'get_questions', 'confirm', 'generate', 'status']),
  serviceId:  z.string().optional(),
  userInput:  z.string().optional(),
  answers:    z.record(z.union([z.string(), z.array(z.string())])).optional(),
  mediaFiles: z.array(MediaFileSchema).optional(),
  jobId:      z.string().optional(),
  locale:     z.string().default('ka'),
});

type MediaFile = z.infer<typeof MediaFileSchema>;

// ─── Service intent detection ─────────────────────────────────────────────────

const SERVICE_KEYWORDS: Record<ServiceId, string[]> = {
  avatar:           ['avatar', 'ავატარ', 'persona', 'portrait', 'character', 'персон', 'аватар', 'talking', 'ლაპარაკ', 'სახე'],
  video:            ['video', 'ვიდეო', 'видео', 'scene', 'cinematic', 'სცენა', 'film', 'footage', 'clip'],
  image:            ['image', 'სურათ', 'изображ', 'photo', 'poster', 'visual', 'ფოტო', 'picture', 'draw', 'paint', 'generate image'],
  music:            ['music', 'მუსიკ', 'музык', 'soundtrack', 'audio', 'beat', 'sound', 'ბგერ', 'melody', 'song', 'track'],
  game:             ['game', 'თამაშ', 'игр', 'gameplay', 'level', 'rpg', 'gdd', 'mechanic', 'გეიმ'],
  interior:         ['interior', 'ინტერიერ', 'интерьер', 'room', 'space', 'ოთახ', 'design', 'furniture', 'floor plan', 'renovation'],
  'prompt-builder': ['prompt', 'პრომპტ', 'промпт', 'template', 'instruction', 'midjourney', 'dalle', 'flux', 'optimize prompt'],
  terminal:         ['code', 'კოდ', 'код', 'script', 'terminal', 'ტერმინალ', 'function', 'api', 'python', 'javascript', 'typescript', 'program'],
};

function detectServiceIntent(text: string): ServiceId | null {
  const lower = text.toLowerCase();
  let best: { id: ServiceId; score: number } | null = null;

  for (const [id, keywords] of Object.entries(SERVICE_KEYWORDS) as [ServiceId, string[]][]) {
    const score = keywords.filter(kw => lower.includes(kw)).length;
    if (score > 0 && (!best || score > best.score)) {
      best = { id, score };
    }
  }

  return best?.id ?? null;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

function handleDetectIntent(userInput: string, locale: string) {
  const serviceId = detectServiceIntent(userInput);
  if (!serviceId) {
    return NextResponse.json({
      detected: false,
      message: locale === 'ka'
        ? 'მე ვარ Agent G — MyAvatar.ge-ს AI ასისტენტი. რომელი სერვისი გინდა? Avatar, Video, Image, Music, Game, Interior, Prompt ან Terminal?'
        : 'I am Agent G. Which service would you like? Avatar, Video, Image, Music, Game, Interior, Prompt or Terminal?',
    });
  }

  const flow = getFlow(serviceId);
  const service = SERVICE_REGISTRY.find(s => s.id === serviceId);

  return NextResponse.json({
    detected: true,
    serviceId,
    serviceName: service?.name ?? serviceId,
    totalQuestions: flow.questions.length,
    firstQuestion: flow.questions[0],
    stepNumber: 1,
  });
}

function handleGetQuestions(serviceId: ServiceId) {
  const flow = getFlow(serviceId);
  return NextResponse.json({
    serviceId,
    questions: flow.questions,
    totalSteps: flow.questions.length,
  });
}

function handleConfirm(serviceId: ServiceId, userInput: string, answers: Record<string, string | string[]>) {
  const flow = getFlow(serviceId);
  const finalPrompt = buildFinalPrompt(serviceId, userInput, answers);
  const creditCost = getCreditCost(serviceId, answers);
  const estimatedSeconds = getEstimatedSeconds(serviceId, answers);

  return NextResponse.json({
    serviceId,
    finalPrompt,
    creditCost,
    estimatedSeconds,
    answers,
    ready: true,
  });
}

// ─── Inline generation helpers ────────────────────────────────────────────────

async function generateAvatar(
  script: string,
  answers: Record<string, string | string[]>,
  mediaFiles: MediaFile[],
): Promise<{ resultUrl?: string; outputKind: string; error?: string }> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return { outputKind: 'video', error: 'HEYGEN_API_KEY not configured' };

  const photoFile = mediaFiles.find(f => f.type === 'image');
  const voiceGender = (answers.voice_gender as string) || 'female';
  const voiceLanguage = (answers.voice_language as string) || 'en';
  const videoFormat = (answers.video_format as string) || '16:9';

  const body: Record<string, string> = {
    script,
    voiceGender,
    voiceLanguage,
    videoFormat,
  };
  if (photoFile) {
    body.photoBase64 = photoFile.dataUrl;
    body.photoMimeType = photoFile.mimeType;
  }

  // Call our HeyGen route internally
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';

  const res = await fetch(`${baseUrl}/api/heygen/avatar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as { success?: boolean; url?: string; error?: string };
  if (!data.success || !data.url) return { outputKind: 'video', error: data.error ?? 'Avatar generation failed' };
  return { resultUrl: data.url, outputKind: 'video' };
}

async function generateVideo(
  prompt: string,
  answers: Record<string, string | string[]>,
): Promise<{ resultUrl?: string; outputKind: string; error?: string }> {
  const apiKey = process.env.LTX_VIDEO_API_KEY;
  if (!apiKey) return { outputKind: 'video', error: 'LTX_VIDEO_API_KEY not configured' };

  const duration = parseInt(String(answers.duration ?? '7'));
  const aspect = (answers.aspect as string) || '16:9';
  const resolution = aspect === '9:16' ? '720x1280' : aspect === '1:1' ? '720x720' : '1280x720';

  const ltxRes = await fetch('https://api.ltx.video/v1/text-to-video', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      model: 'ltx-2-3-fast',
      resolution,
      duration,
      fps: 24,
      generate_audio: false,
    }),
  });

  if (!ltxRes.ok) {
    const err = await ltxRes.text();
    return { outputKind: 'video', error: `LTX Video failed: ${ltxRes.status} ${err}` };
  }

  // LTX returns video/mp4 stream — convert to base64 data URL
  const videoBuffer = await ltxRes.arrayBuffer();
  const base64 = Buffer.from(videoBuffer).toString('base64');
  const dataUrl = `data:video/mp4;base64,${base64}`;
  return { resultUrl: dataUrl, outputKind: 'video' };
}

async function generateImage(
  prompt: string,
  answers: Record<string, string | string[]>,
  mediaFiles: MediaFile[],
): Promise<{ resultUrl?: string; outputKind: string; error?: string }> {
  const { createPrediction, pollUntilDone } = await import('@/lib/replicate/client');
  const { resolveModel } = await import('@/lib/replicate/models');
  const { validateInput, buildModelInput } = await import('@/lib/replicate/schemas');
  const { normalizeOutput } = await import('@/lib/replicate/normalizer');

  const quality = (answers.quality as string) || 'standard';
  const aspectRatio = (answers.aspect as string) || '1:1';
  const style = (answers.style as string) || 'photorealistic';

  // If user uploaded a reference image for interior, attach it as style reference
  const refImage = mediaFiles.find(f => f.type === 'image');
  const enhancedPrompt = refImage
    ? `${prompt} [Reference image provided by user for style/composition guidance]`
    : prompt;

  const validation = validateInput({
    service: 'image',
    prompt: enhancedPrompt,
    quality,
    aspectRatio,
    style,
  });

  if (!validation.valid || !validation.sanitized) {
    return { outputKind: 'image', error: validation.error ?? 'Invalid input' };
  }

  const model = resolveModel('image', validation.sanitized.variant);
  const modelInput = buildModelInput(validation.sanitized);
  const prediction = await createPrediction(model.id, modelInput);

  const completed = prediction.status === 'succeeded' && prediction.output
    ? prediction
    : await pollUntilDone(prediction.id, 30, 2000);

  const normalized = normalizeOutput(
    'image', model.label, model.outputType,
    completed.id, completed.status, completed.output, completed.error ?? null, completed.metrics,
  );

  if (!normalized.url) return { outputKind: 'image', error: normalized.error ?? 'Image generation returned no URL' };
  return { resultUrl: normalized.url, outputKind: 'image' };
}

async function generateMusic(
  prompt: string,
  answers: Record<string, string | string[]>,
): Promise<{ resultUrl?: string; outputKind: string; error?: string }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { outputKind: 'audio', error: 'ELEVENLABS_API_KEY not configured' };

  const duration = Math.min(parseInt(String(answers.duration ?? '22')), 22);

  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: prompt.slice(0, 450),
      duration_seconds: duration,
      prompt_influence: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { outputKind: 'audio', error: `ElevenLabs Sound ${res.status}: ${err}` };
  }

  const audioBuffer = await res.arrayBuffer();
  const base64 = Buffer.from(audioBuffer).toString('base64');
  const dataUrl = `data:audio/mpeg;base64,${base64}`;
  return { resultUrl: dataUrl, outputKind: 'audio' };
}

// ─── Main generate handler ────────────────────────────────────────────────────

async function handleGenerate(
  serviceId: ServiceId,
  finalPrompt: string,
  locale: string,
  answers: Record<string, string | string[]>,
  mediaFiles: MediaFile[],
) {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const TEXT_SERVICES: ServiceId[] = ['game', 'prompt-builder', 'terminal'];

  if (TEXT_SERVICES.includes(serviceId)) {
    const systemPrompts: Record<string, string> = {
      game: 'You are a senior game designer with 15+ years of AAA and indie experience. Produce detailed, structured game design documents in markdown format with all sections filled in professionally.',
      'prompt-builder': 'You are a world-class prompt engineer. Produce ONLY the final optimized prompt, nothing else — no preamble, no explanations.',
      terminal: 'You are a Staff Engineer. Produce production-ready, well-structured, secure code with clean architecture. Use markdown code blocks.',
    };

    const result = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompts[serviceId] ?? 'You are a helpful AI assistant.',
      messages: [{ role: 'user', content: finalPrompt }],
    });

    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    const outputKind = serviceId === 'terminal' ? 'code' : 'text';

    return NextResponse.json({
      jobId,
      status: 'done',
      serviceId,
      outputKind,
      result: text,
      tokensUsed: result.usage.input_tokens + result.usage.output_tokens,
    });
  }

  // ── Media services — call APIs inline ─────────────────────────────────────

  try {
    let genResult: { resultUrl?: string; outputKind: string; error?: string };

    switch (serviceId) {
      case 'avatar':
        genResult = await generateAvatar(finalPrompt, answers, mediaFiles);
        break;
      case 'video':
        genResult = await generateVideo(finalPrompt, answers);
        break;
      case 'image':
        genResult = await generateImage(finalPrompt, answers, mediaFiles);
        break;
      case 'music':
        genResult = await generateMusic(finalPrompt, answers);
        break;
      case 'interior':
        genResult = await generateImage(finalPrompt, answers, mediaFiles);
        break;
      default:
        genResult = { outputKind: 'text', error: `Unknown service: ${serviceId}` };
    }

    if (genResult.error) {
      return NextResponse.json({ jobId, status: 'error', serviceId, error: genResult.error }, { status: 502 });
    }

    return NextResponse.json({
      jobId,
      status: 'done',
      serviceId,
      outputKind: genResult.outputKind,
      result_url: genResult.resultUrl,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Generation failed';
    return NextResponse.json({ jobId, status: 'error', serviceId, error: msg }, { status: 502 });
  }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = PipelineRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { action, serviceId, userInput, answers, mediaFiles, locale } = parsed.data;

    switch (action) {
      case 'detect_intent':
        return handleDetectIntent(userInput ?? '', locale);

      case 'get_questions': {
        if (!serviceId || !SERVICE_REGISTRY.find(s => s.id === serviceId)) {
          return NextResponse.json({ error: 'Invalid serviceId' }, { status: 400 });
        }
        return handleGetQuestions(serviceId as ServiceId);
      }

      case 'confirm': {
        if (!serviceId || !userInput || !answers) {
          return NextResponse.json({ error: 'serviceId, userInput, and answers required' }, { status: 400 });
        }
        return handleConfirm(serviceId as ServiceId, userInput, answers);
      }

      case 'generate': {
        if (!serviceId || !userInput) {
          return NextResponse.json({ error: 'serviceId and userInput required' }, { status: 400 });
        }
        const finalPrompt = answers
          ? buildFinalPrompt(serviceId as ServiceId, userInput, answers)
          : userInput;
        return handleGenerate(
          serviceId as ServiceId,
          finalPrompt,
          locale,
          answers ?? {},
          mediaFiles ?? [],
        );
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Pipeline error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    services: SERVICE_REGISTRY.map(s => s.id),
    actions: ['detect_intent', 'get_questions', 'confirm', 'generate'],
  });
}
