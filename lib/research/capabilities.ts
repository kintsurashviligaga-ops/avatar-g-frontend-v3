/**
 * lib/research/capabilities.ts — "is Deep Research available on this deployment?" — answered by PROBING, never assumed.
 *
 * The migration (20261003b) is applied by the owner, later, by hand; the feature must be invisible-but-harmless until then.
 * So availability is the AND of: the opt-out switch (RESEARCH_ENABLED, and a RESEARCH_DAILY_CAP above 0), a Google key, and
 * the `research_jobs` table being there (a `select … limit 1` probe, cached — the pattern of lib/billing/bogSchemaReady).
 * The UI shows an unavailable mode as "opening soon" and routes answer 503 `unavailable`; nothing ever 500s over a missing table.
 */
import { resolveGeminiKey } from '@/lib/orchestrator/gemini-guard';
import { researchLimits, type ResearchLimits } from './limits';
import { researchCredits } from './pricing';

type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type ResearchUnavailableReason = 'disabled' | 'no_key' | 'schema';

export interface ResearchCapabilities {
  available: boolean;
  /** Why not (absent when available). */
  reason?: ResearchUnavailableReason;
  /** What one task costs — the number the composer shows (lib/research/pricing). */
  credits: number;
  /** The Connectors "local files" table exists. */
  filesAvailable: boolean;
  maxActive: number;
}

const probes = new Map<string, { at: number; ready: boolean }>();

/** One cached `select … limit 1` per table: 5 minutes once ready, 30 seconds while not (so applying the migration shows up fast). */
export async function tableReady(db: Db, table: string, now: number = Date.now()): Promise<boolean> {
  const hit = probes.get(table);
  if (hit && now - hit.at < (hit.ready ? 300_000 : 30_000)) return hit.ready;
  let ready = false;
  try {
    const { error } = await db.from(table).select('id').limit(1);
    ready = !error;
  } catch {
    ready = false;
  }
  probes.set(table, { at: now, ready });
  return ready;
}

/** Test hook. */
export function resetResearchSchemaProbe(): void {
  probes.clear();
}

export async function getResearchCapabilities(
  db: Db | null,
  opts: { limits?: ResearchLimits; hasKey?: boolean; now?: number } = {},
): Promise<ResearchCapabilities> {
  const limits = opts.limits ?? researchLimits();
  const base = { credits: researchCredits(), maxActive: limits.maxActive };
  const filesAvailable = db ? await tableReady(db, 'research_context_files', opts.now) : false;
  if (!limits.enabled || limits.globalDaily <= 0) return { ...base, available: false, reason: 'disabled', filesAvailable };
  const hasKey = opts.hasKey ?? !!resolveGeminiKey();
  if (!hasKey) return { ...base, available: false, reason: 'no_key', filesAvailable };
  if (!db || !(await tableReady(db, 'research_jobs', opts.now))) return { ...base, available: false, reason: 'schema', filesAvailable };
  return { ...base, available: true, filesAvailable };
}
