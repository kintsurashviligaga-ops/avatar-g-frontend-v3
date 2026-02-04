import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { message, history, language } = await request.json();

    const apiKey = process.env.GROQ_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'Groq API key not configured' },
        { status: 500 }
      );
    }

    const systemPrompt = language === 'ka' 
      ? 'თქვენ ხართ Avatar G-ის ქართულენოვანი AI ასისტენტი. უპასუხეთ ქართულად.'
      : 'You are Avatar G AI assistant.';

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.map((h: any) => ({ role: h.role, content: h.content })),
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Groq API Error:', error);
      return NextResponse.json(
        { success: false, error: 'Groq API error: ' + response.status },
        { status: 500 }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      response: data.choices[0].message.content,
    });

  } catch (error) {
    console.error('Chatbot Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
