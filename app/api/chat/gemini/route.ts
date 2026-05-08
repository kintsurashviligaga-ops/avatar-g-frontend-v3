import { streamText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { AGENT_G_SYSTEM_PROMPT } from '@/lib/agent-g-orchestrator';
import { NextRequest } from 'next/server';

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? '',
});

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
});

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM_PROMPT = `${AGENT_G_SYSTEM_PROMPT}

ᲓᲐᲛᲐᲢᲔᲑᲘᲗᲘ ᲨᲔᲡᲐᲫᲚᲔᲑᲚᲝᲑᲔᲑᲘ ტექსტური ჩატისთვის:
- შეგიძლია სურათებისა და დოკუმენტების დამუშავება
- გთხოვ გასცე დეტალური, სრული პასუხები
- გამოიყენე Markdown ფორმატირება (headers, lists, code blocks, bold, italic)
- ნაგულისხმევად ქართულად პასუხობ, თუ მომხმარებელი სხვა ენაზე არ გელაპარაკება
- You can receive images and documents. Provide detailed helpful responses in markdown format.
- Use Georgian by default unless user writes in another language.`;

type IncomingPart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: string; mimeType?: string };

type IncomingMessage = {
  role: string;
  content: string | IncomingPart[];
};

type ModelMessage =
  | { role: 'user' | 'assistant'; content: string }
  | { role: 'user'; content: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> };

function toCoreMessages(messages: IncomingMessage[]): ModelMessage[] {
  return messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => {
      if (m.role === 'assistant' || typeof m.content === 'string') {
        return { role: m.role as 'user' | 'assistant', content: String(m.content) };
      }
      const parts = (m.content as IncomingPart[]).map(p =>
        p.type === 'image'
          ? { type: 'image' as const, image: p.image }
          : { type: 'text' as const, text: p.text },
      );
      return { role: 'user' as const, content: parts };
    });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { messages: IncomingMessage[] };
    const { messages = [] } = body;
    const modelMessages = toCoreMessages(messages);

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const send = (text: string) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));

        try {
          // Primary: Gemini 2.0 Flash
          try {
            const result = streamText({
              model: google('gemini-2.0-flash'),
              system: SYSTEM_PROMPT,
              messages: modelMessages,
              maxOutputTokens: 4096,
              temperature: 0.7,
            });
            for await (const chunk of result.textStream) {
              send(chunk);
            }
          } catch {
            // Fallback: Anthropic Claude Haiku
            console.error('[/api/chat/gemini] Gemini failed — falling back to Anthropic');
            const fallback = streamText({
              model: anthropic('claude-haiku-4-5-20251001'),
              system: SYSTEM_PROMPT,
              messages: modelMessages,
              maxOutputTokens: 4096,
              temperature: 0.7,
            });
            for await (const chunk of fallback.textStream) {
              send(chunk);
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'AI service unavailable';
          send(`⚠️ ${msg}`);
        } finally {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[/api/chat/gemini] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
