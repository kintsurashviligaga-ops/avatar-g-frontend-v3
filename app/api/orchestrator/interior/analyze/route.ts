/**
 * POST /api/orchestrator/interior/analyze — Agent N (Depth & Schema Extraction).
 *
 * Accepts up to 3 context photos and returns a structured RoomGeometry JSON
 * (floor plan, wall dims, openings — clutter ignored), estimated by Gemini
 * vision. True metric depth (ZoeDepth / Segment-Anything / LiDAR) is a GPU-worker
 * upgrade gated like RunPod; this VLM estimate is the always-on default.
 *
 * Request:  { images: [{ base64, mimeType }] (1–3), brief?: string }
 * Response: { geometry: RoomGeometry, model: string, degraded: boolean }
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { authedClientFromRequest } from '@/lib/supabase/server';
import {
  buildGeometrySystemPrompt, normalizeRoomGeometry, DEFAULT_ROOM_GEOMETRY,
} from '@/lib/orchestrator/interior';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 45;

const VISION_MODEL = process.env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash';

interface Img { base64?: string; mimeType?: string }
interface Body { images?: Img[]; brief?: string }

function geminiKeys(): string[] {
  const csv = (process.env.GEMINI_API_KEYS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const single = (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '').trim();
  if (single) csv.push(single);
  return [...new Set(csv)];
}

function extractJson(text: string): unknown {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  try { return JSON.parse(candidate.slice(start)); } catch { /* trailing prose */ }
  const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
  if (end > start) { try { return JSON.parse(candidate.slice(start, end + 1)); } catch { /* give up */ } }
  return null;
}

export async function POST(req: NextRequest) {
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const rl = await checkRateLimit(req, RATE_LIMITS.WRITE); if (rl) return rl;

  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }); }
  const images = (body.images ?? []).filter(i => typeof i.base64 === 'string' && i.base64!.length > 0).slice(0, 3);
  if (images.length === 0) return NextResponse.json({ error: 'at least 1 photo required' }, { status: 400 });
  const brief = String(body.brief ?? '').trim();

  const keys = geminiKeys();
  if (keys.length === 0) {
    return NextResponse.json({ geometry: { ...DEFAULT_ROOM_GEOMETRY }, model: 'deterministic', degraded: true });
  }

  const content = [
    { type: 'text' as const, text: `${brief ? `Brief: "${brief}". ` : ''}Estimate the empty-room geometry from these ${images.length} photo(s).` },
    ...images.map(i => ({
      type: 'image' as const,
      image: i.base64!.startsWith('data:') ? i.base64! : `data:${i.mimeType ?? 'image/jpeg'};base64,${i.base64!}`,
    })),
  ];

  for (const apiKey of keys) {
    try {
      const google = createGoogleGenerativeAI({ apiKey });
      const { text } = await generateText({
        model: google(VISION_MODEL),
        maxRetries: 4,
        system: buildGeometrySystemPrompt(),
        messages: [{ role: 'user', content }],
      });
      const parsed = extractJson(text);
      if (parsed) return NextResponse.json({ geometry: normalizeRoomGeometry(parsed), model: VISION_MODEL, degraded: false });
    } catch { /* rotate to next key */ }
  }
  return NextResponse.json({ geometry: { ...DEFAULT_ROOM_GEOMETRY }, model: 'deterministic', degraded: true });
}
