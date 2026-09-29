/**
 * OUR model catalogue (brief §4 `registry.ts`, §5). The studio UI and Agent G only ever see these ids.
 *
 * Every entry carries what the brief asks of it: a Georgian label and one-line description, a tier and a
 * fallback. Fallbacks are only ever to a model of the SAME `family` — same input schema — because a fallback
 * resubmits the user's exact parameters; Seedance and Kling take different parameters, so they never stand
 * in for each other automatically.
 *
 * Which models are live is decided per deployment, not here: `HF_ENABLED_MODELS` (comma-separated ids)
 * narrows the set to what GG's Higgsfield account actually has (brief: "enable only what is available").
 * Unset → every registered model.
 */
import type { z } from 'zod';
import {
  HF_ENDPOINTS,
  genjutsuMotionInput,
  klingI2vInput,
  klingMotionInput,
  klingT2vInput,
  seedanceR2vInput,
  seedanceT2vInput,
  soul2Input,
} from '@/lib/providers/higgsfield/models';
import { videoTokensUsd } from '@/lib/providers/higgsfield/tokenPricing';
import type { ModelTier, OutputKind, ProviderId, StudioService } from '@/lib/providers/types';

export type ModelMode = 'text-to-image' | 'text-to-video' | 'image-to-video' | 'reference-to-video' | 'motion-transfer';

export interface ModelEntry {
  /** Stable id used by the UI, Agent G, the DB and the ledger refs. Never rename one that has shipped. */
  id: string;
  provider: ProviderId;
  endpoint: string;
  service: StudioService;
  mode: ModelMode;
  /** Schema-compatible group. Fallbacks never leave it. */
  family: string;
  label_ka: string;
  description_ka: string;
  label_en: string;
  tier: ModelTier;
  output: OutputKind;
  /** Tried in order when this model is unavailable (404/423/503), only within `family`. */
  fallback: string[];
  input: z.ZodTypeAny;
  /** 'page' = the workflow's own doc page was read; 'family' = a sibling's page — the smoke test confirms it. */
  schema: 'page' | 'family';
  /** Application deadline for one request of this model (polling / reconciliation). */
  timeoutMs: number;
  /**
   * Local price for a model the provider only DESCRIBES (no numeric estimate) — USD from the validated input
   * and the provider's pricing text. Absent → such a model cannot be priced and is refused (D5).
   */
  priceUsd?: (input: Record<string, unknown>, pricingDescription: string | null) => number | null;
}

const MIN = 60_000;

export const MODELS: readonly ModelEntry[] = [
  {
    id: 'hf/soul-2',
    provider: 'higgsfield',
    endpoint: HF_ENDPOINTS.soul2,
    service: 'image',
    mode: 'text-to-image',
    family: 'soul-2',
    label_ka: 'Soul 2 — ფოტორეალისტური სურათი',
    description_ka: 'პორტრეტი, მოდა და რედაქციული ფოტო ბუნებრივი სინათლით.',
    label_en: 'Soul 2 — photoreal image',
    tier: 'standard',
    output: 'images',
    fallback: [],
    input: soul2Input,
    schema: 'page',
    timeoutMs: 10 * MIN,
  },
  {
    id: 'hf/kling-3-std-t2v',
    provider: 'higgsfield',
    endpoint: HF_ENDPOINTS.kling3StdT2v,
    service: 'video',
    mode: 'text-to-video',
    family: 'kling-3-t2v',
    label_ka: 'Kling 3 — ვიდეო ტექსტიდან',
    description_ka: 'კინემატოგრაფიული კადრი 3–15 წამი, ხმით ან უხმოდ.',
    label_en: 'Kling 3 — text to video',
    tier: 'standard',
    output: 'video',
    fallback: [],
    input: klingT2vInput,
    schema: 'page',
    timeoutMs: 20 * MIN,
  },
  {
    id: 'hf/kling-3-pro-t2v',
    provider: 'higgsfield',
    endpoint: HF_ENDPOINTS.kling3ProT2v,
    service: 'video',
    mode: 'text-to-video',
    family: 'kling-3-t2v',
    label_ka: 'Kling 3 Pro — ვიდეო ტექსტიდან',
    description_ka: 'უმაღლესი ხარისხის კადრი რთული მოძრაობისთვის.',
    label_en: 'Kling 3 Pro — text to video',
    tier: 'pro',
    output: 'video',
    fallback: ['hf/kling-3-std-t2v'],
    input: klingT2vInput,
    schema: 'family',
    timeoutMs: 25 * MIN,
  },
  {
    id: 'hf/kling-3-std-i2v',
    provider: 'higgsfield',
    endpoint: HF_ENDPOINTS.kling3StdI2v,
    service: 'video',
    mode: 'image-to-video',
    family: 'kling-3-i2v',
    label_ka: 'Kling 3 — ფოტოს გაცოცხლება',
    description_ka: 'შენი ფოტო ხდება პირველი კადრი; სურვილისამებრ — ბოლოც.',
    label_en: 'Kling 3 — image to video',
    tier: 'standard',
    output: 'video',
    fallback: [],
    input: klingI2vInput,
    schema: 'page',
    timeoutMs: 20 * MIN,
  },
  {
    id: 'hf/kling-3-pro-i2v',
    provider: 'higgsfield',
    endpoint: HF_ENDPOINTS.kling3ProI2v,
    service: 'video',
    mode: 'image-to-video',
    family: 'kling-3-i2v',
    label_ka: 'Kling 3 Pro — ფოტოს გაცოცხლება',
    description_ka: 'ფოტოდან ვიდეო უფრო ზუსტი დეტალებითა და მოძრაობით.',
    label_en: 'Kling 3 Pro — image to video',
    tier: 'pro',
    output: 'video',
    fallback: ['hf/kling-3-std-i2v'],
    input: klingI2vInput,
    schema: 'family',
    timeoutMs: 25 * MIN,
  },
  {
    id: 'hf/seedance-2.5-t2v',
    provider: 'higgsfield',
    endpoint: HF_ENDPOINTS.seedance25T2v,
    service: 'video',
    mode: 'text-to-video',
    family: 'seedance-2.5-t2v',
    label_ka: 'Seedance 2.5 — სწრაფი ვიდეო',
    description_ka: 'სწრაფი ვიდეო 4–30 წამამდე, ექვსი კადრის ფორმატით.',
    label_en: 'Seedance 2.5 — fast video',
    tier: 'fast',
    output: 'video',
    fallback: [],
    input: seedanceT2vInput,
    schema: 'page',
    timeoutMs: 20 * MIN,
    priceUsd: videoTokensUsd,
  },
  {
    id: 'hf/seedance-2.5-r2v',
    provider: 'higgsfield',
    endpoint: HF_ENDPOINTS.seedance25R2v,
    service: 'video',
    mode: 'reference-to-video',
    family: 'seedance-2.5-r2v',
    label_ka: 'Seedance 2.5 — ვიდეო რეფერენსებით',
    description_ka: 'ფოტოები ან ხმა როგორც ნიმუში — ერთი თანმიმდევრული კადრი.',
    label_en: 'Seedance 2.5 — reference to video',
    tier: 'standard',
    output: 'video',
    fallback: [],
    input: seedanceR2vInput,
    schema: 'page',
    timeoutMs: 20 * MIN,
    priceUsd: videoTokensUsd,
  },
  {
    id: 'hf/kling-3-motion-std',
    provider: 'higgsfield',
    endpoint: HF_ENDPOINTS.kling3McStd,
    service: 'motion',
    mode: 'motion-transfer',
    family: 'kling-3-motion',
    label_ka: 'Kling 3 Motion Control — მოძრაობის გადატანა',
    description_ka: 'ვიდეოს მოძრაობა (3–30 წამი) გადადის შენს ფოტოზე.',
    label_en: 'Kling 3 Motion Control',
    tier: 'standard',
    output: 'video',
    fallback: [],
    input: klingMotionInput,
    schema: 'page',
    timeoutMs: 30 * MIN,
  },
  {
    id: 'hf/kling-3-motion-pro',
    provider: 'higgsfield',
    endpoint: HF_ENDPOINTS.kling3McPro,
    service: 'motion',
    mode: 'motion-transfer',
    family: 'kling-3-motion',
    label_ka: 'Kling 3 Motion Control Pro — ზუსტი მოძრაობა',
    description_ka: 'მოძრაობის გადატანა მაღალი სიზუსტით და დეტალებით.',
    label_en: 'Kling 3 Motion Control Pro',
    tier: 'pro',
    output: 'video',
    fallback: ['hf/kling-3-motion-std'],
    input: klingMotionInput,
    schema: 'family',
    timeoutMs: 30 * MIN,
  },
  {
    id: 'hf/genjutsu-motion',
    provider: 'higgsfield',
    endpoint: HF_ENDPOINTS.genjutsuMotion,
    service: 'motion',
    mode: 'motion-transfer',
    family: 'genjutsu-motion',
    label_ka: 'Genjutsu — მოძრაობის გადატანა',
    description_ka: 'მოძრაობა ვიდეოდან (მინ. 4 წამი) ერთ ან რამდენიმე ფოტოზე.',
    label_en: 'Genjutsu — motion transfer',
    tier: 'standard',
    output: 'video',
    fallback: [],
    input: genjutsuMotionInput,
    schema: 'page',
    timeoutMs: 30 * MIN,
  },
];

const BY_ID = new Map(MODELS.map((m) => [m.id, m]));

/** The ids this deployment may use (HF_ENABLED_MODELS), or null = all registered. */
function enabledIds(env: NodeJS.ProcessEnv): Set<string> | null {
  const raw = (env.HF_ENABLED_MODELS ?? '').trim();
  if (!raw) return null;
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

export function getModel(id: string): ModelEntry | null {
  return BY_ID.get(id) ?? null;
}

export function isModelEnabled(id: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!BY_ID.has(id)) return false;
  const allow = enabledIds(env);
  return allow === null || allow.has(id);
}

export function listModels(opts: { service?: StudioService; env?: NodeJS.ProcessEnv } = {}): ModelEntry[] {
  const env = opts.env ?? process.env;
  return MODELS.filter((m) => isModelEnabled(m.id, env) && (!opts.service || m.service === opts.service));
}

/** Enabled, same-family fallbacks of `id`, in the declared order. */
export function fallbacksFor(id: string, env: NodeJS.ProcessEnv = process.env): ModelEntry[] {
  const m = BY_ID.get(id);
  if (!m) return [];
  return m.fallback
    .map((f) => BY_ID.get(f))
    .filter((f): f is ModelEntry => !!f && f.family === m.family && isModelEnabled(f.id, env));
}

export type ParsedInput =
  | { ok: true; input: Record<string, unknown> }
  | { ok: false; issues: Array<{ path: string; message: string }> };

/** Validate raw user params against the model's documented schema (defaults applied, unknown keys refused). */
export function parseModelInput(model: ModelEntry, raw: unknown): ParsedInput {
  const r = model.input.safeParse(raw ?? {});
  if (r.success) return { ok: true, input: r.data as Record<string, unknown> };
  return {
    ok: false,
    issues: r.error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.') || '(root)', message: i.message })),
  };
}

/** The public, UI-safe view of a model (no endpoint, no schema object). */
export function publicModel(m: ModelEntry) {
  return { id: m.id, service: m.service, mode: m.mode, label_ka: m.label_ka, description_ka: m.description_ka, label_en: m.label_en, tier: m.tier, output: m.output };
}
