/**
 * POST /api/music/video — DAY-4 photo-to-music-video multiplex.
 *
 * Body: { imageDataUrl: "data:image/...;base64,…", audioUrl: "<supabase-hosted track URL>" }.
 * Authed (cookie or Bearer). Validates the image (mime + 8MB cap), fetches the freshly-generated audio track
 * (restricted to Supabase-hosted URLs — SSRF guard), multiplexes them into a web-compatible MP4
 * (-loop 1 · -shortest · h264 · aac · yuv420p, see lib/pipeline/photoMusicVideo), stores it in the render
 * bucket, and returns a 7-day signed URL + the clip duration for preview/download.
 *
 * NOTE: this route spawns ffmpeg-static, so it is registered in next.config.js outputFileTracingIncludes —
 * without that entry the binary is absent in the Vercel lambda and the route ENOENTs.
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { renderPhotoMusicVideo } from '@/lib/pipeline/photoMusicVideo';
import { isAllowedAudioUrl, fetchAllowlistedAudio } from '@/lib/security/allowlistedAudioFetch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;
const AUDIO_FETCH_TIMEOUT_MS = 45_000;

export async function POST(req: Request) {
  try {
    const { user } = await authedClientFromRequest(req);
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = (await req.json().catch(() => null)) as { imageDataUrl?: string; audioUrl?: string } | null;

    const m = typeof body?.imageDataUrl === 'string' ? body.imageDataUrl.match(/^data:([^;]+);base64,(.+)$/) : null;
    const mime = m?.[1];
    const b64 = m?.[2];
    if (!mime || !b64) return NextResponse.json({ error: 'no image' }, { status: 400 });
    if (!EXT[mime]) return NextResponse.json({ error: 'unsupported image type' }, { status: 415 });
    const imageBuffer = Buffer.from(b64, 'base64');
    if (imageBuffer.byteLength < 64) return NextResponse.json({ error: 'empty image' }, { status: 400 });
    if (imageBuffer.byteLength > MAX_IMAGE_BYTES) return NextResponse.json({ error: 'image too large (max 8MB)' }, { status: 413 });

    const audioUrl = typeof body?.audioUrl === 'string' ? body.audioUrl.trim() : '';
    if (!audioUrl || !isAllowedAudioUrl(audioUrl)) return NextResponse.json({ error: 'invalid audio source' }, { status: 400 });

    const ar = await fetchAllowlistedAudio(audioUrl, { timeoutMs: AUDIO_FETCH_TIMEOUT_MS });
    if (!ar) return NextResponse.json({ error: 'could not fetch audio' }, { status: 502 });
    // Reject an oversized track BEFORE buffering it into memory when the server declared its length.
    const declaredLen = Number(ar.headers.get('content-length'));
    if (Number.isFinite(declaredLen) && declaredLen > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'audio too large' }, { status: 413 });
    const audioBuffer = Buffer.from(await ar.arrayBuffer());
    if (audioBuffer.byteLength < 128) return NextResponse.json({ error: 'empty audio' }, { status: 400 });
    if (audioBuffer.byteLength > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'audio too large' }, { status: 413 });

    const { mp4, durationSec } = await renderPhotoMusicVideo(imageBuffer, audioBuffer, EXT[mime]);

    const objectPath = `${user.id}/music-video-${Date.now()}.mp4`;
    const url = await uploadBufferAndSign(process.env.RENDER_BUCKET ?? 'renders', objectPath, mp4, 'video/mp4', 604_800);
    if (!url) return NextResponse.json({ error: 'upload failed' }, { status: 500 });

    return NextResponse.json({ url, durationSec });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[POST /api/music/video]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'video render failed' }, { status: 500 });
  }
}
