/**
 * lib/elevenlabs/audioIsolation.ts
 * ================================
 * Stage 2 (lip-sync) — VOCAL ISOLATION via the ElevenLabs Voice Isolator
 * (POST /v1/audio-isolation). The music-video song is a full mix (sung vocal +
 * backing); HeyGen lip-syncs the singer's mouth to whatever audio it's given, so
 * feeding it the FULL MIX tracks the music, not the voice. Isolating the vocal
 * first gives HeyGen a clean voice to follow → far better mouth timing.
 *
 * STRICTLY FAIL-OPEN: any miss (no key, fetch fail, non-200, empty body) returns
 * null and the caller falls back to the full mix — the HeyGen pass still runs.
 */
import 'server-only';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';

/**
 * Strip the backing from `audioUrl` and return a hosted URL of the isolated vocal,
 * or null on any failure. On-brand: ElevenLabs powers the song AND the isolation.
 */
export async function isolateVocal(audioUrl: string, signal?: AbortSignal): Promise<string | null> {
  const key = (process.env.ELEVENLABS_API_KEY || '').trim();
  if (!key || !audioUrl) return null;
  try {
    // 1. Pull the source song bytes.
    const src = await fetch(audioUrl, { signal });
    if (!src.ok) return null;
    const buf = Buffer.from(await src.arrayBuffer());
    if (buf.byteLength < 1_024) return null;

    // 2. Voice Isolator — multipart `audio` upload → isolated voice (mp3).
    const fd = new FormData();
    fd.append('audio', new Blob([new Uint8Array(buf)], { type: 'audio/mpeg' }), 'song.mp3');
    const res = await fetch('https://api.elevenlabs.io/v1/audio-isolation', {
      method: 'POST',
      headers: { 'xi-api-key': key, Accept: 'audio/mpeg' },
      body: fd,
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn('[isolate] ElevenLabs audio-isolation', res.status, (await res.text().catch(() => '')).slice(0, 200));
      return null;
    }
    const out = Buffer.from(await res.arrayBuffer());
    if (out.byteLength < 1_024) return null;

    // 3. Host it so HeyGen can fetch a stable https URL.
    const path = `films/vocal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    const url = (await uploadAndSign('uploads', path, out.toString('base64'), 'audio/mpeg', 604_800)) ?? null;
    // eslint-disable-next-line no-console
    console.log('[isolate] isolated vocal ready:', url ? 'yes' : 'no');
    return url;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[isolate] failed (falling back to full mix):', err instanceof Error ? err.message : err);
    return null;
  }
}
