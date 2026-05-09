import OpenAI from 'openai';
import { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { AGENT_G_SYSTEM_PROMPT } from '@/lib/agent-g-orchestrator';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM_PROMPT = `${AGENT_G_SYSTEM_PROMPT}

ADDITIONAL CAPABILITIES:
- Provide detailed, complete answers using Markdown formatting (headers, lists, code blocks, bold, italic)
- You can receive images and documents — respond with helpful, detailed analysis.
- Default to Georgian if the user writes in Georgian, otherwise match their language.
- You are powered by OpenAI GPT-4o-mini via the Avatar G platform.`;

type IncomingPart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: string; mimeType?: string };

type IncomingMessage = {
  role: string;
  content: string | IncomingPart[];
};

function toOpenAIMessages(messages: IncomingMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  const result: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;

    if (m.role === 'assistant' || typeof m.content === 'string') {
      result.push({ role: m.role as 'user' | 'assistant', content: String(m.content) });
      continue;
    }

    const parts = (m.content as IncomingPart[]).map(p => {
      if (p.type === 'image') {
        return {
          type: 'image_url' as const,
          image_url: { url: p.image },
        };
      }
      return { type: 'text' as const, text: p.text };
    });
    result.push({ role: 'user', content: parts });
  }

  return result;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'OPENAI_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const body = (await req.json()) as { messages: IncomingMessage[] };
    const { messages = [] } = body;
    const openaiMessages = toOpenAIMessages(messages);

    const client = new OpenAI({ apiKey, timeout: 30000 });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const send = (text: string) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));

        try {
          // Primary: OpenAI GPT-4o-mini
          try {
            const stream = await client.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...openaiMessages,
              ],
              max_tokens: 4096,
              temperature: 0.7,
              stream: true,
            });

            for await (const chunk of stream) {
              const delta = chunk.choices[0]?.delta?.content;
              if (delta) send(delta);
            }
          } catch {
            // Fallback: Anthropic Claude Haiku
            console.error('[/api/chat/openai] OpenAI failed — falling back to Anthropic');
            const anthropic = createAnthropic({
              apiKey: process.env.ANTHROPIC_API_KEY ?? '',
            });
            const fallback = streamText({
              model: anthropic('claude-haiku-4-5-20251001'),
              system: SYSTEM_PROMPT,
              messages: openaiMessages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({
                role: m.role as 'user' | 'assistant',
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
              })),
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
    console.error('[/api/chat/openai] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
