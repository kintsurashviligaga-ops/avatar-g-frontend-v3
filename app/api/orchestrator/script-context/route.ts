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

function parseDoc(d: Doc): { dataUrl: string; mime: string; b64: string; name: string } | null {
  const dataUrl = typeof d.dataUrl === 'string' ? d.dataUrl : '';
  if (!dataUrl.startsWith('data:')) return null;
  const head = dataUrl.match(/^data:([^;,]+)[;,]/);
  const mime = String((typeof d.type === 'string' && d.type) || head?.[1] || '').toLowerCase();
  const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] ?? '' : '';
  if (!b64) return null;
  return { dataUrl, mime, b64, name: typeof d.name === 'string' ? d.name : 'document' };
}

/** PDF / image → a Gemini inline_data attachment (read natively). Returns null
 *  for text (which is decoded + appended to the prompt instead — Gemini does not
 *  accept text/plain as inline_data). */
function toAttachment(p: { mime: string; b64: string }): GeminiAttachment | null {
  if (p.mime === 'application/pdf') return { type: 'pdf', mimeType: 'application/pdf', data: p.b64 };
  if (p.mime.startsWith('image/')) return { type: 'image', mimeType: p.mime, data: p.b64 };
  return null;
}

/** Decode a text/* document to a (length-capped) UTF-8 string for the prompt. */
function decodeText(b64: string): string {
  try {
    return Buffer.from(b64, 'base64').toString('utf8').slice(0, 12_000);
  } catch {
    return '';
  }
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
  const parsed = docs.map(parseDoc).filter((p): p is NonNullable<ReturnType<typeof parseDoc>> => p !== null);
  const attachments = parsed.map(toAttachment).filter((a): a is GeminiAttachment => a !== null);
  // text/* docs are decoded inline (Gemini rejects text/plain as inline_data).
  const textBlocks = parsed
    .filter((p) => p.mime.startsWith('text/'))
    .map((p) => `--- ${p.name} ---\n${decodeText(p.b64)}`)
    .filter((t) => t.trim().length > 4);

  if (attachments.length === 0 && textBlocks.length === 0) {
    return NextResponse.json({ brief: prompt, enriched: false });
  }

  try {
    const instruction =
      `User brief: "${prompt || '(none — derive the brief from the documents)'}".\n\n`
      + (textBlocks.length ? `Reference text:\n${textBlocks.join('\n\n')}\n\n` : '')
      + `Read the reference material${attachments.length ? ' (text above + the attached file(s))' : ' above'} and produce ONE enriched, vivid film brief of `
      + `3–5 sentences that captures the story, the protagonist, the setting, the mood and the `
      + `visual style — ready to be split into six cohesive 5-second cinematic scenes.`;
    const r = await generateWithGemini({
      prompt: instruction,
      systemPrompt: SYSTEM_PROMPT,
      // gemini-2.5-flash is the model the chat route proves works on this key
      // (2.5-pro can 404/quota on AI-Studio keys) and reads PDF/image/text well.
      tier: 'flash',
      attachments,
      temperature: 0.5,
      maxTokens: 700,
    });
    const brief = (r.text || '').trim();
    return NextResponse.json({ brief: brief || prompt, enriched: Boolean(brief) });
  } catch (err) {
    // FAIL-OPEN. `?diag=1` surfaces WHY (no secret) for the "didn't enrich" probe.
    const reason = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);
    if (req.nextUrl.searchParams.get('diag') === '1') {
      return NextResponse.json({ brief: prompt, enriched: false, diag: reason });
    }
    return NextResponse.json({ brief: prompt, enriched: false });
  }
}
