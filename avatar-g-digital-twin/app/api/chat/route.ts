import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { messages, model = 'gpt-4' } = await req.json();
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'You are Avatar G, a premium AI assistant. Respond in the same language as the user.' },
        ...messages
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });
    
    const responseContent = completion.choices?.[0]?.message?.content;
    if (!responseContent) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 });
    }
    
    return NextResponse.json({ response: responseContent, model: completion.model });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Chat failed' }, { status: 500 });
  }
}
