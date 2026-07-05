/**
 * runCommercialRender — CORE SYSTEM INTEGRATION: wires the async worker to the commercial's real
 * paid assets. Builds the render jobs from the exact blueprint parameters, runs them through the
 * background worker (submit → poll → resolve), and routes each delivered asset into its slot.
 *
 * `buildCommercialJobs` is PURE (unit-tested); `routeCompletedAsset` + `runCommercialRender` are the
 * impure runner, meant for a server-side compile context (a Next route or a Vercel cron tick — NOT a
 * blocking request). It NEVER hits a provider unless a real adapter + key is supplied, and it can
 * only produce assets when the account has credits (the video engine is credit-gated).
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createJob, type RenderJob, type QueueConfig, DEFAULT_CONFIG } from './asyncRenderQueue';
import { runRenderQueue, type RunDeps } from './runRenderQueue';
import { realProviders, type ProviderAdapter } from './renderProviders';
import type { RenderJobKind } from './asyncRenderQueue';

/** The unified Georgian VO script (blueprint §6, tightened variants) + the trap-folk score brief. */
export const COMMERCIAL_PARAMS = {
  vo: [
    'ყველაფერი იწყება ერთი მარტივი იდეით…',
    'ერთი ჩატიდან — მთელი შემოქმედებითი სტუდია: გამოსახულება, მუსიკა, ხმა და სახის ჩანაცვლება.',
    'ჩვენი პარალელური მილსადენი თავად აწყობს სცენებს, მუსიკასა და ხმას — ერთიან, დასრულებულ ნამუშევრად.',
    'შემოუერთდი AI რევოლუციას დღესვე.',
  ].join(' '),
  musicPrompt:
    'premium cinematic trap-folk, Georgian, ~115 BPM A-minor, airy evolving pad intro building to a clean driving pulse with arpeggiated bright synths and tight electronic percussion, hopeful and confident, a brief pull-back then a triumphant resolve, short bright signature sting at the end',
  // The environmental / abstract shots that have NO legible UI → safely AI-generatable (unlike the
  // [CAPTURE] UI shots, which stay deterministic-mockup or real screen recordings).
  videoShots: [
    { slot: 'S01', prompt: 'extreme minimalist dark void #0A0A0F, a single luminous cyan particle drifting through deep negative space, volumetric haze, cinematic, 8k, no text' },
    { slot: 'S10', prompt: 'abstract 3D data-pipeline in dark space, glowing cyan tracks receding into depth, clean data blocks gliding on rails, volumetric light, premium tech trailer, 8k, no text' },
    { slot: 'S15', prompt: 'slow dolly-back reveal of a premium minimalist creative desk, an unbranded studio monitor glowing softly, warm room light, cyan screen rim-light, cinematic, 8k, no logos, no text' },
  ],
} as const;

/** PURE: the exact set of paid jobs for the commercial (music + VO + the 3 AI-GEN video shots). */
export function buildCommercialJobs(now: number, aspect = '9:16'): RenderJob[] {
  const jobs: RenderJob[] = [
    createJob('music', 'music', 'music', { prompt: COMMERCIAL_PARAMS.musicPrompt, durationSec: 60, instrumental: true }, now),
    createJob('vo', 'voiceover', 'vo', { text: COMMERCIAL_PARAMS.vo, language: 'ka' }, now),
  ];
  for (const v of COMMERCIAL_PARAMS.videoShots) {
    jobs.push(createJob(v.slot, 'video', v.slot, { prompt: v.prompt, aspect }, now));
  }
  return jobs;
}

/** Where a completed asset for a given job lands under commercial/. */
export function slotPathFor(job: RenderJob): string {
  if (job.kind === 'music') return 'commercial/02_audio/score/generated_track.wav';
  if (job.kind === 'voiceover') return 'commercial/02_audio/vo/generated_vo_unified.wav';
  return `commercial/01_source/ai_gen/${job.slot}_paid.mov`; // video shots
}

export interface RouteDeps {
  fetch: typeof fetch;
  writeFile: typeof writeFile;
  mkdir: typeof mkdir;
}

/** Download a completed asset URL and write it to its slot. Returns the path, or null on failure. */
export async function routeCompletedAsset(job: RenderJob, deps: RouteDeps): Promise<string | null> {
  if (job.status !== 'completed' || !job.assetUrl) return null;
  try {
    const res = await deps.fetch(job.assetUrl);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const path = slotPathFor(job);
    await deps.mkdir(dirname(path), { recursive: true });
    await deps.writeFile(path, buf);
    return path;
  } catch {
    return null;
  }
}

export interface CommercialRunDeps {
  adapters?: Partial<Record<RenderJobKind, ProviderAdapter>>;
  now(): number;
  sleep(ms: number): Promise<void>;
  route?: RouteDeps;
  onUpdate?: RunDeps['onUpdate'];
  cfg?: QueueConfig;
  aspect?: string;
}

/** Production runner: build → submit/poll via real providers → route each completed asset. */
export async function runCommercialRender(deps: CommercialRunDeps): Promise<RenderJob[]> {
  const cfg = deps.cfg ?? DEFAULT_CONFIG;
  const adapters = deps.adapters ?? realProviders();
  const jobs = buildCommercialJobs(deps.now(), deps.aspect ?? '9:16');
  const finished = await runRenderQueue(jobs, {
    adapters,
    now: deps.now,
    sleep: deps.sleep,
    onUpdate: deps.onUpdate,
  }, cfg);
  // Route every delivered asset into its slot — AWAITED (not fire-and-forget) so the runner only
  // resolves once all assets are actually written to disk. A fire-and-forget route would let the
  // runner "finish" while the last download is still in flight (the race a test caught here).
  const route = deps.route;
  if (route) {
    await Promise.all(
      finished.filter((j) => j.status === 'completed' && j.assetUrl).map((j) => routeCompletedAsset(j, route)),
    );
  }
  return finished;
}
