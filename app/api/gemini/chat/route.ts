import { googleAiConfigured } from '@/lib/ai/google/transport';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateWithGemini, type GeminiAttachment } from '@/lib/gemini/client';
import { getGeminiSystemPrompt, getServiceCreditCost, type GeminiServiceContext } from '@/lib/gemini/prompts';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { chatBudgetAllows, bookChatUsage } from '@/lib/services/billing/chatBudget';
import { providerErrorBody } from '@/lib/api/providerError';

/** The longest message one turn may carry — a pasted book is not a chat turn, and every character is billed. */
const MAX_MESSAGE_CHARS = 16_000;

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
  // ⚠️ NO `userId` HERE, ON PURPOSE. It used to be accepted from the body and written straight into
  // gemini_chat_sessions / gemini_chat_messages with the SERVICE-ROLE key (which bypasses RLS), so any caller
  // could plant rows — and a `credits_used` figure — under any account's id. The owner is the verified session,
  // read below; a `userId` a client still sends is stripped by zod's default object mode and never reaches the DB.
});

export async function POST(req: NextRequest) {
  // Per-IP burst guard before anything else (the magic-wand order: WRITE per IP → sign-in → per-account cap → budget).
  const ipLimited = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (ipLimited) return ipLimited;
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { message, sessionId, serviceContext, locale, attachments, history } = parsed.data;

    // ⚠️ SIGNED-IN ONLY (lib/auth/generationGate). Every turn here spends the platform's Gemini balance — the Pro
    // tier whenever an attachment or a long history is present — and nothing in the product calls this route (the
    // product chat is /api/chat*), so an anonymous POST was pure loss with no account to attribute it to.
    const { user } = await authedClientFromRequest(req);
    if (mustSignInToGenerate(user?.id)) {
      return NextResponse.json(signInToGenerateBody(locale), { status: 401 });
    }
    // The persisted owner. Null only in a FILM_ALLOW_ANONYMOUS demo deployment, where nothing is written.
    const userId = user?.id ?? null;

    // ⚠️ SIGNED-IN WAS THE ONLY GUARD. Sign-up is self-service, so one account could loop this — Pro tier whenever an
    // attachment or a long history rides along — with no cap, no budget check and nothing booked. Per-ACCOUNT daily
    // chat cap (the CHAT_USER bucket the product chat shares), a bounded message, the platform budget gate, and every
    // call booked against that budget.
    if (userId) {
      const capped = await checkRateLimitByKey(userId, RATE_LIMITS.CHAT_USER);
      if (capped) return capped;
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json({ error: 'message_too_long', maxChars: MAX_MESSAGE_CHARS }, { status: 413 });
    }
    if (!(await chatBudgetAllows(message))) {
      return NextResponse.json({ error: 'budget_exhausted' }, { status: 503 });
    }

    if (!googleAiConfigured()) {
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

    void bookChatUsage({
      model: response.model,
      inputTokens: response.tokensIn,
      outputTokens: response.tokensOut,
      inputChars: systemPrompt.length + message.length,
      chars: (response.text || '').length,
      userId,
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
        // ⚠️ THE SESSION ID IS CLIENT-CHOSEN AND THIS CLIENT BYPASSES RLS. An upsert on `id` alone would let a
        // signed-in caller who names someone else's sessionId rewrite that row's user_id to their own (taking the
        // conversation over) and append messages into it. A session that already belongs to another account is
        // left alone: the reply is still returned, it just is not persisted.
        const { data: existing } = await supabase
          .from('gemini_chat_sessions')
          .select('user_id')
          .eq('id', sessionId)
          .maybeSingle();
        if (existing && (existing as { user_id?: string | null }).user_id !== userId) {
          throw new Error('session belongs to another account — not persisted');
        }
        await supabase.from('gemini_chat_sessions').upsert(
          {
            id: sessionId,
            user_id: userId,
            service_context: serviceContext,
            locale,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' },
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
    // `String(err)` used to go straight back — a provider's raw error text. The sanitised class only (providerError).
    const safe = providerErrorBody(err);
    return NextResponse.json({ error: safe.error, message: safe.message }, { status: safe.status });
  }
}
