/**
 * Google model lifecycle registry, v1 (v5.1 Phase 2, migration M-1; design: docs/v5.1-phase1/04 §5).
 *
 * The 3.6 Flash retirement was found by hand one week before Vertex shut it down (2026-11-12). This module makes that
 * a build failure instead: `config/google-lifecycle.json` holds the dates from Google's official pages, `servedModels()`
 * lists what the code serves by default, and lifecycle.test.ts fails CI when a served model retires within
 * `rules.ciBlockDays` (21) days, or when the code serves a model the file does not know.
 *
 * Alarm levels follow Google's own notice rule (dates move later, never earlier; short-term models get ≥ 45 days):
 *   retired  — the date has passed
 *   block    — ≤ 21 days: CI is red until the default moves
 *   urgent   — ≤ 7 days is inside block; kept for the admin page wording
 *   warn     — ≤ 45 days: plan the migration
 *   ok       — a date further out
 *   none     — Google lists the model with no retirement date
 *   unknown  — the model is on no official table: probe it, never assume it is safe
 *
 * v1 is read-only data plus a guard. The DB overlay (`capability_state`, owner kill switch) and the daily sync job
 * are later steps that need their own approval.
 */
import registry from '../../config/google-lifecycle.json';
import {
  CHIRP_STT_MODEL,
  DEFAULT_CHAT_MODELS,
  DEFAULT_LIVE_MODEL,
  DEFAULT_REST_TIER_MODELS,
  DEFAULT_STT_MODEL,
  DEFAULT_TTS_MODEL,
} from '../ai/google/models';
import { IMAGE_LIFECYCLE_REPLACEMENT } from '../image/lifecycle';
import { VERTEX_VEO_MODEL_IDS } from '../veo/capabilities';

export type LifecycleStage = 'GA' | 'PREVIEW' | 'EXPERIMENTAL' | 'RETIRED' | 'UNKNOWN';
export type LifecycleLevel = 'retired' | 'block' | 'urgent' | 'warn' | 'ok' | 'none' | 'unknown';

export type LifecycleEntry = {
  id: string;
  aliases?: string[];
  stage: LifecycleStage;
  releaseDate?: string;
  /** ISO date. null = Google lists the model with no date; absent = on no official table (unknown). */
  retirementDate?: string | null;
  replacement?: string;
  source: string;
  served: string[];
  /** The id is served from a file other than lib/ai/google/models (Photo, Video), so the guard takes it from here. */
  servedOutsideModelsTs?: boolean;
  note?: string;
};

export type LifecycleRegistry = {
  version: string;
  rules: { ciBlockDays: number; urgentDays: number; warnDays: number; [k: string]: unknown };
  sources: Record<string, { url: string; fetchedAt: string; pageUpdated?: string }>;
  models: LifecycleEntry[];
};

export const LIFECYCLE: LifecycleRegistry = registry as LifecycleRegistry;

const DAY_MS = 86_400_000;

function bare(id: string): string {
  return id.trim().replace(/^models\//i, '').toLowerCase();
}

/** The entry for a model id or one of its aliases (a `models/` prefix is ignored), or null. */
export function lifecycleEntry(id: string, reg: LifecycleRegistry = LIFECYCLE): LifecycleEntry | null {
  const want = bare(id);
  return reg.models.find((m) => bare(m.id) === want || (m.aliases ?? []).some((a) => bare(a) === want)) ?? null;
}

/** Whole days from `now` (UTC) to the retirement date; negative once it has passed. null when there is no date. */
export function daysUntilRetirement(entry: LifecycleEntry, now: Date = new Date()): number | null {
  if (!entry.retirementDate) return null;
  const end = Date.parse(`${entry.retirementDate}T00:00:00Z`);
  if (Number.isNaN(end)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((end - today) / DAY_MS);
}

export function lifecycleLevel(entry: LifecycleEntry | null, now: Date = new Date(), reg: LifecycleRegistry = LIFECYCLE): LifecycleLevel {
  if (!entry) return 'unknown';
  if (entry.stage === 'RETIRED') return 'retired';
  if (entry.retirementDate === undefined) return 'unknown';
  if (entry.retirementDate === null) return 'none';
  const days = daysUntilRetirement(entry, now);
  if (days === null) return 'unknown';
  if (days <= 0) return 'retired';
  if (days <= reg.rules.urgentDays) return 'urgent';
  if (days <= reg.rules.ciBlockDays) return 'block';
  if (days <= reg.rules.warnDays) return 'warn';
  return 'ok';
}

/**
 * The model ids the code serves by default: every chat chain, the REST tiers, Live, read-aloud, the mic's Gemini
 * default and Chirp, Photo and the Vertex Veo tiers, plus each registry entry marked `servedOutsideModelsTs` (ids in server-only
 * files such as lib/video/omniClip, which a build-time module cannot import). Env overrides are not included: they are read at runtime, not built.
 */
export function servedModels(reg: LifecycleRegistry = LIFECYCLE): string[] {
  const fromCode = [
    ...DEFAULT_CHAT_MODELS.standard,
    ...DEFAULT_CHAT_MODELS.pro,
    ...DEFAULT_CHAT_MODELS.lite,
    DEFAULT_REST_TIER_MODELS.pro,
    DEFAULT_REST_TIER_MODELS.flash,
    DEFAULT_LIVE_MODEL,
    DEFAULT_TTS_MODEL,
    DEFAULT_STT_MODEL,
    CHIRP_STT_MODEL,
    IMAGE_LIFECYCLE_REPLACEMENT,
    ...VERTEX_VEO_MODEL_IDS,
  ];
  const fromRegistry = reg.models.filter((m) => m.servedOutsideModelsTs).map((m) => m.id);
  return [...new Set([...fromCode, ...fromRegistry].map(bare))];
}

export type LifecycleFinding = {
  id: string;
  level: LifecycleLevel;
  retirementDate: string | null;
  daysLeft: number | null;
  replacement: string | null;
  served: string[];
  source: string | null;
};

/** One row per served model, worst first. */
export function lifecycleReport(now: Date = new Date(), reg: LifecycleRegistry = LIFECYCLE): LifecycleFinding[] {
  const order: LifecycleLevel[] = ['retired', 'urgent', 'block', 'warn', 'unknown', 'none', 'ok'];
  return servedModels(reg)
    .map((id) => {
      const e = lifecycleEntry(id, reg);
      return {
        id,
        level: lifecycleLevel(e, now, reg),
        retirementDate: e?.retirementDate ?? null,
        daysLeft: e ? daysUntilRetirement(e, now) : null,
        replacement: e?.replacement ?? null,
        served: e?.served ?? [],
        source: e ? reg.sources[e.source]?.url ?? null : null,
      };
    })
    .sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
}

/**
 * What must stop the build: a served model the registry does not know (add it, with its official source), or one that
 * retires within `ciBlockDays`. A model on no official table (`unknown`) is allowed when it IS in the file, because its
 * entry records that nobody has published a date; the admin page shows it so it gets probed.
 */
export function lifecycleBlockers(now: Date = new Date(), reg: LifecycleRegistry = LIFECYCLE): string[] {
  return lifecycleReport(now, reg).flatMap((f) => {
    if (!lifecycleEntry(f.id, reg)) return [`${f.id}: served but missing from config/google-lifecycle.json`];
    if (f.level === 'retired' || f.level === 'urgent' || f.level === 'block') {
      const to = f.replacement ? `; move to ${f.replacement}` : '';
      return [`${f.id}: retires ${f.retirementDate} (${f.daysLeft} days left)${to}`];
    }
    return [];
  });
}
