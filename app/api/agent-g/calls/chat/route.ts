import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { streamAssistantTokens } from '@/lib/voice-v2v/providers';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const schema = z.object({
  text: z.string().min(1).max(8000),
  language: z.enum(['ka-GE', 'en-US', 'ru-RU']).default('ka-GE'),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(8000) })).max(6).default([]),
});
export async function POST(req: NextRequest) {
  if (!process.env.WORKER_INTERNAL_TOKEN || req.headers.get('x-internal-worker-token') !== process.env.WORKER_INTERNAL_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (limited) return limited;
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const token of streamAssistantTokens({
          userText: body.data.text, language: body.data.language, signal: req.signal,
          history: body.data.history.map((item) => ({ role: item.role, text: item.content })),
        })) {
          if (req.signal.aborted) break;
          controller.enqueue(encoder.encode(JSON.stringify({ token }) + '\n'));
        }
      } catch {
        if (!req.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify({ error: 'voice_provider_unavailable' }) + '\n'));
      } finally { controller.close(); }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
}
