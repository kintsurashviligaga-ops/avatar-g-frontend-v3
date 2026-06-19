// Master Prompt §6.3 — Vision QA gate INTEGRATED into the existing film pipeline (not a
// parallel rebuild). Inspects each storyboard keyframe — the identity anchor the clip
// animates FROM — for severe artifacts/face-melting, and regenerates failures via the
// caller's own frame-gen path. Fail-OPEN per scene + a structured report for logging.
import 'server-only';
import { VisionQualityGate } from './vision-gate';

export interface SceneQaEntry {
  scene: number;
  passed: boolean;
  attempts: number;
  reason?: string;
}

/** Env flag — ships OFF. Set FILM_VISION_QA=1 to enable the keyframe QA heal pass. */
export function visionQaEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FILM_VISION_QA === '1';
}

/**
 * Inspect each keyframe with Claude Vision; on a severe-defect verdict, regenerate that
 * frame via `regen(sceneIndex)` (best-effort, up to maxAttempts). Fail-OPEN per scene: a
 * QA-infra miss or a failed regen keeps the current frame so QA can never block delivery.
 * Returns the healed frames + a per-scene report (§15 fallback logging).
 */
export async function qaHealKeyframes(
  frames: (string | null)[],
  regen: (sceneIndex: number) => Promise<string | null>,
  maxAttempts = 2,
): Promise<{ frames: (string | null)[]; report: SceneQaEntry[] }> {
  const gate = new VisionQualityGate();
  const report: SceneQaEntry[] = [];
  const healed = await Promise.all(
    frames.map(async (frame, i) => {
      if (!frame) {
        report.push({ scene: i + 1, passed: false, attempts: 0, reason: 'no-frame' });
        return frame;
      }
      let current = frame;
      for (let attempt = 0; ; attempt++) {
        const verdict = await gate.inspectFrame(current);
        if (verdict.passed || attempt >= maxAttempts) {
          report.push({ scene: i + 1, passed: verdict.passed, attempts: attempt, reason: verdict.reason });
          return current;
        }
        const next = await regen(i).catch(() => null);
        if (!next) {
          report.push({ scene: i + 1, passed: false, attempts: attempt + 1, reason: 'regen-failed' });
          return current;
        }
        current = next;
      }
    }),
  );
  return { frames: healed, report };
}
