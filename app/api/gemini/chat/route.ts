import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateWithGemini, type GeminiAttachment } from '@/lib/gemini/client';
import { getGeminiSystemPrompt, getServiceCreditCost, type GeminiServiceContext } from '@/lib/gemini/prompts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const AttachmentSchema = z.object({
  type: z.enum(['image', 'pdf', 'video']),
  mimeType: z.string(),
  data: z.string(),
});

const RequestSchema = z.object({
  message: z.string().min(1),
  sessionId: z.string().default(() => crypto.randomUUID()),
  serviceContext: z.string().default('general'),
  locale: z.string().default('ka'),
  attachments: z.array(AttachmentSchema).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'model']),
        parts: z.array(z.object({ text: z.string() })),
      }),
    )
    .optional(),
  userId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { message, sessionId, serviceContext, locale, attachments, history, userId } = parsed.data;

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 });
    }

    const tier = attachments?.length || (history && history.length > 10) ? 'pro' : 'flash';
    const systemPrompt = getGeminiSystemPrompt(serviceContext as GeminiServiceContext, locale);

    const response = await generateWithGemini({
      prompt: message,
      systemPrompt,
      tier,
      attachments: attachments as GeminiAttachment[] | undefined,
      history,
    });

    const creditsUsed = getServiceCreditCost(serviceContext as GeminiServiceContext, tier);
    const messageId = crypto.randomUUID();

    // Persist to Supabase if service role key is available
    if (process.env.SUPABASE_SERVICE_ROLE_KEY && userId) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
          process.env.SUPABASE_SERVICE_ROLE_KEY,
        );
        await supabase.from('gemini_chat_messages').insert([
          {
            id: crypto.randomUUID(),
            session_id: sessionId,
            role: 'user',
            content: message,
            user_id: userId,
            service_context: serviceContext,
            locale,
            has_attachment: !!attachments?.length,
          },
          {
            id: messageId,
            session_id: sessionId,
            role: 'assistant',
            content: response.text,
            user_id: userId,
            service_context: serviceContext,
            locale,
            model: response.model,
            credits_used: creditsUsed,
          },
        ]);
      } catch (e) {
        console.warn('[gemini/chat] Supabase persist failed:', e);
      }
    }

    return NextResponse.json({
      text: response.text,
      model: response.model,
      tier,
      sessionId,
      messageId,
      creditsUsed,
      tokensIn: response.tokensIn,
      tokensOut: response.tokensOut,
    });
  } catch (err) {
    console.error('[gemini/chat] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
