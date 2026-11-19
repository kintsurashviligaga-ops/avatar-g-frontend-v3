/**
 * lib/music/producer/place.server.ts — put a Music Producer track into a cut film ("Use in Video"). Server only. Free:
 * our own ffmpeg, no provider call. The film is DOWNLOADED first (public-fetch rules, our own storage only, byte cap) and
 * ffmpeg reads only local files. The picture is stream-copied; only the audio is mixed (placement.cueArgs).
 * Every side effect is injected, so the order and the refusals are tested without ffmpeg or the network.
 */
import 'server-only';
import { join } from 'node:path';
import { buildProbeArgs, parseProbe } from '@/lib/video/longform/stitch';
import { cueArgs, type Cue } from './placement';

type Exec = (bin: string, args: string[], opts: { timeout: number }) => Promise<{ stdout: string; stderr: string }>;

export interface PlaceDeps {
  bin: string | null;
  download(url: string, path: string): Promise<boolean>;
  writeFile(path: string, bytes: Buffer): Promise<void>;
  readFile(path: string): Promise<Buffer>;
  exec: Exec;
  tmp(): Promise<string>;
  cleanup(dir: string): Promise<void>;
}

export type PlaceResult = { ok: true; bytes: Buffer; filmHadAudio: boolean } | { ok: false; reason: string };

export async function placeOnFilm(deps: PlaceDeps, input: { filmUrl: string; track: Buffer; cue: Cue; budgetMs: number }): Promise<PlaceResult> {
  if (!deps.bin) return { ok: false, reason: 'ffmpeg_missing' };
  const dir = await deps.tmp();
  try {
    const film = join(dir, 'film.mp4');
    const track = join(dir, 'track.mp3');
    const out = join(dir, 'out.mp4');
    if (!(await deps.download(input.filmUrl, film))) return { ok: false, reason: 'film_unavailable' };
    await deps.writeFile(track, input.track);
    let hasAudio = true;
    let hasVideo = true;
    try {
      await deps.exec(deps.bin, buildProbeArgs(film), { timeout: 20_000 });
    } catch (e) {
      const p = parseProbe(String((e as { stderr?: string } | null)?.stderr ?? ''));
      hasAudio = !!p.audio;
      hasVideo = !!p.video;
    }
    if (!hasVideo) return { ok: false, reason: 'not_a_video' };
    await deps.exec(deps.bin, cueArgs(film, track, out, input.cue, hasAudio), { timeout: Math.max(30_000, input.budgetMs - 15_000) });
    return { ok: true, bytes: await deps.readFile(out), filmHadAudio: hasAudio };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message.slice(0, 200) : 'place_failed' };
  } finally {
    await deps.cleanup(dir).catch(() => undefined);
  }
}
