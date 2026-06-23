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
import { buildInteriorDesignBrief } from '@/lib/interior/smart-intake';
import { generateNanoBananaImage } from '@/lib/nanobanana/client';
import { resolveNanoBananaEndpoint } from '@/lib/nanobanana/endpoints';
import { generateUdioTrack } from '@/lib/udio/client';
import { generateWorldLabsInterior } from '@/lib/worldlabs/client';
import { buildIterativePrompt } from '@/lib/chat/iteration-store';
import { generateWithGemini } from '@/lib/gemini/client';
import { getGeminiSystemPrompt, type GeminiServiceContext } from '@/lib/gemini/prompts';
import { reportError } from '@/lib/observability/report-error';
import { selectTtsModel, voiceSettingsForModel } from '@/lib/audio/tts-model';
import { georgianVoiceId } from '@/lib/audio/georgian-voice';
import { textToHostedSpeech } from '@/lib/chat/filmVoiceover';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // HeyGen avatar polling can take up to 150s; LTX video up to 90s

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const HEYGEN_BASE = 'https://api.heygen.com';
/** Bundled default presenter portrait — same canonical face the presenter route uses.
 *  Never derive from the request origin (the *.vercel.app host 401s a self-fetch). */
const AVATAR_DEFAULT_FACE_URL = process.env.PRESENTER_FACE_URL || 'https://myavatar.ge/presenter/default-female.jpg';
/** Reuse a resolved talking_photo across warm invocations (HeyGen caps photo avatars
 *  at 3 — uploading a new one per call hits error 401028). */
let cachedAvatarTalkingPhotoId: string | null = null;

/** First existing talking_photo_id on the account (avoids the 3-photo cap and avoids
 *  the unusably slow /v2/avatars list that was the root of the original 504s).
 *  The list shape uses `id` (a HeyGen quirk), not `talking_photo_id`. */
async function firstExistingTalkingPhotoId(apiKey: string): Promise<string | null> {
  try {
    const r = await fetch(`${HEYGEN_BASE}/v1/talking_photo.list`, { headers: { 'X-Api-Key': apiKey }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const j = (await r.json().catch(() => null)) as { data?: Array<{ id?: string; talking_photo_id?: string }> } | null;
    for (const item of (j?.data ?? [])) { const id = item?.id || item?.talking_photo_id; if (id) return id; }
    return null;
  } catch { return null; }
}

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
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
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
        ? 'მე ვარ Agent G — MyAvatar.ge-ის AI ორკესტრატორი. 14 სერვისიდან რომელი გჭირდება?\n\n**Avatar** · **Video** · **Image** · **Music Studio** · **Voice Clone** · **Game** · **Interior** · **Prompt** · **Terminal** · **Content Writer** · **Podcast** · **Character AI** · **Event Studio** · **Tourism**'
        : 'I am Agent G — AI orchestrator of MyAvatar.ge. Which of our 14 services do you need?\n\n**Avatar** · **Video** · **Image** · **Music Studio** · **Voice Clone** · **Game** · **Interior** · **Prompt** · **Terminal** · **Content Writer** · **Podcast** · **Character AI** · **Event Studio** · **Tourism**',
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
  voice: Record<string, unknown>,
  dimension: { width: number; height: number },
): Promise<string> {
  const res = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_inputs: [{ character, voice }],
      dimension,
    }),
    signal: AbortSignal.timeout(20_000),
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

  const videoFormat = String(answers.video_format ?? '16:9');
  const dimension = videoFormat === '9:16'
    ? { width: 720,  height: 1280 }
    : videoFormat === '1:1'
      ? { width: 720,  height: 720  }
      : { width: 1280, height: 720  };

  // Voice: synthesize the script in our CLONED Georgian voice (honouring the user's
  // Female/Male choice) and drive HeyGen with voice.type:'audio' — far better than
  // HeyGen's own generic English voices, and it lip-syncs native Georgian.
  const gender = String(answers.voice_gender ?? 'female').toLowerCase() === 'male' ? 'male' : 'female';
  const audioUrl = await textToHostedSpeech(script.slice(0, 1500), georgianVoiceId(gender)).catch(() => null);
  if (!audioUrl) return { outputKind: 'video', error: 'voice synthesis failed (no cloned-voice audio)' };

  // Face: resolve a talking_photo WITHOUT the unusably slow /v2/avatars list (the root
  // of the original 504 gateway timeouts). Priority: user's uploaded photo → a cached/
  // existing account talking_photo → upload the default presenter face once.
  const photoFile = mediaFiles.find(f => f.type === 'image');
  let talkingPhotoId: string | null = null;
  let style: 'rectangle' | 'square' = 'square';
  if (photoFile) {
    const assetId = await heygenUploadPhotoAsset(apiKey, photoFile.dataUrl, photoFile.mimeType);
    talkingPhotoId = await heygenCreateTalkingPhoto(apiKey, assetId);
    style = 'rectangle';
  } else {
    talkingPhotoId = cachedAvatarTalkingPhotoId || await firstExistingTalkingPhotoId(apiKey);
    if (!talkingPhotoId) {
      const faceRes = await fetch(AVATAR_DEFAULT_FACE_URL, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
      if (faceRes && faceRes.ok) {
        const mime = faceRes.headers.get('content-type') || 'image/jpeg';
        const b64 = Buffer.from(await faceRes.arrayBuffer()).toString('base64');
        const assetId = await heygenUploadPhotoAsset(apiKey, b64, mime);
        talkingPhotoId = await heygenCreateTalkingPhoto(apiKey, assetId);
      }
    }
    cachedAvatarTalkingPhotoId = talkingPhotoId;
  }
  if (!talkingPhotoId) return { outputKind: 'video', error: 'no talking_photo available (HeyGen photo-avatar cap reached and none reusable)' };

  const character = { type: 'talking_photo', talking_photo_id: talkingPhotoId, talking_photo_style: style };
  const videoId  = await heygenCreateVideo(apiKey, character, { type: 'audio', audio_url: audioUrl }, dimension);
  const videoUrl = await heygenPoll(apiKey, videoId);
  // Re-host to a stable 7-day Supabase URL: HeyGen's result URL expires (~1h) → a blank
  // player on revisit. Fail-open — any miss returns the raw provider URL.
  return { resultUrl: await rehostHeygenVideo(videoUrl), outputKind: 'video' };
}

/** Re-host a finished HeyGen video to a stable 7-day Supabase URL (mirrors the
 *  presenter route). Fail-open: returns the raw provider URL on any miss. */
async function rehostHeygenVideo(providerUrl: string): Promise<string> {
  try {
    const r = await fetch(providerUrl, { signal: AbortSignal.timeout(45_000) });
    if (!r.ok) return providerUrl;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength < 1024 || buf.byteLength > 80 * 1024 * 1024) return providerUrl;
    const path = `avatar/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
    return (await uploadAndSign('uploads', path, buf.toString('base64'), 'video/mp4', 604_800)) || providerUrl;
  } catch {
    return providerUrl;
  }
}

async function generateVideo(
  prompt: string,
  answers: Record<string, string | string[]>,
): Promise<{ resultUrl?: string; outputKind: string; error?: string }> {
  // Prefer LTX when key is available (higher quality, synchronous)
  const ltxKey = process.env.LTX_VIDEO_API_KEY;
  if (ltxKey) {
    const resolution = String(answers.resolution ?? '1920x1080');
    const duration   = Number(answers.duration ?? 6);
    const fps        = Number(answers.fps ?? 24);
    const model      = String(answers.ltx_model ?? 'ltx-2-3-fast');

    try {
      const ltxRes = await fetch('https://api.ltx.video/v1/text-to-video', {
        method: 'POST',
        headers: { Authorization: `Bearer ${ltxKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model, resolution, duration, fps, generate_audio: false }),
      });

      if (ltxRes.ok) {
        const arrayBuf = await ltxRes.arrayBuffer();
        const base64 = Buffer.from(arrayBuf).toString('base64');
        return { resultUrl: `data:video/mp4;base64,${base64}`, outputKind: 'video' };
      }

      const errText = await ltxRes.text().catch(() => '');
      console.warn('[pipeline/video] LTX failed, falling back to Replicate:', ltxRes.status, errText);
    } catch (ltxErr) {
      console.warn('[pipeline/video] LTX error, falling back to Replicate:', ltxErr);
    }
  }

  // Fallback: Replicate minimax/video-01-live (returns a URL)
  try {
    const { runReplicateModel } = await import('@/lib/replicate/client');
    const output = await runReplicateModel('minimax/video-01-live', {
      prompt,
      prompt_optimizer: true,
    });

    const videoUrl =
      typeof output === 'string'
        ? output
        : output instanceof URL
          ? output.href
          : Array.isArray(output) && output.length > 0
            ? String(output[0])
            : null;

    if (!videoUrl) return { outputKind: 'video', error: 'No video URL returned from model' };
    return { resultUrl: videoUrl, outputKind: 'video' };
  } catch (replicateErr) {
    const msg = replicateErr instanceof Error ? replicateErr.message : 'Video generation failed';
    return { outputKind: 'video', error: msg };
  }
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

async function generateInterior(
  prompt: string,
  answers: Record<string, string | string[]>,
  mediaFiles: MediaFile[],
): Promise<{
  resultUrl?: string;
  resultText?: string;
  outputKind: string;
  error?: string;
  spatialLink?: string | null;
  modelUrl?: string | null;
  previewImageUrl?: string | null;
  provider?: string;
  creditsRemaining?: number | null;
  adminAlertTriggered?: boolean;
}> {
  const imageFile = mediaFiles.find((file) => file.type === 'image');
  if (!imageFile?.dataUrl) {
    return { outputKind: 'text', error: 'Upload a clear room photo before starting 3D interior generation.' };
  }

  const width = Number(answers.image_width ?? 0);
  const height = Number(answers.image_height ?? 0);
  if (Number.isFinite(width) && Number.isFinite(height) && (width < 960 || height < 720)) {
    return {
      outputKind: 'text',
      error: 'To get the best 3D result, please upload a high-resolution photo with clear lighting.',
    };
  }

  const confirmed = String(answers.confirm_design_brief ?? 'false').toLowerCase() === 'true';
  if (!confirmed) {
    return {
      outputKind: 'text',
      error: 'Please confirm the generated Design Brief before generating the Interior Design.',
    };
  }

  const designBrief = buildInteriorDesignBrief({
    userPrompt: String(prompt || ''),
    answers: {
      primaryGoal: String(answers.primary_goal || 'full_renovation'),
      colorPalette: String(answers.color_palette || 'neutral_scandi'),
      materials: String(answers.materials || 'natural_wood'),
      lightingVibe: String(answers.lighting_vibe || 'natural_sunlight'),
    },
  });

  try {
    const world = await generateWorldLabsInterior({
      imageDataUrl: imageFile.dataUrl,
      prompt: designBrief,
      filename: imageFile.name,
    });

    return {
      outputKind: 'text',
      resultUrl: world.previewImageUrl || world.spatialLink || undefined,
      resultText: world.spatialLink
        ? '3D interior world generated successfully. Open embedded viewer below.'
        : world.message || '3D interior generation completed.',
      spatialLink: world.spatialLink,
      modelUrl: world.glbUrl,
      previewImageUrl: world.previewImageUrl,
      provider: 'worldlabs',
      creditsRemaining: world.creditsRemaining,
      adminAlertTriggered: world.adminAlertTriggered,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Interior Design generation failed';
    return { outputKind: 'text', error: message };
  }
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
  sessionId: string,
  locale: string,
  answers: Record<string, string | string[]>,
  mediaFiles: MediaFile[],
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

  // ── Text services (Gemini as primary assistant brain) ─────────────────────
  const TEXT_SERVICES: ServiceId[] = ['game', 'prompt-builder', 'terminal', 'content-writer', 'podcast', 'character', 'event', 'tourism'];

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

    if (serviceId === 'terminal') {
      try {
        const result = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: systemPrompts[serviceId] ?? 'You are a helpful AI assistant.',
          messages: [{ role: 'user', content: effectivePrompt }],
        });
        const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
        return NextResponse.json({
          jobId, status: 'done', serviceId, outputKind,
          result: text,
          provider: 'anthropic',
          tokensUsed: result.usage.input_tokens + result.usage.output_tokens,
          iteration: iterative.iteration,
        });
      } catch (anthropicErr) {
        try {
          const text = await generateTextWithGemini(serviceId, locale, `${systemPrompts[serviceId]}\n\n${effectivePrompt}`);
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
          const anthropicMsg = anthropicErr instanceof Error ? anthropicErr.message : 'Anthropic unavailable';
          const geminiMsg = geminiErr instanceof Error ? geminiErr.message : 'Gemini unavailable';
          return NextResponse.json({ jobId, status: 'error', serviceId, error: `Terminal generation unavailable: ${anthropicMsg}; ${geminiMsg}` }, { status: 200 });
        }
      }
    }

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
      try {
        const result = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: systemPrompts[serviceId] ?? 'You are a helpful AI assistant.',
          messages: [{ role: 'user', content: enrichedPrompt }],
        });
        const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
        return NextResponse.json({
          jobId,
          status: 'done',
          serviceId,
          outputKind,
          result: text,
          provider: 'anthropic',
          tokensUsed: result.usage.input_tokens + result.usage.output_tokens,
          iteration: iterative.iteration,
        });
      } catch (anthropicErr) {
        try {
          const text = await generateTextWithOpenAI(
            systemPrompts[serviceId] ?? 'You are a helpful AI assistant.',
            enrichedPrompt,
          );
          return NextResponse.json({
            jobId,
            status: 'done',
            serviceId,
            outputKind,
            result: text,
            provider: 'openai',
            iteration: iterative.iteration,
          });
        } catch (openaiErr) {
          const geminiMsg = geminiErr instanceof Error ? geminiErr.message : 'Gemini unavailable';
          const anthropicMsg = anthropicErr instanceof Error ? anthropicErr.message : 'Anthropic unavailable';
          const openaiMsg = openaiErr instanceof Error ? openaiErr.message : 'OpenAI unavailable';
          const msg = `Text generation unavailable: ${geminiMsg}; ${anthropicMsg}; ${openaiMsg}`;
          return NextResponse.json({ jobId, status: 'error', serviceId, error: msg }, { status: 200 });
        }
      }
    }
  }

  // ── Media services — inline API calls ────────────────────────────────────
  try {
    let genResult: {
      resultUrl?: string;
      resultText?: string;
      outputKind: string;
      error?: string;
      spatialLink?: string | null;
      modelUrl?: string | null;
      previewImageUrl?: string | null;
      provider?: string;
      creditsRemaining?: number | null;
      adminAlertTriggered?: boolean;
    };

    switch (serviceId) {
      case 'avatar':
        // rawScript = what the user actually typed (the speech text)
        genResult = await generateAvatar(rawScript, answers, mediaFiles);
        break;
      case 'video':
        genResult = await generateVideo(effectivePrompt, answers);
        break;
      case 'image':
        genResult = await generateImage(effectivePrompt, answers, mediaFiles);
        break;
      case 'music':
        genResult = await generateMusic(effectivePrompt, answers);
        break;
      case 'interior':
        genResult = await generateInterior(effectivePrompt, answers, mediaFiles);
        break;
      case 'voice': {
        const elevenKey = process.env.ELEVENLABS_API_KEY;
        // v329 — Georgian → the CLONED native voice on eleven_v3 (the only model that
        // supports `ka`); other languages keep the configured voice on turbo. The old
        // code hard-coded turbo (which mangles Georgian) + the non-native voice.
        const isKa = /[ა-ჿ]/.test(effectivePrompt);
        const voiceId = isKa
          ? georgianVoiceId('female')
          : (process.env.ELEVENLABS_VOICE_ID || georgianVoiceId('female'));
        const modelId = selectTtsModel(effectivePrompt);
        if (elevenKey) {
          // Buffered (binary) — the plain endpoint returns audio bytes, and eleven_v3
          // is not reliably served by the streaming endpoint.
          const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
            body: JSON.stringify({ text: effectivePrompt.slice(0, 5000), model_id: modelId, voice_settings: voiceSettingsForModel(modelId) }),
          });

          if (ttsRes.ok) {
            const buf = Buffer.from(await ttsRes.arrayBuffer());
            if (buf.byteLength > 1024) {
              genResult = { outputKind: 'audio', resultUrl: `data:audio/mpeg;base64,${buf.toString('base64')}` };
              break;
            }
          }
        }

        try {
          const dataUrl = await generateOpenAITtsDataUrl(effectivePrompt);
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
        result: genResult.resultText,
        spatial_link: genResult.spatialLink,
        model_url: genResult.modelUrl,
        preview_image_url: genResult.previewImageUrl,
        provider: genResult.provider,
        credits_remaining: genResult.creditsRemaining,
        admin_alert_triggered: genResult.adminAlertTriggered,
        iteration: iterative.iteration,
      });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Generation failed';
    reportError(err, { route: '/api/pipeline', stage: 'generate', serviceId, jobId });
    return NextResponse.json({ jobId, status: 'error', serviceId, error: msg }, { status: 200 });
  }
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

    const { action, userInput, answers, mediaFiles, locale, sessionId } = parsed.data;
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
          sessionId || `pipeline_${Date.now()}`,
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
