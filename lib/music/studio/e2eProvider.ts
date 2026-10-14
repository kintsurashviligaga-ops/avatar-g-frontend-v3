/**
 * lib/music/studio/e2eProvider.ts — a STAND-IN for Google Lyria, for the isolated browser E2E only
 * (.github/workflows/music-studio-e2e-local.yml: `next start` against a throwaway local Supabase stack on the runner).
 *
 * Everything around it is real — auth, the quote token, the ledger reservation and refund, the lease worker, the sweep,
 * ffmpeg QC, private Storage, signed links, the Library row, the edits. Only the provider's bytes are made here: a
 * synthetic ~30 s stereo MP3 rendered by the bundled ffmpeg. A result made this way is NEVER evidence about Lyria.
 *
 * FAIL-CLOSED. It answers only when ALL hold:
 *   · MUSIC_STUDIO_E2E_FAKE_PROVIDER=1;
 *   · not on Vercel (no VERCEL / VERCEL_ENV) — a Preview or Production deployment can never use it;
 *   · the Supabase address the server uses is on this machine: localhost, 127.0.0.1, or a reserved `.test` host
 *     (the CI job maps one to its own loopback). A hosted *.supabase.co project can never reach it.
 *
 * Fault switches, read from the request prompt (so a spec can drive each path through the real UI):
 *   [e2e:fail]   the provider fails            → the job fails, the reservation is refunded once
 *   [e2e:silent] the provider returns silence  → QC refuses it, refunded once
 *   [e2e:slow]   the provider takes ~60 s      → time for Cancel / reload while it is "composing"
 */
import 'server-only';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { MusicError } from './errors';

type Env = NodeJS.ProcessEnv;

function supabaseHost(env: Env): string {
  const raw = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
  try { return new URL(raw).hostname.toLowerCase(); } catch { return ''; }
}

/** True only on an isolated test machine that asked for it (see the header). Pure. */
export function e2eFakeLyriaEnabled(env: Env = process.env): boolean {
  if (env.MUSIC_STUDIO_E2E_FAKE_PROVIDER !== '1') return false;
  if (env.VERCEL || env.VERCEL_ENV) return false;
  const host = supabaseHost(env);
  return host === 'localhost' || host === '127.0.0.1' || /^[a-z0-9.-]+\.test$/.test(host);
}

/** The fault a prompt asks for. Pure. */
export function e2eFault(prompt: string): 'fail' | 'silent' | 'slow' | null {
  const m = /\[e2e:(fail|silent|slow)\]/.exec(prompt);
  return m ? (m[1] as 'fail' | 'silent' | 'slow') : null;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new MusicError('cancelled', 'Cancelled.', 409));
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); reject(new MusicError('cancelled', 'Cancelled.', 409)); }, { once: true });
  });
}

/** A synthetic track: 30 s stereo 44.1 kHz MP3, a tone whose pitch follows the prompt (so two tracks differ). */
export async function e2eFakeTrack(prompt: string, signal: AbortSignal): Promise<{ bytes: Buffer; mime: string; providerRequestId: null; caption: string }> {
  if (!e2eFakeLyriaEnabled()) throw new MusicError('not_configured', 'The Google music engine is not configured.', 503);
  const fault = e2eFault(prompt);
  await wait(fault === 'slow' ? 60_000 : 4_000, signal);
  if (fault === 'fail') throw new MusicError('provider_failed', 'The music engine did not return a track.', 502);
  let h = 0;
  for (const ch of prompt) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  const freq = 220 + (h % 440);
  const src = fault === 'silent' ? 'anullsrc=r=44100:cl=stereo' : `sine=frequency=${freq}:sample_rate=44100`;
  const dir = await mkdtemp(join(tmpdir(), 'music-e2e-'));
  try {
    const out = join(dir, 'track.mp3');
    await new Promise<void>((resolve, reject) => {
      execFile((ffmpegStatic as unknown as string) || 'ffmpeg',
        ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', src, '-t', '30', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '128k', out],
        { timeout: 60_000, signal }, (err) => (err ? reject(new MusicError('provider_failed', 'The music engine did not return a track.', 502)) : resolve()));
    });
    return { bytes: await readFile(out), mime: 'audio/mpeg', providerRequestId: null, caption: 'E2E stand-in (not Lyria)' };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
