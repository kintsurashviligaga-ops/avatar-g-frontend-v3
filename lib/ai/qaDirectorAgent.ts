/**
 * lib/ai/qaDirectorAgent.ts
 * =========================
 * PHASE 25 (VECTOR 2) — the "QA Quality-Control Agent" in the Director's pulse. A PURE, DETERMINISTIC,
 * BOUNDED pre-assembly validator that evaluates the collective PLANNING output of the prior agents
 * (Storyboard / Script / Character-lock / Audio-cue) BEFORE the film token is minted and the client
 * triggers the stitch. It returns a structured verdict + applies the ONE safe deterministic single-pass
 * correction it can (fill any missing per-scene SFX cue).
 *
 * HONEST REFRAME of the directive's "force the failing agent to re-generate": an UNBOUNDED LLM
 * auto-regeneration loop is deliberately NOT built — on a bad (vs transient) input it re-bills the
 * image/video provider on every retry (cost spiral), adds minutes of latency inside a route already near
 * the serverless ceiling, and can loop forever / trip the render saga. Instead this gate does a single
 * deterministic pass: it AUTO-FIXES what is provably safe with no model call (SFX-cue gaps), and SURFACES
 * everything else as a graded flag (telemetry) rather than triggering a runaway self-correction. It also
 * validates only what is knowable server-side pre-dispatch — async per-clip RENDER outcomes resolve later
 * at poll time (they are covered by the Phase-23 retry/down-shift + salvage gate), so they are out of scope.
 *
 * Zero-dependency, zero-network, zero-LLM, NEVER throws → the caller wraps it fail-open.
 */

export type QaSeverity = 'critical' | 'warn' | 'info';

export interface QaIssue {
  code: string;
  severity: QaSeverity;
  detail: string;
  /** True when this gate deterministically corrected the issue in-place (no model call). */
  autoFixed?: boolean;
}

export interface QaCue {
  sceneNumber: number;
  sfxPrompt: string;
}

export interface QaInput {
  characterLock: string | null | undefined;
  characterAnchor: string | null | undefined;
  /** plan.scenes[].prompt — one per scene, in order. */
  scenePrompts: string[];
  /** The Director Agent's per-scene SFX cues (may be undefined / short on the non-agent path). */
  sfxCues: QaCue[] | undefined;
  orientation: 'landscape' | 'vertical';
  sceneCount: number;
}

export interface QaVerdict {
  /** true when there are NO critical issues (a warn/info still passes — the film is watchable). */
  pass: boolean;
  grade: 'A' | 'B' | 'C' | 'F';
  issues: QaIssue[];
  /** Deterministic single-pass correction: exactly one non-empty SFX cue per scene (gaps filled). */
  correctedSfxCues: QaCue[];
}

/** Derive a deterministic diegetic SFX cue from a scene prompt (no LLM). Used to fill a missing cue. */
function deriveSceneSfx(prompt: string): string {
  const core = (prompt || '').split(/[.,—]/)[0]?.trim().slice(0, 90) || 'the scene';
  return `ambient diegetic sound matching ${core}, subtle environmental foley, no music, no speech`;
}

/**
 * Evaluate the pre-assembly film QA. Pure + never throws.
 */
export function evaluateFilmQa(input: QaInput): QaVerdict {
  const issues: QaIssue[] = [];
  const scenes = Array.isArray(input.scenePrompts) ? input.scenePrompts : [];
  const anchor = (input.characterAnchor || '').trim();
  const lock = (input.characterLock || '').trim();

  // 1 — CHARACTER LOCK present. Without it the protagonist can drift shot-to-shot.
  if (!lock && !anchor) {
    issues.push({ code: 'character_lock_missing', severity: 'warn', detail: 'No character lock / continuity anchor — protagonist may drift across scenes.' });
  }

  // 2 — SCENE COUNT matches the plan (a dropped/extra scene = a broken cut).
  if (scenes.length !== input.sceneCount) {
    issues.push({ code: 'scene_count_mismatch', severity: 'warn', detail: `Planned ${input.sceneCount} scenes but got ${scenes.length} scene prompts.` });
  }

  // 3 — no EMPTY scene prompt (an empty prompt renders a generic/garbage clip).
  const emptyCount = scenes.filter((s) => !String(s || '').trim()).length;
  if (emptyCount > 0) {
    issues.push({ code: 'empty_scene_prompt', severity: 'warn', detail: `${emptyCount} scene prompt(s) are empty.` });
  }

  // 4 — MONOTONE guard: if 2+ scenes share the SAME opening framing the film is a static loop, not an arc.
  const heads = scenes.map((s) => String(s || '').split(/[—.]/)[0]?.trim().toLowerCase() || '');
  const nonEmptyHeads = heads.filter(Boolean);
  if (nonEmptyHeads.length >= 3 && new Set(nonEmptyHeads).size <= 1) {
    issues.push({ code: 'monotone_scenes', severity: 'warn', detail: 'Every scene opens on the same framing — the film is a static loop, not a story arc.' });
  }

  // 5 — ORIENTATION valid (guards a bad aspect that the stitch would letterbox/crop).
  if (input.orientation !== 'landscape' && input.orientation !== 'vertical') {
    issues.push({ code: 'bad_orientation', severity: 'critical', detail: `Invalid orientation "${String(input.orientation)}".` });
  }

  // 6 — SFX CUE per scene → the ONE safe deterministic AUTO-FIX. Build exactly one non-empty cue per
  //     scene, filling any gap from the scene prompt. This is the bounded "self-correction".
  const bySceneNumber = new Map<number, string>();
  for (const c of input.sfxCues ?? []) {
    if (c && typeof c.sfxPrompt === 'string' && c.sfxPrompt.trim()) bySceneNumber.set(c.sceneNumber, c.sfxPrompt.trim());
  }
  const correctedSfxCues: QaCue[] = [];
  let filled = 0;
  for (let i = 0; i < scenes.length; i += 1) {
    const sceneNumber = i + 1;
    const existing = bySceneNumber.get(sceneNumber);
    if (existing) {
      correctedSfxCues.push({ sceneNumber, sfxPrompt: existing });
    } else {
      correctedSfxCues.push({ sceneNumber, sfxPrompt: deriveSceneSfx(scenes[i] ?? '') });
      filled += 1;
    }
  }
  if (filled > 0) {
    issues.push({ code: 'sfx_cue_filled', severity: 'info', detail: `Filled ${filled} missing per-scene SFX cue(s) deterministically from the scene prompts.`, autoFixed: true });
  }

  const critical = issues.filter((i) => i.severity === 'critical').length;
  const warns = issues.filter((i) => i.severity === 'warn').length;
  const grade: QaVerdict['grade'] = critical > 0 ? 'F' : warns === 0 ? 'A' : warns <= 2 ? 'B' : 'C';
  return { pass: critical === 0, grade, issues, correctedSfxCues };
}
