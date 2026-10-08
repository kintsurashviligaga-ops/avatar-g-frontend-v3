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
 */
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

export async function ffmpegExec(
  bin: string,
  args: readonly string[],
  options: ExecFileOptions = {},
  io: FfmpegIo = {},
): Promise<{ stdout: string; stderr: string }> {
  const remote = [...new Set(args.filter((a, i) => i > 0 && args[i - 1] === '-i' && /^https?:\/\//i.test(a)))];
  if (remote.length === 0) return run(bin, [...args], options) as Promise<{ stdout: string; stderr: string }>;

  const dir = await mkdtemp(join(tmpdir(), 'ffin-'));
  try {
    const local = new Map<string, string>();
    for (const [n, url] of remote.entries()) {
      const path = join(dir, localName(url, n));
      const got = await fetchPublicToFile(url, path, {
        ...io,
        maxBytes: MAX_INPUT_BYTES,
        accept: MEDIA_TYPES,
        timeoutMs: Math.min(Number(options.timeout) || DOWNLOAD_TIMEOUT_MS, DOWNLOAD_TIMEOUT_MS),
      });
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
    return (await run(bin, argv, options)) as { stdout: string; stderr: string };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
