import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';

/**
 * POST /api/video/generate-hero
 * Triggers the hero video generation via Replicate.
 * Protected: requires REPLICATE_API_TOKEN env var.
 */

const PROMPT = `Create a 30-second cinematic commercial for an AI platform called "MyAvatar". Style: photorealistic, cinematic, futuristic AI technology commercial. Visual tone: dark modern UI, deep black background, soft blue and violet glow, futuristic digital environment, premium SaaS interface. Scenes: Logo intro with glow reveal, platform interface with AI chat, user typing prompt, multi-agent AI network (Avatar, Video, Music, Subtitle agents), avatar builder generating photorealistic avatar, video creation with music and subtitles, full platform ecosystem zoom-out, Agent G automation, final montage with logo. Camera: smooth cinematic zooms, clean UI transitions. Lighting: soft futuristic blue highlights. Quality: ultra realistic premium technology commercial.`;

export async function POST(req: NextRequest) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'REPLICATE_API_TOKEN not configured' }, { status: 500 });
  }

  try {
    const replicate = new Replicate({ auth: token });

    const output = await replicate.run('minimax/video-01-live', {
      input: { prompt: PROMPT, prompt_optimizer: true },
    });

    const videoUrl = typeof output === 'string' ? output : (Array.isArray(output) ? output[0] : null);

    if (!videoUrl) {
      return NextResponse.json({ error: 'No video URL returned' }, { status: 502 });
    }

    return NextResponse.json({ url: videoUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
