/**
 * POST /api/chat/claude
 *
 * Dedicated Anthropic Claude code-generation endpoint. Used by the
 * "App Builder" specialist in MyAvatarChat — Claude is materially
 * stronger than Gemini for self-contained HTML/CSS/JS output, so
 * the App service routes here instead of /api/chat/gemini.
 *
 * Streams plain text (no SSE framing) so the client can pipe it
 * directly into the InlineMedia code iframe.
 */

import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { reportError } from '@/lib/observability/report-error';
import { runWithReflection, type Critique } from '@/lib/orchestrator/reflection';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BODY_BYTES = 512_000;

/**
 * Supreme QA Gatekeeper critique for App-Builder HTML — confident structural
 * checks only, so a valid first pass is accepted immediately (no extra cost).
 */
function critiqueHtml(html: string): Critique {
  const issues: string[] = [];
  const t = html.trim();
  const low = t.toLowerCase();
  if (t.length < 60) issues.push('empty or truncated document');
  if (!low.includes('<')) issues.push('output is not HTML');
  if (!low.includes('<body') && !low.includes('<html') && !low.includes('<!doctype')) {
    issues.push('missing a full HTML document structure');
  }
  if (low.includes('temporarily unavailable')) issues.push('returned an error placeholder instead of a solution');
  if (t.includes('```')) issues.push('contains markdown code fences — must be raw HTML');
  return { ok: issues.length === 0, issues };
}

const SYSTEM_PROMPT = `You are a senior frontend engineer.
Produce a SINGLE self-contained HTML document (with inline CSS and JS,
no external assets, no remote fonts, no markdown fences) that fully
implements the user's request. The output will be rendered inside a
sandboxed iframe of the MyAvatar.ge app — keep it polished, dark-mode
friendly, mobile-first, and accessible. Return ONLY the HTML.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY missing' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return new Response(JSON.stringify({ error: 'Body too large' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = (await req.json()) as { prompt?: string };
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'prompt required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const anthropic = new Anthropic({ apiKey });
    const encoder = new TextEncoder();

    // ── SUPREME QA GATEKEEPER · iterate-before-display ───────────────────────
    // The App-Builder sub-agent never broadcasts a raw first pass. We generate
    // the full document, critique it, and on a confident quality delta refine
    // ONCE (critique fed back) before any byte reaches the iframe. A valid first
    // pass is accepted immediately, so the happy path costs a single generation.
    const generate = async (critiqueNote: string | null): Promise<string> => {
      const system = critiqueNote
        ? `${SYSTEM_PROMPT}\n\nREVISION REQUIRED — fix these issues from your prior draft: ${critiqueNote}`
        : SYSTEM_PROMPT;
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: prompt }],
      });
      return msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
    };

    let finalHtml = '';
    let iterations = 1;
    try {
      const result = await runWithReflection<string>({
        produce: generate,
        critique: critiqueHtml,
        maxIterations: 2,
      });
      finalHtml = result.output;
      iterations = result.iterations;
    } catch (err) {
      reportError(err, { route: '/api/chat/claude' });
      finalHtml = '';
    }

    if (!finalHtml.trim()) {
      finalHtml = `<!doctype html><html><body style="background:#000;color:#fff;font:14px system-ui;padding:24px"><h2>⚠️ AI service temporarily unavailable</h2><p>Claude (Anthropic) returned an error. Please try again in a few minutes.</p></body></html>`;
    }

    // Stream the QA-validated document (client contract unchanged: text/plain).
    const validated = finalHtml;
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(validated));
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'X-Reflection-Iterations': String(iterations),
      },
    });
  } catch (err) {
    reportError(err, { route: '/api/chat/claude', stage: 'request-parse' });
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
