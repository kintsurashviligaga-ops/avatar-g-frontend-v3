/** lib/music/producer/placeLive.ts — the real side effects behind placeOnFilm (ffmpeg-static, public fetch, temp dir). Server only. */
import 'server-only';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { fetchPublicToFile, MEDIA_TYPES } from '@/lib/web/publicFetch';
import type { PlaceDeps } from './place.server';

const FILM_MAX_BYTES = 200 * 1024 * 1024;
type Exec = PlaceDeps['exec'];
const pexec = promisify(execFile) as unknown as Exec;

export const livePlaceDeps = (): PlaceDeps => ({
  bin: (ffmpegStatic as unknown as string | null) ?? null,
  download: async (url, path) => (await fetchPublicToFile(url, path, { maxBytes: FILM_MAX_BYTES, accept: MEDIA_TYPES, timeoutMs: 60_000 })).ok,
  writeFile: (p, b) => writeFile(p, b),
  readFile: (p) => readFile(p),
  exec: (bin, args, opts) => pexec(bin, args, { ...opts, killSignal: 'SIGKILL', maxBuffer: 1 << 26 } as never),
  tmp: () => mkdtemp(join(tmpdir(), 'mp-place-')),
  cleanup: (d) => rm(d, { recursive: true, force: true }),
});
