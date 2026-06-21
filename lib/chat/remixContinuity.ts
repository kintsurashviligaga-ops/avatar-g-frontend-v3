/**
 * lib/chat/remixContinuity.ts
 * ===========================
 * PURE continuity-assembly for the Gemini Remix (Unified Master Prompt §6.4).
 *
 * A remix edits only a few scenes of an existing film. The whole point of the
 * shared continuity seed is that the UNTOUCHED scenes are byte-identical to the
 * original — so re-rendering them would be wasteful AND would risk drift. This
 * module assembles the final cut by REUSING the original landed clips for every
 * scene the edit didn't touch and SWAPPING IN the freshly re-rendered clips for
 * the scenes it did, then reports a truthful reused-vs-re-rendered breakdown for
 * the Director's Console.
 *
 * Pure + isomorphic (no providers, no env, no side effects) → unit-testable in
 * isolation; the server executor (`remixComposite.ts`) feeds it the render
 * results and forwards its telemetry.
 */

/** A scene's landed clip from the ORIGINAL film render (ordinal is 1-based). */
export interface SceneClipRef {
  ordinal: number;
  url: string;
}

export type RemixSceneAction =
  | 'reused' // unedited scene → original clip carried over verbatim (continuity)
  | 'rerendered' // edited scene → a new clip was produced
  | 'rerender-pending'; // edited scene → re-render was gated/failed (no new clip)

export interface RemixSceneOutcome {
  ordinal: number;
  action: RemixSceneAction;
  /** reused → original url; rerendered → new url; pending → undefined. */
  url?: string;
  /** The shared continuity seed (same across all scenes) — surfaced for telemetry. */
  seed?: number;
}

export interface ContinuityCut {
  scenes: RemixSceneOutcome[];
  /** Unedited scenes whose original clip was reused (continuity preserved). */
  reused: number;
  /** Edited scenes that produced a fresh clip. */
  rerendered: number;
  /** Edited scenes whose re-render was gated/failed (no fresh clip). */
  pending: number;
  total: number;
}

export interface AssembleParams {
  sceneCount: number;
  /** Ordinals (1-based) the edit targeted. */
  editedOrdinals: Iterable<number>;
  /** Original film's landed clips, keyed by ordinal — reused for unedited scenes. */
  originalClips?: SceneClipRef[];
  /** Freshly re-rendered clips from this remix turn (ordinal → url). */
  rerendered?: Map<number, string>;
  /** Per-scene continuity seed (ordinal → seed), for telemetry. */
  seeds?: Map<number, number>;
}

/**
 * Build the final continuity cut. For every scene 1..sceneCount: reuse the
 * original clip if the edit didn't touch it, otherwise take the re-rendered clip
 * (or mark it pending when the render leg was gated/failed).
 */
export function assembleContinuityCut(params: AssembleParams): ContinuityCut {
  const edited = new Set<number>([...params.editedOrdinals]);
  const originalByOrdinal = new Map((params.originalClips ?? []).map((c) => [c.ordinal, c.url] as const));
  const rerendered = params.rerendered ?? new Map<number, string>();
  const seeds = params.seeds ?? new Map<number, number>();

  const scenes: RemixSceneOutcome[] = [];
  let reusedCount = 0;
  let rerenderedCount = 0;
  let pendingCount = 0;

  for (let ordinal = 1; ordinal <= params.sceneCount; ordinal += 1) {
    const seed = seeds.get(ordinal);
    if (edited.has(ordinal)) {
      const url = rerendered.get(ordinal);
      if (url) {
        scenes.push({ ordinal, action: 'rerendered', url, seed });
        rerenderedCount += 1;
      } else {
        scenes.push({ ordinal, action: 'rerender-pending', seed });
        pendingCount += 1;
      }
    } else {
      const url = originalByOrdinal.get(ordinal);
      scenes.push({ ordinal, action: 'reused', url, seed });
      reusedCount += 1;
    }
  }

  return { scenes, reused: reusedCount, rerendered: rerenderedCount, pending: pendingCount, total: params.sceneCount };
}

/** One-line human summary of a continuity cut for the Montage telemetry node. */
export function summarizeContinuity(cut: ContinuityCut): string {
  const parts = [`${cut.rerendered} re-rendered`, `${cut.reused} reused`];
  if (cut.pending > 0) parts.push(`${cut.pending} pending`);
  return `Re-stitched ${cut.total} scenes — ${parts.join(', ')} (continuity held)`;
}

/** Ordinals whose original clip was carried over verbatim. */
export function reusedOrdinals(cut: ContinuityCut): number[] {
  return cut.scenes.filter((s) => s.action === 'reused').map((s) => s.ordinal);
}
