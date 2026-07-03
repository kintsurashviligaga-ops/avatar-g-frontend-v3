/**
 * Agent optimizer — pure analysis (STEP 5, self-improving loop, part 2).
 *
 * Turns raw agent_execution_feedback into PROPOSALS a human reviews. The cardinal rule:
 * LOG-THEN-PROPOSE, NEVER AUTO-MUTATE. Nothing here (or in the runner) edits a prompt, swaps a
 * model, or changes a config — every output carries status:'proposed' and waits for an admin.
 * This module is pure → the invariant is unit-tested with no DB.
 *
 * Signal model: what a user DOES with a generation is implicit feedback. Sharing/downloading =
 * good; discarding = bad; editing = "close but needed fixing".
 */

export interface FeedbackRow {
  agent_type: string;
  action: string; // download | edit | share | remix | discard
  model?: string | null;
  success?: boolean | null;
}

export const ACTION_SIGNAL: Record<string, number> = {
  share: 1,
  download: 0.8,
  remix: 0.4,
  edit: -0.2,
  discard: -1,
};

export interface AgentSignal {
  agentType: string;
  model: string | null;
  samples: number;
  score: number; // mean action signal in [-1, 1]
  positiveRate: number; // share|download|remix
  discardRate: number;
  editRate: number;
}

export type ProposalKind = 'revise_prompt' | 'switch_model' | 'investigate';
export type ProposalPriority = 'high' | 'medium' | 'low';

export interface OptimizationProposal {
  agentType: string;
  model: string | null;
  kind: ProposalKind;
  priority: ProposalPriority;
  rationale: string;
  evidence: { samples: number; score: number; discardRate: number; editRate: number };
  /** INVARIANT: always 'proposed'. A proposal is never self-applied — an admin decides. */
  status: 'proposed';
  /** CONCRETE change promoted on approval (STEP 5 self-improving). A DIAGNOSTIC-only proposal
   *  (e.g. 'investigate') leaves both null → approving it is acknowledged but never promotes an
   *  empty config (see configVersioning.hasConcreteChange). */
  proposedParams: Record<string, unknown> | null;
  proposedPrompt: string | null;
}

export const DEFAULT_MIN_SAMPLES = 12;

const round = (n: number) => Math.round(n * 100) / 100;

// CONCRETE, deterministic prompt directives attached to a proposal so approving it promotes a REAL
// agent_configs version (a quality directive applied as a prompt SUFFIX by getActiveConfig
// consumers) — never an empty change. Keyed by agent_type so the steer is modality-appropriate.
const QUALITY_DIRECTIVE: Record<string, string> = {
  image: 'Prioritize sharp focus, correct anatomy and proportions, accurate hands and legible text, with zero artifacts or extra limbs.',
  video: 'Prioritize smooth natural motion, a consistent character across shots, and no warping, flicker, or morphing.',
  audio: 'Prioritize a clean mix, correct pronunciation, natural pacing, and no clipping or artifacts.',
  script: 'Prioritize a tight structure, concrete specifics over generalities, and natural human dialogue.',
};
const REVISE_DIRECTIVE: Record<string, string> = {
  image: 'Bake in what users most often fix: correct anatomy, clean edges, accurate text, and balanced composition.',
  video: 'Bake in what users most often fix: shot-to-shot consistency, stable framing, and accurate motion timing.',
  audio: 'Bake in what users most often fix: clearer diction, better pacing, and consistent loudness.',
  script: 'Bake in what users most often fix: sharper hooks, concrete detail, and on-brand tone.',
};
/** Modality-appropriate directive, defaulting to the image steer for an unknown agent_type. */
export const directiveFor = (map: Record<string, string>, agentType: string): string => map[agentType] ?? map.image!;
export { QUALITY_DIRECTIVE, REVISE_DIRECTIVE };

/** Group feedback by (agent_type, model) and compute signal rates. Pure. */
export function aggregateSignals(rows: FeedbackRow[]): AgentSignal[] {
  const groups = new Map<string, FeedbackRow[]>();
  for (const r of rows) {
    if (!r || typeof r.agent_type !== 'string' || typeof r.action !== 'string') continue;
    const key = `${r.agent_type}::${r.model ?? ''}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  const out: AgentSignal[] = [];
  for (const [key, rs] of groups) {
    const [agentType, modelRaw] = key.split('::');
    const n = rs.length;
    let sum = 0, pos = 0, discard = 0, edit = 0;
    for (const r of rs) {
      sum += ACTION_SIGNAL[r.action] ?? 0;
      if (r.action === 'share' || r.action === 'download' || r.action === 'remix') pos++;
      else if (r.action === 'discard') discard++;
      else if (r.action === 'edit') edit++;
    }
    out.push({
      agentType: agentType ?? '',
      model: modelRaw ? modelRaw : null,
      samples: n,
      score: round(sum / n),
      positiveRate: round(pos / n),
      discardRate: round(discard / n),
      editRate: round(edit / n),
    });
  }
  // Worst first — reviewers see the biggest problems on top.
  return out.sort((a, b) => a.score - b.score);
}

/**
 * Emit review proposals for under-performing (agent, model) pairs. Only acts above minSamples
 * (never on noise), and NEVER for healthy agents. Every proposal is status:'proposed'.
 */
export function proposeOptimizations(signals: AgentSignal[], opts?: { minSamples?: number }): OptimizationProposal[] {
  const min = opts?.minSamples ?? DEFAULT_MIN_SAMPLES;
  const out: OptimizationProposal[] = [];
  for (const s of signals) {
    if (s.samples < min) continue; // insufficient evidence — stay silent
    const evidence = { samples: s.samples, score: s.score, discardRate: s.discardRate, editRate: s.editRate };
    if (s.discardRate >= 0.5) {
      out.push({ agentType: s.agentType, model: s.model, kind: s.model ? 'switch_model' : 'revise_prompt', priority: 'high', rationale: `Users discard ${Math.round(s.discardRate * 100)}% of outputs — the current ${s.model ? 'model/prompt' : 'prompt'} is under-delivering. Review before it costs more credits.`, evidence, status: 'proposed', proposedParams: null, proposedPrompt: directiveFor(QUALITY_DIRECTIVE, s.agentType) });
    } else if (s.score < 0) {
      // 'investigate' is DIAGNOSTIC — no concrete change (approving it is acknowledged, not promoted).
      out.push({ agentType: s.agentType, model: s.model, kind: 'investigate', priority: 'medium', rationale: `Net-negative signal (score ${s.score}). Interactions lean toward discard/edit over share/download.`, evidence, status: 'proposed', proposedParams: null, proposedPrompt: null });
    } else if (s.editRate >= 0.4) {
      out.push({ agentType: s.agentType, model: s.model, kind: 'revise_prompt', priority: 'low', rationale: `${Math.round(s.editRate * 100)}% of outputs are edited before use — close, but the prompt could bake in what users keep fixing.`, evidence, status: 'proposed', proposedParams: null, proposedPrompt: directiveFor(REVISE_DIRECTIVE, s.agentType) });
    }
    // healthy agents (positive score, low discard/edit) → intentionally no proposal
  }
  return out;
}
