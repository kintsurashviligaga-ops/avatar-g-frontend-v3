import 'server-only';

/**
 * RVC voice training + singing-voice conversion — the FAITHFUL "sing in MY voice".
 *
 * Zero-shot models (MiniMax) only approximate a voice. To actually sound like the
 * user we TRAIN a personal RVC model on a sample of their voice, then convert a
 * generated song's vocals to that model:
 *
 *   1. prepareDatasetZip — split the voice into 8s wavs, zip as
 *      `dataset/<name>/split_<i>.wav` (the format replicate/train-rvc-model wants).
 *   2. startRvcTraining   — kick off training (returns a prediction id; ~10–20 min).
 *   3. pollRvcPrediction  — poll that id to completion → the trained model URL.
 *   4. convertSongWithRvc — zsxkib/realistic-voice-cloning swaps a song's vocals for
 *      the trained voice.
 *
 * All Replicate work runs on the existing REPLICATE_API_TOKEN. The split needs the
 * bundled ffmpeg-static (trace it into any route that calls prepareDatasetZip).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import JSZip from 'jszip';
import Replicate from 'replicate';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';

const exec = promisify(execFile);

const TRAIN_VERSION = '0397d5e28c9b54665e1e5d29d5cf4f722a7b89ec20e9dbf31487235305b1a101'; // replicate/train-rvc-model
const RVC_VERSION = '0a9c7c558af4c0f20667c1bd1260ce32a2879944a0b9e44e1398660c077b1550';   // zsxkib/realistic-voice-cloning

function token(): string {
  return String(process.env.REPLICATE_API_TOKEN || '').trim();
}

/** A safe RVC model name (folder + model id) from a user id. */
export function rvcNameFor(userId: string): string {
  return `voice_${userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16) || 'me'}`;
}

/**
 * Fetch the voice clip → 8s mono 48k wav segments → zip → Supabase → signed URL.
 * Returns null fail-open. `name` becomes the dataset folder + the trained model id.
 */
export async function prepareDatasetZip(voiceUrl: string, name: string): Promise<string | null> {
  const bin = ffmpegStatic as unknown as string | null;
  if (!bin || !voiceUrl) return null;
  let dir = '';
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 25_000);
    const r = await fetch(voiceUrl, { signal: ac.signal }).finally(() => clearTimeout(to));
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength < 2000) return null;

    dir = await mkdtemp(join(tmpdir(), 'rvc_'));
    const inPath = join(dir, 'in');
    const outDir = join(dir, 'dataset', name);
    await mkdir(outDir, { recursive: true });
    await writeFile(inPath, buf);
    // Split into 8-second mono 48kHz wav chunks (ffmpeg detects the input container).
    await exec(bin, ['-y', '-i', inPath, '-ac', '1', '-ar', '48000', '-f', 'segment', '-segment_time', '8', join(outDir, 'split_%d.wav')], { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
    const files = (await readdir(outDir)).filter((f) => f.endsWith('.wav')).sort();
    if (!files.length) return null;

    const zip = new JSZip();
    for (const f of files) zip.file(`dataset/${name}/${f}`, await readFile(join(outDir, f)));
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const path = `rvc-datasets/${Date.now()}-${name}.zip`;
    return (await uploadAndSign('uploads', path, zipBuf.toString('base64'), 'application/zip', 3600)) || null;
  } catch {
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Start an RVC training. Returns the Replicate prediction id (poll it later). */
export async function startRvcTraining(datasetUrl: string, epoch = 20): Promise<string | null> {
  const t = token();
  if (!t || !datasetUrl) return null;
  try {
    const res = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        version: TRAIN_VERSION,
        input: { dataset_zip: datasetUrl, epoch, sample_rate: '48k', version: 'v2', f0method: 'rmvpe_gpu', batch_size: '7' },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const p = (await res.json()) as { id?: string };
    return p?.id || null;
  } catch {
    return null;
  }
}

/**
 * Copy a freshly-trained model out of Replicate's TEMPORARY delivery URL into
 * permanent Supabase storage — otherwise the stored model URL expires and a later
 * "sing in my voice" silently fails. Fail-open → returns the original URL.
 */
export async function rehostModel(modelUrl: string): Promise<string> {
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 60_000);
    const r = await fetch(modelUrl, { signal: ac.signal }).finally(() => clearTimeout(to));
    if (!r.ok) return modelUrl;
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.byteLength || buf.byteLength > 200 * 1024 * 1024) return modelUrl;
    const path = `rvc-models/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.zip`;
    return (await uploadAndSign('uploads', path, buf.toString('base64'), 'application/zip', 60 * 60 * 24 * 365)) || modelUrl;
  } catch {
    return modelUrl;
  }
}

export interface RvcPoll { status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'; modelUrl?: string; error?: string }

/** Poll a Replicate prediction (training) by id. The training output is the model URL. */
export async function pollRvcPrediction(id: string): Promise<RvcPoll> {
  const t = token();
  if (!t) return { status: 'failed', error: 'no token' };
  try {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${t}` }, cache: 'no-store', signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { status: 'processing' }; // transient → keep polling
    const p = (await res.json()) as { status?: RvcPoll['status']; output?: unknown; error?: string | null };
    const out = p.output;
    const modelUrl = typeof out === 'string' ? out : Array.isArray(out) ? String(out[0] ?? '') : '';
    return { status: p.status || 'processing', ...(modelUrl ? { modelUrl } : {}), ...(p.error ? { error: String(p.error) } : {}) };
  } catch {
    return { status: 'processing' };
  }
}

/**
 * Swap a song's vocals for the trained voice via zsxkib/realistic-voice-cloning.
 * `songUrl` is a full song (vocals + music); returns the converted song URL. Throws
 * on a real failure so the caller can fall back to the zero-shot result.
 */
export async function convertSongWithRvc(songUrl: string, modelUrl: string, pitch: 'no-change' | 'male-to-female' | 'female-to-male' = 'no-change'): Promise<string> {
  const replicate = new Replicate({ auth: token(), useFileOutput: false });
  const output = (await replicate.run(`zsxkib/realistic-voice-cloning:${RVC_VERSION}`, {
    input: {
      song_input: songUrl,
      // A custom (trained) model is selected with the literal "CUSTOM" + its download URL.
      rvc_model: 'CUSTOM',
      custom_rvc_model_download_url: modelUrl,
      pitch_change: pitch,
      index_rate: 0.66,
      main_vocals_volume_change: 0,
      output_format: 'mp3',
    },
  })) as unknown;
  const url = typeof output === 'string' ? output
    : Array.isArray(output) ? String((output[0] as { url?: () => string } | string) ?? '')
    : String((output as { url?: unknown })?.url ?? '');
  if (!url || !/^https?:\/\//i.test(url)) throw new Error('RVC conversion returned no usable URL');
  return url;
}
