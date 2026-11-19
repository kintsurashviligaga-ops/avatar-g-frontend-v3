/**
 * lib/avatar/studio/live.ts — the real side effects behind startScene / pollScene. Server only.
 *
 *  - Billing: the existing ledger calls (hasSufficientBalance, deductCreditsOnce under one ref per take, refundCredits).
 *    Nothing here changes the ledger, BOG or the wallet.
 *  - Live presenter: a relay ticket minted locally (lib/voice/liveMint, the call screen's own path) and ONE server-side
 *    session through our relay: no new relay endpoint, no relay deploy. The relay may check Origin, so the session sends
 *    the app's own origin (STUDIO_RELAY_ORIGIN, default https://myavatar.ge).
 *  - Omni: lib/video/omniClip submit / continue (`previous_interaction_id`) / poll, inside the platform budget guard.
 *  - Karaoke: Chirp 3 word offsets (chirpWords) on a 16 kHz mono WAV cut by ffmpeg.
 *  - Storage: private, under renders/avatar-studio/<uid>/; a job's state sits next to its clip as JSON (no DB change
 *    while migrations are frozen). Only the caller's own folder is read.
 */
import 'server-only';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';
import { deductCreditsOnce, hasSufficientBalance, refundCredits } from '@/lib/orchestrator/ledger';
import { loadCuratedFace } from '@/lib/avatar/curatedFace';
import { submitOmniClip, submitOmniEdit, pollOmniClip, type OmniModel } from '@/lib/video/omniClip';
import { liveTokenMinter } from '@/lib/voice/liveMint';
import { parseLiveServerMessage } from '@/lib/voice/liveServerMessage';
import { buildProbeArgs, parseProbe } from '@/lib/video/longform/stitch';
import { getVertexAccessToken, vertexAiConfig } from '@/lib/veo/vertexAuth';
import { chirpWordsBody, parseChirpWords } from './chirpWords';
import { StudioError } from './errors';
import { LIVE_TAKE_MAX_MS, LiveTakeRecorder, type TakeResult } from './liveTake';
import { ownsStudioPath, type DubArgs, type SceneDeps, type SceneJob } from './sceneRun';
import { composeWideArgs } from './stitch';
import { voiceAdjustFilter } from './voiceAdjust';
import { synthesizeGoogleTts } from '@/lib/audio/google-tts';
import { dubFilter, frameLevelsDb, planDub, speechSpans } from '@/lib/avatar/speechMatch';

const exec = promisify(execFile);
export const STUDIO_BUCKET = 'renders';
const WEEK_SEC = 7 * 24 * 3600;
const MAX_CLIP_BYTES = 120 * 1024 * 1024;
const bin = (): string => {
  const b = (ffmpegStatic as unknown as string) || '';
  if (!b) throw new StudioError('not_configured', 'ffmpeg is missing.', 503);
  return b;
};
const jobPath = (userId: string, id: string) => `avatar-studio/${userId}/jobs/${id}.json`;

async function withTmp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'studio-'));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }).catch(() => undefined); }
}

async function probeSec(file: string): Promise<number> {
  try { await exec(bin(), buildProbeArgs(file), { timeout: 20_000 }); return 0; } catch (e) {
    const stderr = String((e as { stderr?: string } | null)?.stderr ?? '');
    return parseProbe(stderr).durationSec ?? 0;
  }
}

/** One Live take through our relay, as a server-side client. Resolves null on any miss (never throws). */
export async function recordLiveTake(setup: Record<string, unknown>, turn: Record<string, unknown>, signal: AbortSignal): Promise<TakeResult | null> {
  const minter = liveTokenMinter();
  if (!minter?.wsUrl) return null;
  const now = Date.now();
  const res = await minter.mint({
    uses: 1, expireTime: new Date(now + LIVE_TAKE_MAX_MS + 30_000).toISOString(), newSessionExpireTime: new Date(now + 60_000).toISOString(),
    bidiGenerateContentSetup: setup, subject: 'avatar-studio',
  }, 5_000).catch(() => null);
  const ticket = res?.ok ? ((await res.json().catch(() => null)) as { name?: string } | null)?.name : null;
  if (!ticket) return null;
  const WS = (globalThis as { WebSocket?: new (url: string, init?: unknown) => WebSocket }).WebSocket;
  if (!WS) return null;
  const origin = (process.env.STUDIO_RELAY_ORIGIN ?? 'https://myavatar.ge').trim();
  const rec = new LiveTakeRecorder();
  const started = Date.now();
  return new Promise<TakeResult | null>((resolve) => {
    let ws: WebSocket;
    try {
      // undici's WebSocket takes `headers` beside `protocols` (Node 22); the relay's origin check reads it.
      ws = new WS(`${minter.wsUrl}?ticket=${encodeURIComponent(ticket)}`, { headers: { origin } });
    } catch { resolve(null); return; }
    const finish = () => { clearInterval(timer); try { ws.close(1000, 'take done'); } catch { /* closed */ } resolve(rec.result()); };
    const timer = setInterval(() => { rec.tick(Date.now(), started); if (rec.state === 'failed') finish(); }, 500);
    signal.addEventListener('abort', () => { rec.fail('aborted'); finish(); }, { once: true });
    ws.onopen = () => ws.send(JSON.stringify({ setup }));
    ws.onmessage = async (ev: MessageEvent) => {
      const raw = typeof ev.data === 'string' ? ev.data : ev.data instanceof Blob ? await ev.data.text() : Buffer.from(ev.data as ArrayBuffer).toString('utf8');
      for (const e of parseLiveServerMessage(raw)) rec.onEvent(e, Date.now());
      if (rec.readyToSend) { ws.send(JSON.stringify(turn)); rec.sent(Date.now()); }
      if (rec.state === 'done' || rec.state === 'failed') finish();
    };
    ws.onclose = (ev: CloseEvent) => { rec.onClose(ev.code); finish(); };
    ws.onerror = () => { /* a close follows */ };
  });
}

async function finishLiveTake(take: TakeResult, compose: SceneJob['compose'], backgroundUrl: string | null) {
  return withTmp(async (dir) => {
    const raw = join(dir, 'take.mp4'), cut = join(dir, 'cut.mp4'), wide = join(dir, 'wide.mp4');
    await writeFile(raw, take.bytes);
    await exec(bin(), ['-y', '-ss', String(take.trimStart), '-to', String(take.trimEnd), '-i', raw, '-c', 'copy', '-movflags', '+faststart', cut], { timeout: 60_000 });
    let out = cut;
    if (compose !== 'none') {
      let bg: string | null = null;
      if (backgroundUrl) {
        const r = await fetch(backgroundUrl, { signal: AbortSignal.timeout(20_000) });
        if (!r.ok) throw new StudioError('not_found', 'The background image could not be read.', 404);
        bg = join(dir, 'bg.img');
        await writeFile(bg, Buffer.from(await r.arrayBuffer()));
      }
      const args = composeWideArgs({ foreground: cut, background: bg, outPath: wide, mode: compose });
      if (!args.ok) throw new StudioError('invalid_request', args.detail);
      await exec(bin(), args.argv, { timeout: 120_000 });
      out = wide;
    }
    return { bytes: await readFile(out), durationSec: (await probeSec(out)) || take.trimEnd - take.trimStart };
  });
}

async function chirpWords(bytes: Buffer, lang: SceneJob['lang']) {
  const config = vertexAiConfig();
  if (!config) return null;
  const wav = await withTmp(async (dir) => {
    const src = join(dir, 'in.mp4'), out = join(dir, 'a.wav');
    await writeFile(src, bytes);
    await exec(bin(), ['-y', '-i', src, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', out], { timeout: 30_000 });
    return readFile(out);
  });
  const url = `https://us-speech.googleapis.com/v2/projects/${encodeURIComponent(config.projectId)}/locations/us/recognizers/_:recognize`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getVertexAccessToken(false)}` },
    body: JSON.stringify(chirpWordsBody(wav.toString('base64'), lang)),
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;
  const parsed = parseChirpWords(await res.json().catch(() => ({})));
  return parsed.words.length ? parsed : null;
}

/** A track's speech levels (16 kHz mono, voice band), for speechMatch. null when it has no audio. */
async function levelsOf(file: string, pcm: string): Promise<number[] | null> {
  try {
    await exec(bin(), ['-y', '-v', 'error', '-i', file, '-map', '0:a:0', '-af', 'highpass=f=120,lowpass=f=4000', '-ac', '1', '-ar', '16000', '-f', 's16le', pcm], { timeout: 60_000, maxBuffer: 1 << 24 });
    const buf = await readFile(pcm);
    if (buf.byteLength < 320) return null;
    return frameLevelsDb(new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2)), 16_000);
  } catch { return null; }
}

const TTS_LANG: Record<SceneJob['lang'], string> = { ka: 'ka-GE', en: 'en-US', ru: 'ru-RU' };

/**
 * The Studio voice over an Omni clip (D3, "lips approximate"): the named Gemini-TTS voice reads the scene, its exact
 * speed/pitch is applied (D6), and the line is cut at its pauses and laid onto where the presenter's mouth spoke
 * (speechMatch.planDub; unmatched → from the start, padded). The picture is stream-copied. null on any miss.
 */
export async function dubOmniClip(a: DubArgs): Promise<Buffer | null> {
  const mp3 = await synthesizeGoogleTts(a.text, { languageCode: TTS_LANG[a.lang], geminiVoice: a.voiceId });
  if (!mp3) return null;
  return withTmp(async (dir) => {
    const clip = join(dir, 'clip.mp4'), raw = join(dir, 'voice.mp3'), voice = join(dir, 'voice.wav'), out = join(dir, 'out.mp4');
    await writeFile(clip, a.clip);
    await writeFile(raw, Buffer.from(mp3));
    const adjust = voiceAdjustFilter(a.adjust);
    await exec(bin(), ['-y', '-i', raw, ...(adjust ? ['-af', adjust] : []), '-ac', '1', '-ar', '24000', voice], { timeout: 60_000 });
    const line = await levelsOf(voice, join(dir, 'line.pcm'));
    const mouth = await levelsOf(clip, join(dir, 'mouth.pcm'));
    const sec = Number(a.durationSec.toFixed(3));
    const pieces = planDub(line ? speechSpans(line) : [], mouth ? speechSpans(mouth) : [], sec);
    const graph = pieces ? dubFilter(pieces, '1:a', sec) : `[1:a]apad=whole_dur=${sec}[voice]`;
    await exec(bin(), [
      '-y', '-i', clip, '-i', voice, '-filter_complex', graph, '-map', '0:v:0', '-map', '[voice]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(sec), '-movflags', '+faststart', out,
    ], { timeout: 90_000, maxBuffer: 1 << 26 });
    const buf = await readFile(out);
    return buf.byteLength >= 1_024 ? buf : null;
  }).catch(() => null);
}

export function liveSceneDeps(userId: string): SceneDeps {
  const sb = () => createServiceRoleClient();
  return {
    hold: (uid, credits) => hasSufficientBalance(uid, credits),
    async charge(uid, credits, ref) { return (await deductCreditsOnce(uid, credits, ref)).ok; },
    async refund(uid, credits, ref) { await refundCredits(uid, credits, ref); },
    liveTake: recordLiveTake,
    finishLive: finishLiveTake,
    async omniSubmit(a) {
      if (a.previous) {
        const r = await submitOmniEdit({
          op: 'extend', prompt: a.prompt, previous: { id: a.previous.id, aspect: a.aspect, model: a.previous.model as OmniModel },
          seconds: a.seconds, resolution: a.resolution, userId, inputSec: 0,
        });
        return r.ok ? { ok: true, id: r.id, model: r.model } : { ok: false, reason: r.reason };
      }
      const face = await loadCuratedFace(a.face);
      if (!face) return { ok: false, reason: 'custom_avatar' };
      const r = await submitOmniClip({
        prompt: a.prompt, aspect: a.aspect, resolution: a.resolution, seconds: a.seconds, userId,
        firstFrame: { base64: face.base64, mimeType: 'image/jpeg' },
      });
      return r.ok ? { ok: true, id: r.id, model: r.model } : { ok: false, reason: r.reason };
    },
    async omniPoll(id, hostPath) {
      const p = await pollOmniClip(id, hostPath);
      return p.state === 'failed' ? { state: 'failed', reason: p.reason } : p.state === 'ready' ? { state: 'ready', url: p.url } : { state: p.state };
    },
    async fetchBytes(url) {
      const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(`clip ${r.status}`);
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length > MAX_CLIP_BYTES) throw new Error('clip too large');
      return b;
    },
    measure: (bytes) => withTmp(async (dir) => { const f = join(dir, 'm.mp4'); await writeFile(f, bytes); return probeSec(f); }),
    words: (bytes, lang) => chirpWords(bytes, lang).catch(() => null),
    dub: dubOmniClip,
    async save(uid, path, bytes, mime) {
      if (!ownsStudioPath(path, uid)) throw new StudioError('invalid_request', 'Bad storage path.');
      const { error } = await sb().storage.from(STUDIO_BUCKET).upload(path, bytes, { contentType: mime, upsert: true });
      if (error) throw new StudioError('not_configured', 'Studio storage is unavailable.', 503);
      const url = await createSignedAssetUrl(STUDIO_BUCKET, path, WEEK_SEC);
      if (!url) throw new StudioError('not_configured', 'Studio storage is unavailable.', 503);
      return url;
    },
    async saveJob(uid, job) {
      const { error } = await sb().storage.from(STUDIO_BUCKET).upload(jobPath(uid, job.id), Buffer.from(JSON.stringify(job)), { contentType: 'application/json', upsert: true });
      if (error) throw new StudioError('not_configured', 'Studio storage is unavailable.', 503);
    },
    async loadJob(uid, id) {
      if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return null;
      const { data, error } = await sb().storage.from(STUDIO_BUCKET).download(jobPath(uid, id));
      if (error || !data) return null;
      try {
        const job = JSON.parse(await data.text()) as SceneJob;
        return job?.kind === 'avatar-studio-scene' && job.id === id ? job : null;
      } catch { return null; }
    },
    newId: randomUUID,
    now: () => new Date(),
  };
}

/** A signed URL for a background the caller uploaded (their own folder only), or null. */
export async function signedStudioUrl(userId: string, path: string): Promise<string | null> {
  if (!ownsStudioPath(path, userId)) return null;
  return createSignedAssetUrl(STUDIO_BUCKET, path, WEEK_SEC).catch(() => null);
}
