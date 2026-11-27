/**
 * lib/video/directorsWorkflow/runner.ts — render an approved storyboard scene by scene (Phase 8.3, PR C).
 *
 * Each scene is ONE direct clip, started and charged on its own through POST /api/video/director-workflow/scene (the
 * single-clip charge path), then polled on GET /api/genjutsu/status, which refunds a failed render by its signed charge
 * token. So the user pays only for delivered scenes (GG 2026-11-14 10:38Z decision 3).
 *
 * ORDER:
 *   • A scene that CONTINUES from the previous one ('previous') waits for that scene's finished clip: its last frame is
 *     this scene's first frame (lib/video/lastFrame on the server).
 *   • Independent scenes ('none' / 'photo') render in parallel, at most `concurrency` (2) at a time.
 *   • A scene whose previous scene failed is BLOCKED: it is never started, so it is never charged. Re-render the failed
 *     scene and the blocked one follows (rerun with `only`).
 *
 * Network-free: `start`, `poll` and `wait` are injected (the browser passes fetch-backed ones, tests pass fakes).
 */
import type { DwProject, DwScene } from './types';

export type DwSceneRunState = 'waiting' | 'starting' | 'rendering' | 'done' | 'failed' | 'blocked';

export interface DwSceneRun {
  sceneId: string;
  state: DwSceneRunState;
  jobId?: string;
  videoUrl?: string;
  credits?: number;
  error?: string;
  refunded?: boolean;
}

export type DwRuns = Record<string, DwSceneRun>;

export type DwStartResult = { ok: true; jobId: string; credits: number } | { ok: false; error: string };
export type DwPollResult = { state: 'running' } | { state: 'ready'; videoUrl: string } | { state: 'failed'; error: string; refunded: boolean };

export interface DwRunDeps {
  /** Start (and charge) one scene. `previousClipUrl` is set only when the scene continues from the one before. */
  start: (scene: DwScene, previousClipUrl: string | null) => Promise<DwStartResult>;
  poll: (jobId: string) => Promise<DwPollResult>;
  wait: (ms: number) => Promise<void>;
  onUpdate?: (runs: DwRuns) => void;
  signal?: AbortSignal;
  /** GG 2026-11-14 plan: at most 2 scenes render at once. */
  concurrency?: number;
  pollMs?: number;
  /** A render still not answered after this many polls is given up on here (the status route refunds it server-side). */
  maxPolls?: number;
}

export const DW_RENDER_CONCURRENCY = 2;
const POLL_MS = 5_000;
const MAX_POLLS = 240; // 20 minutes at 5 s

const sorted = (p: DwProject): DwScene[] => [...p.scenes].sort((a, b) => a.order - b.order);

/** The scene a scene waits for, or null. */
export function sceneDependency(project: DwProject, scene: DwScene): string | null {
  if (scene.firstFrame !== 'previous') return null;
  return sorted(project).find((s) => s.order === scene.order - 1)?.id ?? null;
}

/**
 * Render the scenes of `project` (or only the ids in `only`). `prior` holds the clips already delivered from an earlier
 * run (sceneId → videoUrl): a re-render of scene 3 that continues from scene 2 reads scene 2's clip from there.
 */
export async function runFilm(project: DwProject, deps: DwRunDeps, only?: readonly string[], prior: Readonly<Record<string, string>> = {}): Promise<DwRuns> {
  const concurrency = Math.max(1, deps.concurrency ?? DW_RENDER_CONCURRENCY);
  const pollMs = deps.pollMs ?? POLL_MS;
  const maxPolls = deps.maxPolls ?? MAX_POLLS;
  const todo = sorted(project).filter((s) => !only || only.includes(s.id));
  const runs: DwRuns = Object.fromEntries(todo.map((s) => [s.id, { sceneId: s.id, state: 'waiting' as const }]));
  const emit = () => deps.onUpdate?.(Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, { ...v }])));
  const set = (id: string, patch: Partial<DwSceneRun>) => { runs[id] = { ...runs[id]!, ...patch }; emit(); };
  emit();

  /** The clip a scene starts from: from this run, or from an earlier one. undefined = not there yet; null = never. */
  const sourceClip = (dep: string): string | null | undefined => {
    const r = runs[dep];
    if (r) return r.state === 'done' ? r.videoUrl ?? null : r.state === 'failed' || r.state === 'blocked' ? null : undefined;
    return prior[dep] ?? null;
  };

  const renderOne = async (scene: DwScene, previousClipUrl: string | null): Promise<void> => {
    set(scene.id, { state: 'starting', error: undefined, refunded: undefined });
    let started: DwStartResult;
    try {
      started = await deps.start(scene, previousClipUrl);
    } catch {
      started = { ok: false, error: 'network' };
    }
    if (!started.ok) { set(scene.id, { state: 'failed', error: started.error, refunded: false }); return; }
    set(scene.id, { state: 'rendering', jobId: started.jobId, credits: started.credits });
    for (let i = 0; i < maxPolls; i += 1) {
      await deps.wait(pollMs);
      let r: DwPollResult;
      try {
        r = await deps.poll(started.jobId);
      } catch {
        continue; // a dropped poll is retried; the render goes on server-side
      }
      if (r.state === 'ready') { set(scene.id, { state: 'done', videoUrl: r.videoUrl }); return; }
      if (r.state === 'failed') { set(scene.id, { state: 'failed', error: r.error, refunded: r.refunded }); return; }
    }
    set(scene.id, { state: 'failed', error: 'timeout', refunded: false });
  };

  const active = new Map<string, Promise<void>>();
  for (;;) {
    // A scene whose source clip will never come is blocked, so nothing is charged for it.
    for (const s of todo) {
      if (runs[s.id]!.state !== 'waiting') continue;
      const dep = sceneDependency(project, s);
      if (dep && sourceClip(dep) === null) set(s.id, { state: 'blocked', error: 'previous_scene_missing' });
    }
    if (!deps.signal?.aborted) {
      for (const s of todo) {
        if (active.size >= concurrency) break;
        if (runs[s.id]!.state !== 'waiting') continue;
        const dep = sceneDependency(project, s);
        const from = dep ? sourceClip(dep) : null;
        if (dep && !from) continue; // still waiting for the scene before it
        const p = renderOne(s, from ?? null).finally(() => active.delete(s.id));
        active.set(s.id, p);
      }
    }
    if (active.size === 0) break;
    await Promise.race(active.values());
  }
  return runs;
}

/** The delivered clips in film order, or null while any scene is not delivered (the final cut needs them all: PR D). */
export function deliveredClips(project: DwProject, runs: Readonly<DwRuns>, prior: Readonly<Record<string, string>> = {}): string[] | null {
  const out: string[] = [];
  for (const s of sorted(project)) {
    const url = runs[s.id]?.state === 'done' ? runs[s.id]!.videoUrl : prior[s.id];
    if (!url) return null;
    out.push(url);
  }
  return out;
}
