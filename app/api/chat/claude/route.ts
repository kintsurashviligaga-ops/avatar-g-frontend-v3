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

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BODY_BYTES = 512_000;

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

    const readable = new ReadableStream({
      async start(controller) {
        try {
          const stream = await anthropic.messages.stream({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: prompt }],
          });

          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        } catch (err) {
          reportError(err, { route: '/api/chat/claude' });
          // Surface the failure as an HTML error card so the iframe still
          // renders something the user can read.
          controller.enqueue(
            encoder.encode(
              `<!doctype html><html><body style="background:#000;color:#fff;font:14px system-ui;padding:24px"><h2>⚠️ AI service temporarily unavailable</h2><p>Claude (Anthropic) returned an error. Please try again in a few minutes.</p></body></html>`,
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
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
