/**
 * lib/gemini/image-analysis.ts
 * =============================
 * Room/interior image analysis using Gemini Pro multimodal.
 * Extracts style, materials, colors, lighting, and generates
 * a Marble/WorldLabs 3D prompt.
 */

import { generateWithGemini } from './client';
import { getGeminiSystemPrompt } from './prompts';
import { fetchAllowlistedAudio, isOwnSupabaseUrl, readBodyWithCap } from '@/lib/security/allowlistedAudioFetch';

export interface RoomAnalysisResult {
  style: string;
  materials: string[];
  colors: string[];
  lighting: string;
  issues: string[];
  suggestions: string[];
  marblePrompt: string;
  confidence: number;
}

export async function analyzeRoomImage(
  imageBase64: string,
  mimeType: string,
  locale: string,
): Promise<RoomAnalysisResult> {
  const systemPrompt = getGeminiSystemPrompt('interior', locale);

  const analysisPrompt =
    locale === 'ka'
      ? `გაანალიზე ეს ოთახის ფოტო. დააბრუნე JSON ამ სტრუქტურით: {"style":"","materials":[],"colors":[],"lighting":"","issues":[],"suggestions":[],"marblePrompt":"","confidence":0.0}. marblePrompt უნდა იყოს ინგლისური, პროფესიონალური არქიტექტურული prompt Marble/WorldLabs 3D API-სთვის, 8K detail-ით.`
      : `Analyze this room photo. Return JSON: {"style":"","materials":[],"colors":[],"lighting":"","issues":[],"suggestions":[],"marblePrompt":"","confidence":0.0}. marblePrompt must be a professional architectural prompt for Marble/WorldLabs 3D API with 8K detail.`;

  const response = await generateWithGemini({
    prompt: analysisPrompt,
    systemPrompt,
    tier: 'pro',
    attachments: [{ type: 'image', mimeType, data: imageBase64 }],
    temperature: 0.3,
  });

  try {
    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as RoomAnalysisResult;
  } catch {
    // Fall through to default
  }

  return {
    style: 'Unknown',
    materials: [],
    colors: [],
    lighting: 'Unknown',
    issues: [],
    suggestions: [response.text],
    marblePrompt: '',
    confidence: 0.5,
  };
}

/**
 * VISION PRE-EXTRACTION LAYER (character-lock).
 *
 * Given a user's uploaded reference photo (URL), extract a concise, factual visual ID of the SINGLE main person —
 * age, gender, face, hair/beard, build, wardrobe, setting — so the (text-only) film Prompt Agent can lock the REAL
 * subject into every scene instead of hallucinating a stock persona (the classic "30-year-old man in a skydiver
 * suit" drift when an elderly bearded man was uploaded).
 *
 * FAIL-OPEN: any failure (no Gemini key, non-image, fetch error, empty result) returns null — the caller then falls
 * back to the existing strong "don't invent a persona" text instruction + the start-image identity lock.
 */
export async function describeCharacterFromImage(imageUrl: string, locale: string): Promise<string | null> {
  try {
    // SSRF-SAFE, own-tenant-only: the URL must be on OUR OWN Supabase project host (isOwnSupabaseUrl — exact match,
    // NOT the broad *.supabase.co suffix), so an unauthenticated caller cannot point us at an arbitrary tenant's
    // bucket or an internal/metadata address. fetchAllowlistedAudio then re-validates every redirect hop. A ref that
    // isn't ours just yields null → fail-open to the strong text instruction (no vision, identity still locked).
    if (!isOwnSupabaseUrl(imageUrl)) return null;
    const res = await fetchAllowlistedAudio(imageUrl, { timeoutMs: 20_000 });
    if (!res) return null;
    const mimeType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0]!.trim();
    if (!/^image\//i.test(mimeType)) return null;
    // HARD byte cap enforced DURING download (not after) — a malicious host streaming gigabytes can never OOM us.
    const buf = await readBodyWithCap(res, 12_000_000);
    if (!buf || buf.byteLength < 256) return null;

    const prompt = locale === 'ka'
      ? 'დააკვირდი ამ ფოტოს და აღწერე მხოლოდ ერთი, მთავარი ადამიანი, როგორც ვიზუალური იდენტობა კინო-პერსონაჟისთვის: მიახლოებითი ასაკი, სქესი, სახე, თმა/წვერი, აღნაგობა, ტანსაცმელი და გარემო. ერთი მკაფიო წინადადება, ინგლისურად, ფოტორეალისტური. არა სახელები, არა სიუჟეტი, არა კამერის ინსტრუქციები.'
      : 'Look at this photo and describe ONLY the single main person as a concise visual ID for a film character-lock: approximate age, gender, face, hair/beard, skin, build, clothing/wardrobe, and immediate setting. ONE vivid sentence, present tense, English, photorealistic live-action. No names, no story, no camera directions. Example: "an elderly weathered man in his 70s with a thick white beard and grey hair, deep-set eyes, wearing a dark wool vest, standing in a mountain landscape".';

    // generateWithGemini has no internal timeout — bound it here so a hung vision call can never stall the storyboard.
    const out = await Promise.race([
      generateWithGemini({
        prompt,
        tier: 'flash', // a plain description — flash is fast + cheap and plenty for this
        attachments: [{ type: 'image', mimeType, data: buf.toString('base64') }],
        temperature: 0.2,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 25_000)),
    ]);
    if (!out) return null;
    const text = (out.text || '').trim().replace(/^["'“”]+|["'“”]+$/g, '').replace(/\s+/g, ' ').slice(0, 500);
    return text.length >= 12 ? text : null;
  } catch {
    return null;
  }
}
