/**
 * lib/video/ffmpegExec.ts — run ffmpeg on media a caller may have chosen, without letting ffmpeg fetch anything.
 *
 * `ffmpeg -i <url>` is a fetch of that address by ffmpeg's own http client: it resolves the name itself, follows
 * redirects, and speaks HLS / DASH, so a caller-chosen URL reaches the metadata service or a private network (SSRF),
 * and a playlist can pull other files into the output. So, for every http(s) `-i` input:
 *
 *   • it is downloaded first through lib/web/publicFetch (public hosts only, every redirect hop re-checked, the
 *     connection pinned to a public address, media types only, a byte cap while streaming) into a private temp dir;
 *   • ffmpeg reads that local file with `-protocol_whitelist file` and `-format_whitelist` naming only the demuxers
 *     our media uses, so the file cannot turn out to be a playlist that reaches anything else.
 *
 * Same call shape as `promisify(execFile)`, so a module swaps its `exec` for this one. Inputs that are local paths or
 * lavfi sources pass through untouched. A refused or failed download rejects before ffmpeg runs.
 *
 * CANCEL. `withFfmpegSignal(signal, work)` stops every ffmpeg this module runs inside `work` when `signal` aborts: the
 * running child is killed (SIGKILL, see runUntil), a download in flight is dropped,
 * and a call that starts after the abort rejects without spawning anything. The signal travels with the async context
 * (AsyncLocalStorage), so the ops between a job and ffmpeg (lib/video/remixOps, surgicalOps) need no new parameter.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { execFile, type ExecFileOptions } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fetchPublicToFile, MEDIA_TYPES, type PublicFetchOptions } from '@/lib/web/publicFetch';

const run = promisify(execFile);

/** The demuxers our clips, tracks and stills come in (mp4/mov/m4a, mkv/webm, ts, mp3, wav, aac, ogg, flac, images). */
export const SAFE_INPUT_FLAGS: readonly string[] = [
  '-protocol_whitelist', 'file',
  '-format_whitelist', 'mov,matroska,mpegts,avi,flv,mpeg,mp3,wav,aac,ogg,flac,image2,png_pipe,jpeg_pipe,webp_pipe,gif',
];

/** One input's cap. Input and output both sit in the function's /tmp (512 MB on Vercel). */
export const MAX_INPUT_BYTES = 200 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const KNOWN_EXT = /\.(mp4|m4v|mov|webm|mkv|ts|mp3|m4a|aac|wav|ogg|oga|opus|flac|png|jpe?g|webp|gif)$/i;

function localName(url: string, n: number): string {
  let ext = 'bin';
  try { ext = KNOWN_EXT.exec(new URL(url).pathname)?.[1]?.toLowerCase() ?? 'bin'; } catch { /* keep bin */ }
  return `in${n}.${ext}`;
}

export type FfmpegIo = Pick<PublicFetchOptions, 'fetchImpl' | 'lookupImpl'>;

const ambient = new AsyncLocalStorage<AbortSignal>();

/** Run `work` so that every ffmpeg started inside it stops when `signal` aborts. */
export function withFfmpegSignal<T>(signal: AbortSignal | undefined, work: () => Promise<T>): Promise<T> {
  return signal ? ambient.run(signal, work) : work();
}

/** The cancel signal of the current async context, if a caller set one. */
export function currentFfmpegSignal(): AbortSignal | undefined {
  return ambient.getStore();
}

function abortError(): Error {
  const e = new Error('ffmpeg cancelled');
  e.name = 'AbortError';
  return e;
}

/**
 * execFile, killed with SIGKILL on abort. Not execFile's own `signal` option: that sends SIGTERM (its `killSignal` is
 * only for the timeout), and ffmpeg treats SIGTERM as "finish up": it flushes the encoder and writes the trailer, which
 * on a long encode keeps the CPU busy for seconds after the job was cancelled. A cancelled render's output is thrown
 * away, so there is nothing to finish.
 */
function runUntil(bin: string, argv: string[], options: ExecFileOptions, signal: AbortSignal | undefined): Promise<{ stdout: string; stderr: string }> {
  if (!signal) return run(bin, argv, options) as Promise<{ stdout: string; stderr: string }>;
  return new Promise((resolve, reject) => {
    const onAbort = () => { child.kill('SIGKILL'); };
    const child = execFile(bin, argv, options, (error, stdout, stderr) => {
      signal.removeEventListener('abort', onAbort);
      if (signal.aborted) return reject(abortError());
      if (error) return reject(Object.assign(error, { stdout: String(stdout), stderr: String(stderr) }));
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function ffmpegExec(
  bin: string,
  args: readonly string[],
  options: ExecFileOptions = {},
  io: FfmpegIo = {},
): Promise<{ stdout: string; stderr: string }> {
  const { signal: own, ...rest } = options;
  const signal = own ?? ambient.getStore();
  options = rest;
  if (signal?.aborted) throw abortError();
  const remote = [...new Set(args.filter((a, i) => i > 0 && args[i - 1] === '-i' && /^https?:\/\//i.test(a)))];
  if (remote.length === 0) return runUntil(bin, [...args], options, signal);

  const dir = await mkdtemp(join(tmpdir(), 'ffin-'));
  try {
    const local = new Map<string, string>();
    for (const [n, url] of remote.entries()) {
      const path = join(dir, localName(url, n));
      const got = await fetchPublicToFile(url, path, {
        ...io,
        ...(signal ? { signal } : {}),
        maxBytes: MAX_INPUT_BYTES,
        accept: MEDIA_TYPES,
        timeoutMs: Math.min(Number(options.timeout) || DOWNLOAD_TIMEOUT_MS, DOWNLOAD_TIMEOUT_MS),
      });
      if (signal?.aborted) throw abortError();
      if (!got.ok) throw new Error(`ffmpeg input refused (${got.error})`);
      local.set(url, path);
    }
    const argv: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const next = args[i + 1];
      if (args[i] === '-i' && next !== undefined && local.has(next)) {
        argv.push(...SAFE_INPUT_FLAGS, '-i', local.get(next)!);
        i++;
      } else {
        argv.push(args[i]!);
      }
    }
    return await runUntil(bin, argv, options, signal);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
