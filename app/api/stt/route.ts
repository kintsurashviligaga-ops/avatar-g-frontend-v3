import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audio = formData.get('audio') as File;

    if (!audio) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    const bytes = await audio.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const groqFormData = new FormData();
    groqFormData.append('file', new Blob([buffer], { type: audio.type }), 'audio.webm');
    groqFormData.append('model', 'whisper-large-v3');
    groqFormData.append('language', 'ka');

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: groqFormData,
    });

    if (!response.ok) {
      throw new Error('Groq API error: ' + response.status);
    }

    const data = await response.json();

    return NextResponse.json({
      text: data.text,
      language: 'ka',
    });
  } catch (error) {
    console.error('STT error:', error);
    return NextResponse.json(
      { error: 'Transcription failed' },
      { status: 500 }
    );
  }
}
