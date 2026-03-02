import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/ai/chat
 * GPT chat completions endpoint.
 * Body: { messages: Array<{ role: string; content: string }>, model?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
    }

    const body = await req.json();
    const messages: Array<{ role: string; content: string }> = body.messages;
    const model: string = body.model ?? 'gpt-4o-mini';

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages array is required' }, { status: 400 });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 2048,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: 'OpenAI API error', details: errorText },
        { status: response.status },
      );
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content ?? '';

    return NextResponse.json({
      reply,
      model: data.model,
      usage: data.usage,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
