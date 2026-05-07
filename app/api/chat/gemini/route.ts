import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { AGENT_G_SYSTEM_PROMPT } from '@/lib/agent-g-orchestrator';
import { NextRequest } from 'next/server';

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

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { messages: UIMessage[] };
    const { messages = [] } = body;

    // convertToModelMessages handles text, files (data URLs), and all other parts
    const modelMessages = await convertToModelMessages(messages);

    const result = streamText({
      model: anthropic('claude-sonnet-4-6'),
      system: SYSTEM_PROMPT,
      messages: modelMessages,
      maxOutputTokens: 4096,
      temperature: 0.7,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error('[/api/chat/gemini] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
