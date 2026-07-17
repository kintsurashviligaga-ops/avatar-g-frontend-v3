/**
 * POST /api/ai/agent-g — Agent G, the central intent ROUTER.
 *
 * Reads the user's chat prompt + the kind of any attached asset and returns WHICH Surgical Editor workspace to open
 * and (for photo/audio) the concrete sub-agent action to auto-run. It is a fast, FREE, deterministic classifier — it
 * does NOT generate or charge. The metered execution + reserve-before-render billing + refund-on-failure already
 * live in the sub-agent routes it points at (/api/ai/edit-photo, /api/ai/edit-audio) and the client-driven video NLE,
 * so there is no double-charge and no new billing surface here.
 *
 * SECURITY: a valid Supabase session is required (401 anon). Ambiguous intent → { route: 'CLARIFY' } with a
 * localized message so the caller can fall back to a normal conversational reply.
 */
import { NextRequest, NextResponse } from 'next/server';
import { guardGeneration } from '@/lib/api/generationGuard';
import { classifyIntent, type AssetKind } from '@/lib/ai/agentG';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CLARIFY_MSG: Record<string, string> = {
  ka: 'ზუსტად ვერ მივხვდი რისი გაკეთება გინდა. მიამაგრე სურათი, ვიდეო ან აუდიო და დამიწერე მოქმედება — მაგ. „მოაშორე ფონი“, „გააფერადე“, „ვოკალი გამოყავი“.',
  en: 'I couldn’t tell what you want to edit. Attach an image, video or audio and tell me the action — e.g. “remove the background”, “colorize”, “split the vocals”.',
  ru: 'Не совсем понял, что нужно отредактировать. Прикрепите изображение, видео или аудио и укажите действие — напр. «убери фон», «раскрась», «извлеки вокал».',
};

export async function POST(req: NextRequest) {
  const guard = await guardGeneration(req, 'image', { gate: false }); // auth-only (401 anon); routing is free
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as { text?: string; mediaKind?: string } | null;
  const text = typeof body?.text === 'string' ? body.text.slice(0, 4000) : '';
  const rawKind = String(body?.mediaKind || '').toLowerCase();
  const assetKind: AssetKind | null = rawKind === 'image' || rawKind === 'video' || rawKind === 'audio' ? (rawKind as AssetKind) : null;

  const decision = classifyIntent(text, assetKind);
  const message = decision.route === 'CLARIFY' ? (CLARIFY_MSG[guard.locale] ?? CLARIFY_MSG.en) : undefined;

  return NextResponse.json({ ...decision, message });
}
