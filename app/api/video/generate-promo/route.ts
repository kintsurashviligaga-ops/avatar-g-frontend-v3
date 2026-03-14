import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min timeout for video gen

/**
 * POST /api/video/generate-promo
 * Generates a promotional ad video for MyAvatar.ge using image-to-video.
 *
 * Body:
 *   imageUrl  — URL of the website screenshot to animate
 *   phase     — 'intro' | 'avatar' | 'brand' (which phase to generate)
 *   prompt    — optional custom prompt override
 */
export async function POST(req: NextRequest) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'REPLICATE_API_TOKEN not configured' }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { imageUrl, phase = 'intro', prompt: customPrompt } = body;

  if (!imageUrl || typeof imageUrl !== 'string') {
    return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
  }

  // Validate URL format
  try {
    new URL(imageUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid imageUrl format' }, { status: 400 });
  }

  const prompts = getPhasePrompts();
  const phasePrompt = customPrompt || prompts[phase as keyof typeof prompts] || prompts.intro;

  try {
    const replicate = new Replicate({ auth: token });

    // Use minimax/video-01-live — supports image input for image-to-video
    const output = await replicate.run('minimax/video-01-live', {
      input: {
        prompt: phasePrompt,
        first_frame_image: imageUrl,
        prompt_optimizer: true,
      },
    });

    const videoUrl = extractUrl(output);
    if (!videoUrl) {
      return NextResponse.json({ error: 'No video URL returned from model' }, { status: 502 });
    }

    return NextResponse.json({ url: videoUrl, phase });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function getPhasePrompts() {
  return {
    intro: `Slow elegant camera push forward toward a modern AI platform website interface. The website hero section is displayed on screen. Very subtle light sweep animation glides across the UI from left to right. The main CTA button has a soft pulsing cyan glow. Minimal depth parallax between foreground and background layers. Dark premium tech environment. The interface remains perfectly sharp and readable. Cinematic, minimal, elegant. Style: premium SaaS product commercial like Apple or Stripe.`,

    avatar: `Gentle cinematic focus on an AI avatar creation interface. Subtle neon blue-cyan highlights appear around the avatar frame. Minimal floating motion on UI card elements. A soft scanning light effect moves vertically over the interface. The UI stays perfectly stable and readable. Dark futuristic background with very subtle particle shimmer. Clean premium technology feel. Style: modern AI product showcase video.`,

    brand: `Elegant brand reveal sequence. The scene fades into a dark premium background. A modern tech logo appears centered with a soft cyan glow bloom. A smooth light sweep passes across the logo text from left to right. Very subtle futuristic AI particle shimmer floats in the background. Below the logo, text reading "Create Your AI Avatar" fades in elegantly. Minimal, cinematic, premium. Style: high-end technology brand reveal like OpenAI or Stripe.`,
  };
}

function extractUrl(output: unknown): string | null {
  if (typeof output === 'string') return output;
  if (output instanceof URL) return output.href;
  if (output && typeof output === 'object') {
    const obj = output as Record<string, unknown>;
    if (typeof obj.url === 'function') return String((obj.url as () => URL)().href);
    if (typeof obj.url === 'string') return obj.url;
    if (typeof obj.toString === 'function') {
      const s = obj.toString();
      if (s.startsWith('http')) return s;
    }
  }
  if (Array.isArray(output) && output.length > 0) {
    return extractUrl(output[0]);
  }
  return null;
}
