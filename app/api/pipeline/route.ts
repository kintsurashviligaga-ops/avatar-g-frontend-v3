import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import {
  getFlow,
  buildFinalPrompt,
  getCreditCost,
  getEstimatedSeconds,
} from '@/lib/agent-g-clarifier';
import { SERVICE_REGISTRY } from '@/lib/registry';
import type { ServiceId } from '@/lib/registry';
import { generateNanoBananaImage } from '@/lib/nanobanana/client';
import { resolveNanoBananaEndpoint } from '@/lib/nanobanana/endpoints';
import { generateUdioTrack } from '@/lib/udio/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const HEYGEN_BASE = 'https://api.heygen.com';

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
  userInput:    z.string().optional(),
  answers:      z.record(z.union([z.string(), z.array(z.string())])).optional(),
  mediaFiles:   z.array(MediaFileSchema).optional(),
  jobId:        z.string().optional(),
  locale:       z.string().default('ka'),
});

type MediaFile = z.infer<typeof MediaFileSchema>;

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

async function generateTextWithOpenAI(systemPrompt: string, prompt: string): Promise<string> {
  if (!openai) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 4096,
    temperature: 0.7,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() || '';
}

// ─── Pipeline actions ─────────────────────────────────────────────────────────

function handleDetectIntent(userInput: string, locale: string) {
  const serviceId = detectServiceIntent(userInput);
  if (!serviceId) {
    return NextResponse.json({
      detected: false,
      message: locale === 'ka'
        ? 'მე ვარ Agent G — MyAvatar.ge-ის AI ორკესტრატორი. 13 სერვისიდან რომელი გჭირდება?\n\n**Avatar** · **Video** · **Image** · **Music Studio** · **Voice Clone** · **Game** · **Interior** · **Prompt** · **Terminal** · **Content Writer** · **Podcast** · **Character AI** · **Event Studio**'
        : 'I am Agent G — AI orchestrator of MyAvatar.ge. Which of our 13 services do you need?\n\n**Avatar** · **Video** · **Image** · **Music Studio** · **Voice Clone** · **Game** · **Interior** · **Prompt** · **Terminal** · **Content Writer** · **Podcast** · **Character AI** · **Event Studio**',
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

async function heygenGetVoiceId(apiKey: string, gender: string, language: string): Promise<string | null> {
  try {
    const res = await fetch(`${HEYGEN_BASE}/v2/voices`, { headers: { 'X-Api-Key': apiKey } });
    if (!res.ok) return null;
    const data = await res.json() as { data?: { voices?: Array<{ voice_id: string; language?: string; gender?: string }> } };
    const voices = data.data?.voices ?? [];
    if (voices.length === 0) return null;
    const langCode = (language === 'ka' ? 'en' : language).toLowerCase();

    // 1) gender + language match
    const full = voices.find(v =>
      v.gender?.toLowerCase() === gender.toLowerCase() &&
      v.language?.toLowerCase().startsWith(langCode)
    );
    if (full?.voice_id) return full.voice_id;

    // 2) gender match only
    const byGender = voices.find(v => v.gender?.toLowerCase() === gender.toLowerCase());
    if (byGender?.voice_id) return byGender.voice_id;

    // 3) first available voice
    return voices[0]?.voice_id ?? null;
  } catch {
    return null;
  }
}

async function heygenGetFirstAvatar(apiKey: string): Promise<string> {
  const res = await fetch(`${HEYGEN_BASE}/v2/avatars`, { headers: { 'X-Api-Key': apiKey } });
  if (!res.ok) throw new Error(`avatars list failed: ${res.status}`);
  const data = await res.json() as { data?: { avatars?: Array<{ avatar_id: string }> } };
  const first = data.data?.avatars?.[0];
  if (!first) throw new Error('No avatars in HeyGen account');
  return first.avatar_id;
}

async function heygenUploadPhotoAsset(apiKey: string, photoBase64: string, mimeType: string): Promise<string> {
  const b64 = (photoBase64.includes(',') ? photoBase64.split(',')[1] : photoBase64) ?? '';
  const binary = Buffer.from(b64, 'base64');
  const uint8 = new Uint8Array(binary.buffer, binary.byteOffset, binary.byteLength);
  const blob = new Blob([uint8], { type: mimeType || 'image/jpeg' });

  const form = new FormData();
  form.append('file', blob, 'photo.jpg');
  form.append('type', 'image');

  const res = await fetch(`${HEYGEN_BASE}/v1/asset`, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey },
    body: form,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`asset upload failed ${res.status}: ${err}`);
  }
  const data = await res.json() as { data?: { id?: string; asset_id?: string } };
  const id = data.data?.id ?? data.data?.asset_id;
  if (!id) throw new Error('no asset ID returned');
  return id;
}

async function heygenCreateTalkingPhoto(apiKey: string, assetId: string): Promise<string> {
  const res = await fetch(`${HEYGEN_BASE}/v1/talking_photo`, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_asset_id: assetId }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`talking_photo failed ${res.status}: ${err}`);
  }
  const data = await res.json() as { data?: { talking_photo_id?: string } };
  const id = data.data?.talking_photo_id;
  if (!id) throw new Error('no talking_photo_id returned');
  return id;
}

async function heygenCreateVideo(
  apiKey: string,
  character: Record<string, unknown>,
  voiceId: string | null,
  script: string,
  dimension: { width: number; height: number },
): Promise<string> {
  const voicePayload: Record<string, unknown> = { type: 'text', input_text: script.slice(0, 1500) };
  if (voiceId) voicePayload.voice_id = voiceId;

  const res = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_inputs: [{ character, voice: voicePayload }],
      dimension,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`video/generate ${res.status}: ${err}`);
  }
  const data = await res.json() as { data?: { video_id?: string }; video_id?: string };
  const videoId = data.data?.video_id ?? data.video_id;
  if (!videoId) throw new Error('no video_id returned');
  return videoId;
}

async function heygenPoll(apiKey: string, videoId: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    await new Promise<void>(r => setTimeout(r, 5000));
    const res = await fetch(`${HEYGEN_BASE}/v1/video_status.get?video_id=${videoId}`, {
      headers: { 'X-Api-Key': apiKey },
    });
    if (!res.ok) throw new Error(`poll error: ${res.status}`);
    const data = await res.json() as { data?: { status?: string; video_url?: string; error?: string } };
    const { status, video_url, error } = data.data ?? {};
    if (status === 'completed' && video_url) return video_url;
    if (status === 'failed') throw new Error(error ?? 'HeyGen generation failed');
  }
  throw new Error('HeyGen timed out after 150s');
}

// ─── Inline generators ────────────────────────────────────────────────────────

async function generateAvatar(
  script: string,
  answers: Record<string, string | string[]>,
  mediaFiles: MediaFile[],
): Promise<{ resultUrl?: string; outputKind: string; error?: string }> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return { outputKind: 'video', error: 'HEYGEN_API_KEY not configured' };

  const voiceGender   = String(answers.voice_gender   ?? 'female');
  const voiceLanguage = String(answers.voice_language ?? 'en');
  const videoFormat   = String(answers.video_format   ?? '16:9');

  const dimension = videoFormat === '9:16'
    ? { width: 720,  height: 1280 }
    : videoFormat === '1:1'
      ? { width: 720,  height: 720  }
      : { width: 1280, height: 720  };

  const voiceId = await heygenGetVoiceId(apiKey, voiceGender, voiceLanguage);
  const photoFile = mediaFiles.find(f => f.type === 'image');

  let character: Record<string, unknown>;

  if (photoFile) {
    const assetId       = await heygenUploadPhotoAsset(apiKey, photoFile.dataUrl, photoFile.mimeType);
    const talkingPhotoId = await heygenCreateTalkingPhoto(apiKey, assetId);
    character = { type: 'talking_photo', talking_photo_id: talkingPhotoId, talking_photo_style: 'rectangle' };
  } else {
    const avatarId = await heygenGetFirstAvatar(apiKey);
    character = { type: 'avatar', avatar_id: avatarId, avatar_style: 'normal' };
  }

  const videoId  = await heygenCreateVideo(apiKey, character, voiceId, script, dimension);
  const videoUrl = await heygenPoll(apiKey, videoId);
  return { resultUrl: videoUrl, outputKind: 'video' };
}

async function generateVideo(
  prompt: string,
  answers: Record<string, string | string[]>,
): Promise<{ resultUrl?: string; outputKind: string; error?: string }> {
  const { createPrediction, pollUntilDone } = await import('@/lib/replicate/client');
  const { resolveModel } = await import('@/lib/replicate/models');
  const { validateInput, buildModelInput } = await import('@/lib/replicate/schemas');
  const { normalizeOutput } = await import('@/lib/replicate/normalizer');

  const quality = String(answers.quality ?? 'standard');
  const aspectRatio = String(answers.aspect ?? '16:9');
  const variant = String(answers.variant ?? 'text-to-video');

  const validation = validateInput({ service: 'video', prompt, quality, aspectRatio, variant });
  if (!validation.valid || !validation.sanitized) {
    return { outputKind: 'video', error: validation.error ?? 'Invalid video input' };
  }

  const model = resolveModel('video', validation.sanitized.variant);
  const modelInput = buildModelInput(validation.sanitized);
  const prediction = await createPrediction(model.id, modelInput);
  const completed = prediction.status === 'succeeded' && prediction.output
    ? prediction
    : await pollUntilDone(prediction.id, 40, 2500);

  const normalized = normalizeOutput(
    'video', model.label, model.outputType,
    completed.id, completed.status, completed.output, completed.error ?? null, completed.metrics,
  );

  if (!normalized.url) return { outputKind: 'video', error: normalized.error ?? 'No video URL returned' };
  return { resultUrl: normalized.url, outputKind: 'video' };
}

async function generateImage(
  prompt: string,
  answers: Record<string, string | string[]>,
  mediaFiles: MediaFile[],
): Promise<{ resultUrl?: string; resultText?: string; outputKind: string; error?: string }> {
  const provider = String(
    answers.provider
      ?? answers.image_provider
      ?? answers.model_provider
      ?? 'replicate',
  ).toLowerCase();

  const endpoint = resolveNanoBananaEndpoint(
    answers.nanobanana_endpoint
      ?? answers.nanobananaEndpoint
      ?? answers.endpoint,
  );

  const aspectRatio = String(answers.aspect ?? '1:1');
  const style = String(answers.style ?? 'photorealistic');

  const refImage = mediaFiles.find(f => f.type === 'image');
  const enhancedPrompt = refImage
    ? `${prompt} [Reference image provided for composition/style guidance]`
    : prompt;

  if (provider === 'nanobanana') {
    try {
      const nanoResult = await generateNanoBananaImage({
        prompt: enhancedPrompt,
        endpoint,
        aspectRatio,
        style,
        referenceImageDataUrl: refImage?.dataUrl,
        service: 'image',
      });

      if (nanoResult.url) {
        return { resultUrl: nanoResult.url, outputKind: 'image' };
      }

      if (nanoResult.text) {
        return { resultText: nanoResult.text, outputKind: 'text' };
      }

      return { outputKind: 'image', error: 'NanoBanana did not return an output.' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'NanoBanana generation failed';
      return { outputKind: 'image', error: msg };
    }
  }

  const { createPrediction, pollUntilDone } = await import('@/lib/replicate/client');
  const { resolveModel }                    = await import('@/lib/replicate/models');
  const { validateInput, buildModelInput }  = await import('@/lib/replicate/schemas');
  const { normalizeOutput }                 = await import('@/lib/replicate/normalizer');

  const quality = String(answers.quality ?? 'standard');

  const validation = validateInput({ service: 'image', prompt: enhancedPrompt, quality, aspectRatio, style });
  if (!validation.valid || !validation.sanitized) {
    return { outputKind: 'image', error: validation.error ?? 'Invalid input' };
  }

  const model      = resolveModel('image', validation.sanitized.variant);
  const modelInput = buildModelInput(validation.sanitized);
  const prediction = await createPrediction(model.id, modelInput);
  const completed  = prediction.status === 'succeeded' && prediction.output
    ? prediction
    : await pollUntilDone(prediction.id, 30, 2000);

  const normalized = normalizeOutput(
    'image', model.label, model.outputType,
    completed.id, completed.status, completed.output, completed.error ?? null, completed.metrics,
  );

  if (!normalized.url) return { outputKind: 'image', error: normalized.error ?? 'No image URL returned' };
  return { resultUrl: normalized.url, outputKind: 'image' };
}

async function generateMusic(
  prompt: string,
  answers: Record<string, string | string[]>,
): Promise<{ resultUrl?: string; outputKind: string; error?: string }> {
  const provider = String(
    answers.provider
      ?? answers.music_provider
      ?? answers.musicProvider
      ?? (process.env.UDIO_API_KEY?.trim() ? 'udio' : 'replicate'),
  ).toLowerCase();

  if (provider === 'udio') {
    const styleTags = Array.isArray(answers.style_tags)
      ? answers.style_tags.map((item) => String(item).trim()).filter(Boolean)
      : typeof answers.style_tags === 'string'
        ? answers.style_tags.split(',').map((item) => item.trim()).filter(Boolean)
        : [];

    const lyricsMode = String(answers.lyrics_mode ?? '').toLowerCase();
    const makeInstrumental = lyricsMode === 'instrumental'
      || String(answers.make_instrumental ?? answers.instrumental ?? '').toLowerCase() === 'true';

    try {
      const result = await generateUdioTrack({
        prompt,
        lyrics: typeof answers.lyrics === 'string' ? answers.lyrics : undefined,
        style: typeof answers.style === 'string' ? answers.style : undefined,
        title: typeof answers.title === 'string' ? answers.title : undefined,
        genre: typeof answers.genre === 'string' ? answers.genre : undefined,
        mood: typeof answers.mood === 'string' ? answers.mood : undefined,
        styleTags,
        model: typeof answers.model === 'string' ? answers.model : undefined,
        makeInstrumental,
      }, {
        maxAttempts: 40,
        pollIntervalMs: 3000,
      });

      if (result.status === 'failed') {
        return { outputKind: 'audio', error: result.message || 'Udio generation failed' };
      }

      if (!result.audioUrl) {
        return { outputKind: 'audio', error: 'Udio completed without audio URL' };
      }

      return { resultUrl: result.audioUrl, outputKind: 'audio' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Udio generation failed';
      return { outputKind: 'audio', error: msg };
    }
  }

  const { createPrediction, pollUntilDone } = await import('@/lib/replicate/client');
  const { resolveModel } = await import('@/lib/replicate/models');
  const { validateInput, buildModelInput } = await import('@/lib/replicate/schemas');
  const { normalizeOutput } = await import('@/lib/replicate/normalizer');

  const quality = String(answers.quality ?? 'standard');
  const variant = String(answers.variant ?? 'soundtrack');

  const validation = validateInput({ service: 'music', prompt, quality, variant });
  if (!validation.valid || !validation.sanitized) {
    return { outputKind: 'audio', error: validation.error ?? 'Invalid music input' };
  }

  const model = resolveModel('music', validation.sanitized.variant);
  const modelInput = buildModelInput(validation.sanitized);
  const prediction = await createPrediction(model.id, modelInput);
  const completed = prediction.status === 'succeeded' && prediction.output
    ? prediction
    : await pollUntilDone(prediction.id, 40, 2500);

  const normalized = normalizeOutput(
    'music', model.label, model.outputType,
    completed.id, completed.status, completed.output, completed.error ?? null, completed.metrics,
  );

  if (!normalized.url) return { outputKind: 'audio', error: normalized.error ?? 'No audio URL returned' };
  return { resultUrl: normalized.url, outputKind: 'audio' };
}

async function generateOpenAITtsDataUrl(text: string): Promise<string> {
  if (!openai) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const speech = await openai.audio.speech.create({
    model: 'gpt-4o-mini-tts',
    voice: 'alloy',
    input: text.slice(0, 4096),
    response_format: 'mp3',
  });

  const audioBuffer = Buffer.from(await speech.arrayBuffer());
  return `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;
}

// ─── Main generate handler ────────────────────────────────────────────────────

async function handleGenerate(
  serviceId: ServiceId,
  finalPrompt: string,
  rawScript: string,
  locale: string,
  answers: Record<string, string | string[]>,
  mediaFiles: MediaFile[],
) {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // ── Text services via Claude ──────────────────────────────────────────────
  const TEXT_SERVICES: ServiceId[] = ['game', 'prompt-builder', 'terminal', 'content-writer', 'podcast', 'character', 'event'];

  if (TEXT_SERVICES.includes(serviceId)) {
    const outputKind = serviceId === 'terminal' ? 'code' : 'text';
    const systemPrompts: Record<string, string> = {
      game:             'You are a senior game designer. Produce detailed, structured game design documents in markdown. Include mechanics, narrative, level design, and monetization in separate sections.',
      'prompt-builder': 'You are a world-class prompt engineer. Return ONLY the final optimized prompt — no preamble, no explanation.',
      terminal:         'You are a Staff Engineer. Write production-ready, secure, well-structured code with markdown code blocks.',
      'content-writer': 'You are a world-class copywriter and content strategist. Produce high-quality, engaging, SEO-aware content. Use natural language, avoid generic AI phrases. Format in clean markdown.',
      podcast:          'You are a professional podcast producer and scriptwriter. Create complete, engaging podcast scripts with clear segment structure, natural dialogue, and strong hooks. Format in markdown with speaker labels.',
      character:        'You are a master character designer and narrative architect. Create rich, multi-dimensional characters with deep backstories, consistent voice, and cultural depth. Format in clean markdown with clear sections.',
      event:            'You are a professional event producer and copywriter. Create comprehensive event materials including programs, MC scripts, promo copy, and invitations. Be specific, engaging, and culturally aware. Format in clean markdown.',
    };

    try {
      const result = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompts[serviceId] ?? 'You are a helpful AI assistant.',
        messages: [{ role: 'user', content: finalPrompt }],
      });
      const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
      return NextResponse.json({
        jobId, status: 'done', serviceId, outputKind,
        result: text,
        tokensUsed: result.usage.input_tokens + result.usage.output_tokens,
      });
    } catch (anthropicErr) {
      try {
        const text = await generateTextWithOpenAI(
          systemPrompts[serviceId] ?? 'You are a helpful AI assistant.',
          finalPrompt,
        );

        return NextResponse.json({
          jobId,
          status: 'done',
          serviceId,
          outputKind,
          result: text,
          provider: 'openai',
        });
      } catch (openaiErr) {
        const anthropicMsg = anthropicErr instanceof Error ? anthropicErr.message : 'Anthropic unavailable';
        const openaiMsg = openaiErr instanceof Error ? openaiErr.message : 'OpenAI unavailable';
        const msg = `Text generation unavailable: ${anthropicMsg}; ${openaiMsg}`;
        return NextResponse.json({ jobId, status: 'error', serviceId, error: msg }, { status: 200 });
      }
    }
  }

  // ── Media services — inline API calls ────────────────────────────────────
  try {
    let genResult: { resultUrl?: string; resultText?: string; outputKind: string; error?: string };

    switch (serviceId) {
      case 'avatar':
        // rawScript = what the user actually typed (the speech text)
        genResult = await generateAvatar(rawScript, answers, mediaFiles);
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
      case 'voice': {
        const elevenKey = process.env.ELEVENLABS_API_KEY;
        const voiceId = process.env.ELEVENLABS_GEORGIAN_VOICE_ID || process.env.ELEVENLABS_VOICE_ID || 'vWpzdSR8GpLUKR0ai8Li';
        if (elevenKey) {
          const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ text: finalPrompt.slice(0, 5000), model_id: 'eleven_turbo_v2_5', voice_settings: { stability: 0.75, similarity_boost: 0.85 } }),
          });

          if (ttsRes.ok) {
            const ttsData = await ttsRes.json() as { audio_base64?: string };
            genResult = { outputKind: 'audio', resultUrl: ttsData.audio_base64 ? `data:audio/mpeg;base64,${ttsData.audio_base64}` : undefined };
            break;
          }
        }

        try {
          const dataUrl = await generateOpenAITtsDataUrl(finalPrompt);
          genResult = { outputKind: 'audio', resultUrl: dataUrl };
        } catch (ttsErr) {
          const ttsMsg = ttsErr instanceof Error ? ttsErr.message : 'Voice generation failed';
          genResult = { outputKind: 'audio', error: ttsMsg };
        }
        break;
      }
      default:
        genResult = { outputKind: 'text', error: `Unknown service: ${serviceId}` };
    }

    if (genResult.error) {
      return NextResponse.json({ jobId, status: 'error', serviceId, error: genResult.error }, { status: 200 });
    }

    if (genResult.outputKind === 'text' || genResult.outputKind === 'code') {
      if (!genResult.resultText) {
        return NextResponse.json({ jobId, status: 'error', serviceId, error: 'Missing text output' }, { status: 200 });
      }

      return NextResponse.json({
        jobId,
        status: 'done',
        serviceId,
        outputKind: genResult.outputKind,
        result: genResult.resultText,
      });
    }

    if (!genResult.resultUrl) {
      return NextResponse.json({ jobId, status: 'error', serviceId, error: 'Missing result URL' }, { status: 200 });
    }

    return NextResponse.json({
      jobId, status: 'done', serviceId,
      outputKind: genResult.outputKind,
      result_url: genResult.resultUrl,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Generation failed';
    console.error(`[pipeline/generate] ${serviceId}:`, msg);
    return NextResponse.json({ jobId, status: 'error', serviceId, error: msg }, { status: 200 });
  }
}

// ─── Frontend → backend service ID aliases ────────────────────────────────────
// Frontend uses hyphenated compound IDs; registry uses short IDs.

const SERVICE_ID_ALIASES: Record<string, ServiceId> = {
  'game-creation':   'game',
  'interior-design': 'interior',
  'terminal-coding': 'terminal',
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

    const { action, userInput, answers, mediaFiles, locale } = parsed.data;
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
        const finalPrompt = answers
          ? buildFinalPrompt(serviceId as ServiceId, userInput, answers)
          : userInput;
        return handleGenerate(
          serviceId as ServiceId,
          finalPrompt,
          userInput,      // raw script (used for avatar)
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
