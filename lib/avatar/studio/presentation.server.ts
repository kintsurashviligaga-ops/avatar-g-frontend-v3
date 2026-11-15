/**
 * lib/avatar/studio/presentation.server.ts — the stitched presentation: every ready scene of one project, in order,
 * joined by the Director's Workflow stitcher (lib/video/longform/stitch, via studioStitchInput), saved privately, with
 * its chapter marks and the whole transcript as SRT. Free (no provider call). Server only.
 */
import 'server-only';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';
import { buildProbeArgs, buildStitchPlan, DEFAULT_MAX_UPLOAD_BYTES, parseProbe } from '@/lib/video/longform/stitch';
import { StudioError } from './errors';
import { STUDIO_BUCKET } from './live';
import type { SceneDeps, SceneJob } from './sceneRun';
import { ownsStudioPath } from './sceneRun';
import { studioStitchInput, type Chapter } from './stitch';
import { presentationTimeline, toCues, toSrt } from './timing';

const exec = promisify(execFile);

export interface Presentation { url: string; path: string; durationSec: number; chapters: Chapter[]; srt: string; mode: 'copy' | 'reencode' }

/** The jobs to stitch: all the caller's, all ready, one project, one take per scene (the order given). Pure. */
export function checkJobs(jobs: ReadonlyArray<SceneJob | null>, projectId: string): SceneJob[] {
  const missing = jobs.findIndex((j) => !j || j.projectId !== projectId);
  if (missing >= 0) throw new StudioError('not_found', `Scene ${missing + 1} was not found.`, 404);
  const ok = jobs as SceneJob[];
  const notReady = ok.findIndex((j) => j.state !== 'ready' || !j.path);
  if (notReady >= 0) throw new StudioError('scene_missing', `Scene ${notReady + 1} is not ready yet.`, 409);
  const seen = new Set<number>();
  for (const j of ok) {
    if (seen.has(j.sceneIndex)) throw new StudioError('invalid_request', 'A scene is listed twice.');
    seen.add(j.sceneIndex);
  }
  return [...ok].sort((a, b) => a.sceneIndex - b.sceneIndex);
}

export async function stitchPresentation(deps: Pick<SceneDeps, 'save'>, userId: string, projectId: string, jobs: SceneJob[]): Promise<Presentation> {
  const bin = (ffmpegStatic as unknown as string) || '';
  if (!bin) throw new StudioError('not_configured', 'ffmpeg is missing.', 503);
  const dir = await mkdtemp(join(tmpdir(), 'studio-cut-'));
  try {
    const scenes: Array<{ index: number; source: string; durationSec: number; bytes: number; title: string }> = [];
    for (const [i, j] of jobs.entries()) {
      if (!j.path || !ownsStudioPath(j.path, userId)) throw new StudioError('not_found', `Scene ${i + 1} was not found.`, 404);
      const url = await createSignedAssetUrl(STUDIO_BUCKET, j.path, 3600);
      const r = url ? await fetch(url, { signal: AbortSignal.timeout(60_000) }) : null;
      if (!r?.ok) throw new StudioError('scene_missing', `Scene ${i + 1} could not be read.`, 409);
      const file = join(dir, `scene-${String(i + 1).padStart(2, '0')}.mp4`);
      await writeFile(file, Buffer.from(await r.arrayBuffer()));
      let durationSec = j.durationSec ?? 0;
      try { await exec(bin, buildProbeArgs(file), { timeout: 20_000 }); } catch (e) {
        durationSec = parseProbe(String((e as { stderr?: string }).stderr ?? '')).durationSec ?? durationSec;
      }
      scenes.push({ index: j.sceneIndex, source: file, durationSec, bytes: (await stat(file)).size, title: `Scene ${j.sceneIndex + 1}` });
    }
    const input = studioStitchInput(scenes, { workDir: dir, outName: 'presentation.mp4' });
    if (!input.ok) throw new StudioError('scene_missing', input.detail, 409);
    const planned = buildStitchPlan({ ...input.input, maxUploadBytes: DEFAULT_MAX_UPLOAD_BYTES, resumableUploadAvailable: false });
    if (!planned.ok) throw new StudioError('stitch_failed', planned.detail, 422);
    const plan = planned.plan;
    if (plan.concatList) await writeFile(plan.concatList.path, plan.concatList.content, 'utf8');
    await exec(bin, plan.argv, { timeout: 240_000, maxBuffer: 1 << 26 });
    const path = `avatar-studio/${userId}/${projectId}/presentation-${Date.now()}.mp4`;
    const url = await deps.save(userId, path, await readFile(plan.outPath), 'video/mp4');
    const timeline = presentationTimeline(jobs.map((j, i) => ({ timings: j.timings ?? [], durationSec: scenes[i]!.durationSec })));
    return { url, path, durationSec: plan.totalDurationSec, chapters: input.chapters, srt: toSrt(toCues(timeline)), mode: plan.mode };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
