import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const HEYGEN_BASE = 'https://api.heygen.com';

interface HeyGenAvatar {
  avatar_id: string;
  avatar_name: string;
  gender?: string;
}

interface HeyGenVoice {
  voice_id: string;
  language: string;
  gender?: string;
  name?: string;
}

async function getFirstAvatar(apiKey: string): Promise<string> {
  const res = await fetch(`${HEYGEN_BASE}/v2/avatars`, {
    headers: { 'X-Api-Key': apiKey },
  });
  if (!res.ok) throw new Error(`HeyGen avatars list failed: ${res.status}`);
  const data = await res.json() as { data?: { avatars?: HeyGenAvatar[] } };
  const avatars = data.data?.avatars ?? [];
  const first = avatars[0];
  if (!first) throw new Error('No avatars found in HeyGen account');
  return first.avatar_id;
}

async function getDefaultVoice(apiKey: string): Promise<string> {
  const res = await fetch(`${HEYGEN_BASE}/v2/voices`, {
    headers: { 'X-Api-Key': apiKey },
  });
  if (!res.ok) return 'en-US-JennyNeural'; // Azure fallback voice name
  const data = await res.json() as { data?: { voices?: HeyGenVoice[] } };
  const voices = data.data?.voices ?? [];
  const english = voices.find((v) => v.language?.startsWith('en')) ?? voices[0] ?? null;
  return english?.voice_id ?? 'en-US-JennyNeural';
}

async function createVideo(
  apiKey: string,
  avatarId: string,
  voiceId: string,
  script: string,
): Promise<string> {
  const res = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_inputs: [
        {
          character: { type: 'avatar', avatar_id: avatarId, avatar_style: 'normal' },
          voice: {
            type: 'text',
            input_text: script.slice(0, 1500),
            voice_id: voiceId,
          },
        },
      ],
      dimension: { width: 1280, height: 720 },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HeyGen video/generate ${res.status}: ${err}`);
  }
  const data = await res.json() as { data?: { video_id?: string }; video_id?: string };
  const videoId = data.data?.video_id ?? data.video_id;
  if (!videoId) throw new Error('HeyGen returned no video_id');
  return videoId;
}

async function pollUntilDone(apiKey: string, videoId: string): Promise<string> {
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const res = await fetch(`${HEYGEN_BASE}/v1/video_status.get?video_id=${videoId}`, {
      headers: { 'X-Api-Key': apiKey },
    });
    if (!res.ok) throw new Error(`HeyGen poll error: ${res.status}`);
    const data = await res.json() as {
      data?: { status?: string; video_url?: string; error?: string };
    };
    const { status, video_url, error } = data.data ?? {};
    if (status === 'completed' && video_url) return video_url;
    if (status === 'failed') throw new Error(error ?? 'HeyGen generation failed');
  }
  throw new Error('HeyGen video timed out after 100s');
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: 'HEYGEN_API_KEY not configured' },
      { status: 500 },
    );
  }

  try {
    const body = await req.json() as { prompt?: string; avatarId?: string; voiceId?: string };
    const prompt = body.prompt?.trim();
    if (!prompt) {
      return NextResponse.json({ success: false, error: 'prompt is required' }, { status: 400 });
    }

    const [avatarId, voiceId] = await Promise.all([
      body.avatarId ?? getFirstAvatar(apiKey),
      body.voiceId ?? getDefaultVoice(apiKey),
    ]);

    const videoId = await createVideo(apiKey, avatarId, voiceId, prompt);
    const videoUrl = await pollUntilDone(apiKey, videoId);

    return NextResponse.json({ success: true, url: videoUrl, kind: 'video' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'HeyGen avatar generation failed';
    return NextResponse.json({ success: false, url: null, error: message }, { status: 502 });
  }
}
