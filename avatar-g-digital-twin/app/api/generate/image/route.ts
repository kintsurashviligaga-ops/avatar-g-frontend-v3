import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { prompt, size = '1024x1024' } = await req.json();
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: `Professional: ${prompt}`,
      size: size as any,
      quality: 'hd',
      n: 1,
    });
    
    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) {
      return NextResponse.json({ error: 'No image generated' }, { status: 500 });
    }
    
    return NextResponse.json({ url: imageUrl });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Image generation failed' }, { status: 500 });
  }
}
