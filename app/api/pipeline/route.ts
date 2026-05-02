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

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Schema ───────────────────────────────────────────────────────────────────

const PipelineRequestSchema = z.object({
  action: z.enum(['detect_intent', 'get_questions', 'confirm', 'generate', 'status']),
  serviceId:  z.string().optional(),
  userInput:  z.string().optional(),
  answers:    z.record(z.union([z.string(), z.array(z.string())])).optional(),
  jobId:      z.string().optional(),
  locale:     z.string().default('ka'),
});

// ─── Service intent detection ─────────────────────────────────────────────────

const SERVICE_KEYWORDS: Record<ServiceId, string[]> = {
  avatar:           ['avatar', 'ავატარ', 'persona', 'portrait', 'character', 'персон', 'аватар'],
  video:            ['video', 'ვიდეო', 'видео', 'scene', 'cinematic', 'სცენა', 'film'],
  image:            ['image', 'სურათ', 'изображ', 'photo', 'poster', 'visual', 'ფოტო', 'picture'],
  music:            ['music', 'მუსიკ', 'музык', 'soundtrack', 'audio', 'beat', 'sound', 'ბგერ'],
  game:             ['game', 'თამაშ', 'игр', 'gameplay', 'level', 'rpg', 'gdd', 'mechanic'],
  interior:         ['interior', 'ინტერიერ', 'интерьер', 'room', 'space', 'ოთახ', 'design', 'furniture'],
  'prompt-builder': ['prompt', 'პრომპტ', 'промпт', 'template', 'instruction', 'midjourney', 'dalle', 'flux'],
  terminal:         ['code', 'კოდ', 'код', 'script', 'terminal', 'ტერმინალ', 'function', 'api', 'python', 'javascript'],
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

async function handleGenerate(serviceId: ServiceId, finalPrompt: string, locale: string) {
  // Map service → generation endpoint
  const GENERATION_ROUTES: Partial<Record<ServiceId, string>> = {
    avatar:           '/api/heygen/avatar',
    video:            '/api/ltx-video',
    image:            '/api/replicate/image',
    music:            '/api/elevenlabs/sound',
    interior:         '/api/replicate/image',
  };

  const TEXT_SERVICES: ServiceId[] = ['game', 'prompt-builder', 'terminal'];

  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  if (TEXT_SERVICES.includes(serviceId)) {
    // For text services, call Claude directly
    const systemPrompts: Record<string, string> = {
      game: 'You are a game design expert. Produce detailed, structured game design documents in markdown format.',
      'prompt-builder': 'You are a prompt engineering expert. Produce only the optimized final prompt, nothing else.',
      terminal: 'You are a senior software engineer. Produce production-ready, well-structured code with clear comments.',
    };

    const result = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompts[serviceId] ?? 'You are a helpful AI assistant.',
      messages: [{ role: 'user', content: finalPrompt }],
    });

    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';

    return NextResponse.json({
      jobId,
      status: 'done',
      serviceId,
      outputKind: 'text',
      result: text,
      tokensUsed: result.usage.input_tokens + result.usage.output_tokens,
    });
  }

  // For media services, return job ID (client will call the actual API)
  const route = GENERATION_ROUTES[serviceId];
  return NextResponse.json({
    jobId,
    status: 'queued',
    serviceId,
    generationRoute: route,
    prompt: finalPrompt,
    message: locale === 'ka' ? 'გენერაცია დაიწყო...' : 'Generation started...',
  });
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = PipelineRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { action, serviceId, userInput, answers, locale } = parsed.data;

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
        return handleGenerate(serviceId as ServiceId, finalPrompt, locale);
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
