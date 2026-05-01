import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `შენ ხარ G — MyAvatar.ge-ს AI ასისტენტი.
ყოველთვის პასუხობ ქართულად. ბუნებრივად, ადამიანივით ლაპარაკობ — ჩვეულებრივი ქართული სასაუბრო ენით.
პასუხები მოკლე და კონკრეტული უნდა იყოს — მაქსიმუმ 2-3 წინადადება.
MyAvatar.ge არის AI მედია პლატფორმა: ავატარების, ვიდეოს, სურათებისა და მუსიკის შექმნა AI-ით.`;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const { text, history = [] }: { text: string; history: Message[] } = await req.json();

    if (!text?.trim()) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    const messages: Message[] = [
      ...history.slice(-6),
      { role: 'user', content: text },
    ];

    const result = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 180,
      system: SYSTEM_PROMPT,
      messages,
    });

    const first = result.content[0];
    const responseText = first?.type === 'text' ? first.text : '';

    // Synthesize voice with ElevenLabs
    const voiceId = process.env.ELEVENLABS_VOICE_ID || 'vWpzdSR8GpLUKR0ai8Li';
    const elevenKey = process.env.ELEVENLABS_API_KEY;

    if (!elevenKey) {
      return NextResponse.json({ response: responseText, audio: null });
    }

    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: responseText,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 1.0,
          similarity_boost: 0.95,
          style: 0.25,
          use_speaker_boost: true,
          speed: 0.95,
        },
        apply_text_normalization: 'auto',
      }),
    });

    if (!ttsRes.ok) {
      return NextResponse.json({ response: responseText, audio: null });
    }

    const audioBuffer = await ttsRes.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    return NextResponse.json({ response: responseText, audio: audioBase64 });
  } catch (err) {
    console.error('[matilda]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
