/**
 * POST /api/orchestrator/script-context — fold reference documents into the brief.
 *
 * Card A lets the user attach 1-3 reference documents (a script, a storyboard, or
 * visual guidelines — PDF / image / text). Gemini 2.5 Pro reads them NATIVELY via
 * inline_data and returns ONE enriched film brief that captures the story,
 * protagonist, setting, mood and visual style. The studio then feeds that brief
 * into the existing 6×5s planner, so the six scenes derive from the script /
 * storyboard rather than the bare one-line prompt.
 *
 * FAIL-OPEN by construction: no key, no docs, an unreadable file, or any model
 * error → returns the original prompt unchanged, so the proven film pipeline is
 * never blocked. Request: { prompt: string, documents?: [{dataUrl,type,name}] }.
 * Response: { brief: string, enriched: boolean }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { generateWithGemini, type GeminiAttachment } from '@/lib/gemini/client';
import { geminiKeyPresent } from '@/lib/orchestrator/gemini-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 45;

interface Doc { dataUrl?: unknown; type?: unknown; name?: unknown }

/** Convert a client doc (data URL) → a Gemini inline attachment. Gemini reads
 *  application/pdf, image/*, and text/* inline; anything else is skipped. */
function toAttachment(d: Doc): GeminiAttachment | null {
  const dataUrl = typeof d.dataUrl === 'string' ? d.dataUrl : '';
  if (!dataUrl.startsWith('data:')) return null;
  const head = dataUrl.match(/^data:([^;,]+)[;,]/);
  const mime = String((typeof d.type === 'string' && d.type) || head?.[1] || '').toLowerCase();
  const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] ?? '' : '';
  if (!b64) return null;
  if (mime === 'application/pdf') return { type: 'pdf', mimeType: 'application/pdf', data: b64 };
  if (mime.startsWith('image/')) return { type: 'image', mimeType: mime, data: b64 };
  if (mime.startsWith('text/')) return { type: 'pdf', mimeType: 'text/plain', data: b64 };
  return null;
}

const SYSTEM_PROMPT =
  'You are the Storyboard Director for a 30-second, six-scene cinematic film engine. '
  + 'You read reference materials (scripts, storyboards, visual guidelines) and distil '
  + 'them into a single tight creative brief a downstream planner can split into six '
  + 'cohesive 5-second shots. Preserve named characters, locations, era and tone. Never '
  + 'invent contradicting facts. Output ONLY the brief — no headings, no lists, no preamble.';

export async function POST(req: NextRequest) {
  let body: { prompt?: unknown; documents?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ brief: '', enriched: false });
  }

  const prompt = String(body.prompt ?? '').trim();
  const docs: Doc[] = Array.isArray(body.documents) ? (body.documents as Doc[]).slice(0, 3) : [];

  // Fail-open: nothing to enrich, or no Gemini credential → use the raw prompt.
  if (!geminiKeyPresent() || docs.length === 0) {
    return NextResponse.json({ brief: prompt, enriched: false });
  }
  const attachments = docs.map(toAttachment).filter((a): a is GeminiAttachment => a !== null);
  if (attachments.length === 0) {
    return NextResponse.json({ brief: prompt, enriched: false });
  }

  try {
    const instruction =
      `User brief: "${prompt || '(none — derive the brief from the documents)'}".\n\n`
      + `Read the attached reference document(s) and produce ONE enriched, vivid film brief of `
      + `3–5 sentences that captures the story, the protagonist, the setting, the mood and the `
      + `visual style — ready to be split into six cohesive 5-second cinematic scenes.`;
    const r = await generateWithGemini({
      prompt: instruction,
      systemPrompt: SYSTEM_PROMPT,
      tier: 'pro', // Gemini 2.5 Pro — strongest document understanding
      attachments,
      temperature: 0.5,
      maxTokens: 700,
    });
    const brief = (r.text || '').trim();
    return NextResponse.json({ brief: brief || prompt, enriched: Boolean(brief) });
  } catch {
    return NextResponse.json({ brief: prompt, enriched: false });
  }
}
