import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getFlow,
  buildFinalPrompt,
  getCreditCost,
  getEstimatedSeconds,
} from '@/lib/agent-g-clarifier';
import { SERVICE_REGISTRY } from '@/lib/registry';
import type { ServiceId } from '@/lib/registry';
import { buildIterativePrompt } from '@/lib/chat/iteration-store';
import { generateWithGemini } from '@/lib/gemini/client';
import { getGeminiSystemPrompt, type GeminiServiceContext } from '@/lib/gemini/prompts';
import { reportError } from '@/lib/observability/report-error';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { refuseOutsideEngine } from '@/lib/providers/mediaPolicy';
import { googleAiConfigured } from '@/lib/ai/google/transport';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // a long Gemini text service (a full design document) stays well inside it

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
  serviceId:    z.string().optional(),
  sessionId:    z.string().optional(),
  userInput:    z.string().optional(),
  answers:      z.record(z.union([z.string(), z.array(z.string())])).optional(),
  mediaFiles:   z.array(MediaFileSchema).optional(),
  jobId:        z.string().optional(),
  locale:       z.string().default('ka'),
});

// ─── Service intent detection ─────────────────────────────────────────────────

const SERVICE_KEYWORDS: Record<ServiceId, string[]> = {
  avatar:           ['avatar', 'ავატარ', 'persona', 'talking', 'ლაპარაკ', 'персон', 'аватар', 'სახე'],
  video:            ['video', 'ვიდეო', 'видео', 'scene', 'cinematic', 'სცენა', 'film', 'clip'],
  image:            ['image', 'სურათ', 'изображ', 'photo', 'poster', 'visual', 'ფოტო', 'picture', 'generate image'],
  music:            ['music', 'მუსიკ', 'музык', 'soundtrack', 'audio', 'beat', 'sound', 'ბგერ', 'melody'],
  game:             ['game', 'თამაშ', 'игр', 'gameplay', 'level', 'rpg', 'gdd', 'mechanic'],
  interior:         ['interior', 'ინტერიერ', 'интерьер', 'room', 'space', 'ოთახ', 'design', 'furniture'],
  'prompt-builder': ['prompt', 'პრომპტ', 'промпт', 'midjourney', 'dalle', 'flux', 'optimize prompt'],
  terminal:         ['code', 'კოდ', 'код', 'script', 'terminal', 'ტერმინალ', 'function', 'api', 'python', 'javascript', 'typescript'],
  voice:            ['voice', 'ხმა', 'ხმის', 'голос', 'tts', 'clone', 'speech', 'synthesize', 'speak', 'ლაპარაკი', 'произнес'],
  'content-writer': ['article', 'blog', 'სტატია', 'статья', 'სეო', 'seo', 'copywriting', 'content', 'კონტენტ', 'write', 'post', 'newsletter', 'caption'],
  podcast:          ['podcast', 'პოდკასტ', 'подкаст', 'episode', 'radio', 'interview script', 'ეპიზოდ'],
  character:        ['character', 'პერსონაჟ', 'персонаж', 'npc', 'roleplay', 'role-play', 'fictional', 'fictional character'],
  event:            ['event', 'ივენთ', 'мероприят', 'wedding', 'conference', 'festival', 'concert', 'კონფერენც', 'ქორწილ', 'launch', 'ceremony'],
  tourism:          ['travel', 'tour', 'trip', 'მოგზაურ', 'путешеств', 'itinerary', 'destination', 'visit', 'vacation', 'holiday', 'ტური', 'ადგილ', 'guide', 'tourism'],
};

function detectServiceIntent(text: string): ServiceId | null {
  const lower = text.toLowerCase();
  let best: { id: ServiceId; score: number } | null = null;
  for (const [id, keywords] of Object.entries(SERVICE_KEYWORDS) as [ServiceId, string[]][]) {
    const score = keywords.filter(kw => lower.includes(kw)).length;
    if (score > 0 && (!best || score > best.score)) best = { id, score };
  }
  return best?.id ?? null;
}

function toGeminiContext(serviceId: ServiceId): GeminiServiceContext {
  switch (serviceId) {
    case 'interior':       return 'interior';
    case 'image':          return 'image';
    case 'video':          return 'video';
    case 'music':          return 'music';
    case 'voice':          return 'voice';
    case 'avatar':         return 'avatar';
    case 'game':           return 'game';
    case 'content-writer': return 'content-writer';
    case 'prompt-builder': return 'prompt-builder';
    case 'podcast':        return 'podcast';
    case 'character':      return 'character';
    case 'event':          return 'event';
    case 'tourism':        return 'tourism';
    case 'terminal':       return 'terminal';
    default:               return 'general';
  }
}

async function generateTextWithGemini(serviceId: ServiceId, locale: string, prompt: string): Promise<string> {
  if (!googleAiConfigured()) {
    throw new Error('Vertex AI is not configured');
  }

  const context = toGeminiContext(serviceId);
  const systemPrompt = getGeminiSystemPrompt(context, locale);
  const prefersPro = prompt.length > 1200 || serviceId === 'game' || serviceId === 'content-writer';
  const response = await generateWithGemini({
    prompt,
    systemPrompt,
    tier: prefersPro ? 'pro' : 'flash',
    temperature: 0.65,
  });
  return response.text.trim();
}

// ─── Pipeline actions ─────────────────────────────────────────────────────────

function handleDetectIntent(userInput: string, locale: string) {
  const serviceId = detectServiceIntent(userInput);
  if (!serviceId) {
    return NextResponse.json({
      detected: false,
      message: locale === 'ka'
        ? 'მე ვარ Agent G — MyAvatar-ის AI ორკესტრატორი. 14 სერვისიდან რომელი გჭირდება?\n\n**Avatar** · **Video** · **Image** · **Music Studio** · **Voice Clone** · **Game** · **Interior** · **Prompt** · **Terminal** · **Content Writer** · **Podcast** · **Character AI** · **Event Studio** · **Tourism**'
        : 'I am Agent G — AI orchestrator of MyAvatar. Which of our 14 services do you need?\n\n**Avatar** · **Video** · **Image** · **Music Studio** · **Voice Clone** · **Game** · **Interior** · **Prompt** · **Terminal** · **Content Writer** · **Podcast** · **Character AI** · **Event Studio** · **Tourism**',
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
  return NextResponse.json({ serviceId, questions: flow.questions, totalSteps: flow.questions.length });
}

function handleConfirm(serviceId: ServiceId, userInput: string, answers: Record<string, string | string[]>) {
  const finalPrompt = buildFinalPrompt(serviceId, userInput, answers);
  const creditCost = getCreditCost(serviceId, answers);
  const estimatedSeconds = getEstimatedSeconds(serviceId, answers);
  return NextResponse.json({ serviceId, finalPrompt, creditCost, estimatedSeconds, answers, ready: true });
}

// ─── HeyGen helpers (inlined — no internal HTTP calls) ────────────────────────

// ─── Inline generators ────────────────────────────────────────────────────────

// ─── Main generate handler ────────────────────────────────────────────────────

/** The wizard services that answer in text on Gemini; every other `generate` reaches a media engine. */
const TEXT_SERVICES: ServiceId[] = ['game', 'prompt-builder', 'terminal', 'content-writer', 'podcast', 'character', 'event', 'tourism'];

async function handleGenerate(
  serviceId: ServiceId,
  finalPrompt: string,
  sessionId: string,
  locale: string,
  answers: Record<string, string | string[]>,
) {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const iterative = buildIterativePrompt({
    sessionId,
    serviceContext: serviceId,
    message: finalPrompt,
    selectedOptions: Object.fromEntries(
      Object.entries(answers).filter(([, value]) => typeof value === 'string'),
    ) as Record<string, string>,
  });
  const effectivePrompt = iterative.prompt;

  // ── Text services (Gemini ONLY — PROJECT_MASTER R7) ────────────────────────
  if (TEXT_SERVICES.includes(serviceId)) {
    const outputKind = serviceId === 'terminal' ? 'code' : 'text';
    const systemPrompts: Record<string, string> = {
      game:             'You are a senior game designer and narrative architect. Produce a comprehensive, publication-ready Game Design Document (GDD) in rich markdown. Structure the document with these sections: ## Overview, ## Core Mechanics, ## Narrative & World, ## Level Design, ## Characters & Abilities, ## Progression & Monetization, ## Technical Requirements, ## Art Direction. Use tables, bullet lists, and code blocks where appropriate. Be specific, creative, and actionable.',
      'prompt-builder': 'You are a world-class prompt engineer specializing in crafting high-performance prompts for AI models. Your task: transform the user\'s raw input into a powerful, optimized prompt tailored to the target model and style. Return ONLY the final optimized prompt — no preamble, no explanation, no quotes around it. Just the prompt itself, ready to copy-paste.',
      terminal:         'You are a Staff Engineer. Write production-ready, secure, well-structured code with markdown code blocks.',
      'content-writer': 'You are a world-class copywriter and content strategist. Produce high-quality, engaging, SEO-aware content. Use natural language, avoid generic AI phrases. Format in clean markdown.',
      podcast:          'You are a professional podcast producer and scriptwriter. Create complete, engaging podcast scripts with clear segment structure, natural dialogue, and strong hooks. Format in markdown with speaker labels.',
      character:        'You are a master character designer and narrative architect. Create rich, multi-dimensional characters with deep backstories, consistent voice, and cultural depth. Format in clean markdown with clear sections.',
      event:            'You are a professional event producer and copywriter. Create comprehensive event materials including programs, MC scripts, promo copy, and invitations. Be specific, engaging, and culturally aware. Format in clean markdown.',
      tourism:          'You are an expert travel consultant and destination specialist. Create detailed, practical, and inspiring travel content. Include local tips, cultural context, logistics, and hidden gems. Format in clean, readable markdown with clear sections.',
    };

    // ⚠️ THE TERMINAL TOOL HAS NO BRANCH OF ITS OWN ANY MORE. It ran Claude FIRST (claude-sonnet-4-6) with Gemini only as
    // its fallback — a forbidden provider as the primary, and a silent vendor switch on every Claude miss. It now takes
    // the shared Gemini path below like every other text service (its prompt needs no enrichment, so the call is
    // exactly the Gemini call its old fallback made), and a Gemini miss is that path's explicit error.

    // For game service, enrich prompt with genre/platform/art_style answers
    let enrichedPrompt = effectivePrompt;
    if (serviceId === 'game') {
      const genre      = typeof answers.genre      === 'string' && answers.genre      ? answers.genre      : null;
      const platform   = typeof answers.platform   === 'string' && answers.platform   ? answers.platform   : null;
      const art_style  = typeof answers.art_style  === 'string' && answers.art_style  ? answers.art_style  : null;
      const extras = [
        genre     && `Genre: ${genre}`,
        platform  && `Target Platform: ${platform}`,
        art_style && `Art Style: ${art_style}`,
      ].filter(Boolean);
      if (extras.length > 0) {
        enrichedPrompt = `${effectivePrompt}\n\n**Design Parameters:**\n${extras.map(e => `- ${e}`).join('\n')}`;
      }
    }

    if (serviceId === 'prompt-builder') {
      const targetMap: Record<string, string> = {
        gpt4:       'GPT-4o (OpenAI chat model — supports long context, system instructions, structured reasoning)',
        claude:     'Claude (Anthropic — excels at nuanced reasoning, long documents, XML-structured output)',
        gemini:     'Gemini (Google — strong with multimodal tasks and long-form analysis)',
        flux:       'FLUX image generation model (diffusion-based — uses natural language descriptions of visual scenes, lighting, composition, style)',
        midjourney: 'Midjourney image generation (uses comma-separated descriptors, style suffixes like --ar 16:9 --style raw --v 7)',
        dalle:      'DALL-E image generation (OpenAI — natural language descriptions, clear subject + style + lighting + mood)',
        kling:      'Kling video generation (descriptive scene setup, camera movement, subject action, lighting)',
        sora:       'Sora video generation (OpenAI — cinematic scene descriptions with camera angle, motion, environment, duration)',
      };
      const styleMap: Record<string, string> = {
        detailed:   'detailed and highly specific — add rich context, constraints, format instructions, and examples where useful',
        concise:    'concise and direct — keep it short but powerful, every word earns its place',
        creative:   'creative and expressive — evocative language, metaphors, vivid imagery',
        technical:  'technical and precise — exact terminology, structured format, measurable constraints',
        cinematic:  'cinematic — visual storytelling language: camera angles, lighting, atmosphere, motion, mood',
      };
      const target = typeof answers.target === 'string' && answers.target ? answers.target : 'gpt4';
      const style  = typeof answers.style  === 'string' && answers.style  ? answers.style  : 'detailed';
      const targetDesc = targetMap[target] ?? target;
      const styleDesc  = styleMap[style]   ?? style;
      enrichedPrompt = `Optimize the following prompt for: ${targetDesc}.\nOptimization style: ${styleDesc}.\n\nOriginal prompt:\n${effectivePrompt}`;
    }

    if (serviceId === 'content-writer') {
      const type     = typeof answers.type     === 'string' && answers.type     ? answers.type     : 'article';
      const tone     = typeof answers.tone     === 'string' && answers.tone     ? answers.tone     : 'professional';
      const language = typeof answers.language === 'string' && answers.language ? answers.language : null;
      const extras = [
        `Content Type: ${type}`,
        `Tone: ${tone}`,
        language && `Language: ${language === 'ka' ? 'Georgian (ქართული)' : language === 'ru' ? 'Russian' : 'English'}`,
      ].filter(Boolean);
      enrichedPrompt = `${effectivePrompt}\n\n**Writing Parameters:**\n${extras.map(e => `- ${e}`).join('\n')}`;
      if (language === 'ka') {
        enrichedPrompt += '\n\nIMPORTANT: Write the entire output in Georgian (ქართული). Use proper Georgian typography and natural, engaging language.';
      } else if (language === 'ru') {
        enrichedPrompt += '\n\nIMPORTANT: Write the entire output in Russian. Use natural, engaging language.';
      }
    }

    if (serviceId === 'podcast') {
      const format   = typeof answers.format   === 'string' && answers.format   ? answers.format   : 'interview';
      const duration = typeof answers.duration === 'string' && answers.duration ? answers.duration : '30';
      const tone     = typeof answers.tone     === 'string' && answers.tone     ? answers.tone     : 'conversational';
      enrichedPrompt = `${effectivePrompt}\n\n**Podcast Parameters:**\n- Format: ${format}\n- Target duration: ${duration} minutes\n- Tone: ${tone}\n\nGenerate a complete, production-ready episode script with timestamps, speaker labels, transitions, and natural dialogue.`;
    }

    if (serviceId === 'character') {
      const archetype = typeof answers.archetype === 'string' && answers.archetype ? answers.archetype : null;
      const world     = typeof answers.world     === 'string' && answers.world     ? answers.world     : null;
      const depth     = typeof answers.depth     === 'string' && answers.depth     ? answers.depth     : 'standard';
      const extras = [
        archetype && `Archetype: ${archetype}`,
        world     && `World / Setting: ${world}`,
        `Detail Level: ${depth}`,
      ].filter(Boolean);
      enrichedPrompt = `${effectivePrompt}\n\n**Character Parameters:**\n${extras.map(e => `- ${e}`).join('\n')}`;
      if (depth === 'deep') {
        enrichedPrompt += '\n\nInclude: full backstory, personality breakdown, key relationships, speech patterns, sample dialogue (5+ lines), fears, motivations, and a visual description suitable for image generation.';
      }
    }

    if (serviceId === 'event') {
      const type   = typeof answers.type   === 'string' && answers.type   ? answers.type   : 'conference';
      const output = typeof answers.output === 'string' && answers.output ? answers.output : 'full';
      const outputDesc: Record<string, string> = {
        program:   'full event program with schedule and speaker bios',
        mc_script: 'complete MC / host script with cues and transitions',
        invitation: 'formal invitation text suitable for print and digital',
        promo:     'social media promo copy pack (3 posts + story captions)',
        full:      'everything: program + MC script + invitation + promo copy',
      };
      enrichedPrompt = `${effectivePrompt}\n\n**Event Parameters:**\n- Event Type: ${type}\n- Generate: ${outputDesc[output] ?? output}`;
    }

    if (serviceId === 'tourism') {
      const type     = typeof answers.type     === 'string' && answers.type     ? answers.type     : 'itinerary';
      const duration = typeof answers.duration === 'string' && answers.duration ? answers.duration : '5';
      const style    = typeof answers.style    === 'string' && answers.style    ? answers.style    : 'cultural';
      enrichedPrompt = `${effectivePrompt}\n\n**Travel Parameters:**\n- Plan Type: ${type}\n- Duration: ${duration} days\n- Travel Style: ${style}\n\nInclude: daily schedule, accommodation tips, must-see spots, local cuisine recommendations, transport advice, and practical tips.`;
    }

    try {
      const text = await generateTextWithGemini(serviceId, locale, `${systemPrompts[serviceId]}\n\n${enrichedPrompt}`);
      return NextResponse.json({
        jobId,
        status: 'done',
        serviceId,
        outputKind,
        result: text,
        provider: 'gemini',
        iteration: iterative.iteration,
      });
    } catch (geminiErr) {
      // ⚠️ NO SECOND PROVIDER (PROJECT_MASTER R7, "NO SILENT FALLBACK"). A Gemini miss used to fall through to Claude
      // (claude-sonnet-4-6) and then OpenAI (gpt-4o-mini) — both forbidden — so the user got another vendor's text under
      // a Gemini request. It is now this route's explicit text-service error (200 + status:'error', the shape every
      // other generate failure here answers). This legacy surface charges no credit, so there is nothing to refund.
      const geminiMsg = geminiErr instanceof Error ? geminiErr.message : 'Gemini unavailable';
      return NextResponse.json({ jobId, status: 'error', serviceId, error: `Text generation unavailable: ${geminiMsg}` }, { status: 200 });
    }
  }

  // Every media service (avatar, image, music, interior, voice) is refused in POST before it gets here: they ran on
  // outside engines with no Google path (MASTER TASK v3.1), and video moved to the studio.
  return NextResponse.json({ jobId, status: 'error', serviceId, error: `Unknown service: ${serviceId}` }, { status: 200 });
}

// ─── Frontend → backend service ID aliases ────────────────────────────────────
// Frontend uses hyphenated compound IDs; registry uses short IDs.

const SERVICE_ID_ALIASES: Record<string, ServiceId> = {
  'game-creation':   'game',
  'interior-design': 'interior',
  'terminal-coding': 'terminal',
  'voice-studio':    'voice',
};

function normalizeServiceId(id: string): ServiceId {
  return SERVICE_ID_ALIASES[id] ?? (id as ServiceId);
}

// ─── Request handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body   = await req.json();
    const parsed = PipelineRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { action, userInput, answers, locale, sessionId } = parsed.data;
    const serviceId = parsed.data.serviceId ? normalizeServiceId(parsed.data.serviceId) : undefined;

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
        // ⚠️ SIGNED-IN ONLY (lib/auth/generationGate), and only HERE: detect_intent / get_questions / confirm are
        // local lookups that spend nothing, so the wizard can still be walked signed out. `generate` is the one
        // action that spends — and it spends everywhere: the text services on Gemini (only — R7, no Claude / OpenAI
        // fallback any more), image on Nano Banana, video on LTX, avatar on HeyGen + ElevenLabs, interior on World Labs,
        // music on Udio. None of it had a session check, so a direct POST reached every one of those keys for free.
        const { user } = await authedClientFromRequest(req);
        if (mustSignInToGenerate(user?.id)) {
          return NextResponse.json(signInToGenerateBody(locale), { status: 401 });
        }
        // This wizard's media legs (Nano Banana, HeyGen, World Labs, Udio, ElevenLabs voice, the lip-sync cascade) ran
        // on outside engines with no charge of their own and no Google path: only the text services (Gemini) run, whatever
        // MEDIA_GOOGLE_ONLY says (MASTER TASK v3.1). Refused before the rate limit, so a refusal spends none of it. Video
        // has its own answer just below.
        if (!TEXT_SERVICES.includes(serviceId as ServiceId) && normalizeServiceId(serviceId) !== ('video' as ServiceId)) {
          return refuseOutsideEngine(req);
        }
        // Every generate spends a paid provider, and this legacy surface has no credit charge of its own: bound it
        // like the other expensive routes.
        const limited = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE);
        if (limited) return limited;
        // Google-only (docs/VEO_ENGINE.md §3): video renders on Veo, in the studio, where it is planned and billed.
        // This wizard's video leg was LTX / Replicate, a non-Google engine with no charge; it is gone (MASTER TASK
        // v3.1), whatever VIDEO_GOOGLE_ONLY says.
        if (normalizeServiceId(serviceId) === ('video' as ServiceId)) {
          return NextResponse.json(
            { error: 'video_moved', message: locale === 'en' ? 'Video is made in the Studio now.' : locale === 'ru' ? 'Видео теперь создаётся в Студии.' : 'ვიდეო ახლა სტუდიაში იქმნება.' },
            { status: 409 },
          );
        }
        const finalPrompt = answers
          ? buildFinalPrompt(serviceId as ServiceId, userInput, answers)
          : userInput;
        return handleGenerate(
          serviceId as ServiceId,
          finalPrompt,
          sessionId || `pipeline_${Date.now()}`,
          locale,
          answers ?? {},
        );
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Pipeline error';
    reportError(err, { route: '/api/pipeline', stage: 'router' });
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
