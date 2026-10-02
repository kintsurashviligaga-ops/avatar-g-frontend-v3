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
 * Unset → every registered model — except one whose schema is `unverified`, which runs only when named.
 *
 * The NAMES (Georgian label, one line, English label) live in lib/providers/catalogue.ts — the list every model picker
 * reads, Higgsfield or not — and are copied in here by id, so a picker and Agent G can never call a model two things.
 */
import type { z } from 'zod';
import {
  HF_ENDPOINTS,
  genjutsuMotionInput,
  grokImage2Input,
  ideogram4Input,
  klingI2vInput,
  klingMotionInput,
  klingT2vInput,
  klingTurboI2vInput,
  klingTurboT2vInput,
  marketingStudioImageInput,
  qwenImage3T2iInput,
  recraftV41Input,
  seedanceI2vInput,
  seedanceR2vInput,
  seedanceT2vInput,
  soul2Input,
  soulCinemaInput,
  soulStandardInput,
  zImageTurboInput,
} from '@/lib/providers/higgsfield/models';
import { seedanceI2vUsd, videoTokensUsd } from '@/lib/providers/higgsfield/tokenPricing';
import { catalogueEntry } from '@/lib/providers/catalogue';
import { describeInput } from '@/lib/providers/paramSpec';
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
  /**
   * 'page' = the workflow's own doc page was read; 'family' = a sibling's page — the smoke test confirms it;
   * 'unverified' = not read at all: ⚠️ never enabled by default (isModelEnabled), only when HF_ENABLED_MODELS names it.
   */
  schema: 'page' | 'family' | 'unverified';
  /** Application deadline for one request of this model (polling / reconciliation). */
  timeoutMs: number;
  /**
   * Local price for a model the provider only DESCRIBES (no numeric estimate) — USD from the validated input
   * and the provider's pricing text. Absent → such a model cannot be priced and is refused (D5).
   * TODO(pricing): the models added 2026-10-02 have none — the provider's numeric estimate prices them. Should the smoke
   * test (`npm run hf:smoke`) show one answering with a description only, its wholesale-USD function belongs HERE (cited
   * from that description, like tokenPricing.ts), never a guess; until then the saga refuses it, nothing is charged.
   */
  priceUsd?: (input: Record<string, unknown>, pricingDescription: string | null) => number | null;
  /**
   * Fields of which at least one must be filled — a rule the schema states as a refinement, which a form
   * cannot read. The UI waits for one of them before asking for a price.
   */
  requireOneOf?: string[];
}

const MIN = 60_000;

type Names = Pick<ModelEntry, 'label_ka' | 'description_ka' | 'label_en'>;

/** A Higgsfield model's names, from the catalogue. Throws at import if one is missing — a test-time failure, never a blank row. */
function names(id: string): Names {
  const c = catalogueEntry(id);
  if (!c) throw new Error(`registry: ${id} has no catalogue entry (lib/providers/catalogue.ts)`);
  return { label_ka: c.label.ka, description_ka: c.bestFor.ka, label_en: c.label.en };
}

export const MODELS: readonly ModelEntry[] = [
  {
    id: 'hf/soul-2',
    provider: 'higgsfield',
    endpoint: HF_ENDPOINTS.soul2,
    service: 'image',
    mode: 'text-to-image',
    family: 'soul-2',
    ...names('hf/soul-2'),
    tier: 'standard',
    output: 'images',
    fallback: [],
    input: soul2Input,
    schema: 'page',
    timeoutMs: 10 * MIN,
  },
  // ── image, read 2026-10-02 ──
  { id: 'hf/soul', provider: 'higgsfield', endpoint: HF_ENDPOINTS.soulStandard, service: 'image', mode: 'text-to-image', family: 'soul',
    ...names('hf/soul'), tier: 'standard', output: 'images', fallback: [], input: soulStandardInput, schema: 'page', timeoutMs: 10 * MIN },
  { id: 'hf/soul-cinema', provider: 'higgsfield', endpoint: HF_ENDPOINTS.soulCinema, service: 'image', mode: 'text-to-image', family: 'soul-cinema',
    ...names('hf/soul-cinema'), tier: 'standard', output: 'images', fallback: [], input: soulCinemaInput, schema: 'page', timeoutMs: 10 * MIN },
  { id: 'hf/grok-image-2', provider: 'higgsfield', endpoint: HF_ENDPOINTS.grokImage2, service: 'image', mode: 'text-to-image', family: 'grok-image-2',
    ...names('hf/grok-image-2'), tier: 'fast', output: 'images', fallback: [], input: grokImage2Input, schema: 'page', timeoutMs: 10 * MIN },
  { id: 'hf/qwen-image-3', provider: 'higgsfield', endpoint: HF_ENDPOINTS.qwenImage3T2i, service: 'image', mode: 'text-to-image', family: 'qwen-image-3',
    ...names('hf/qwen-image-3'), tier: 'standard', output: 'images', fallback: [], input: qwenImage3T2iInput, schema: 'page', timeoutMs: 10 * MIN },
  { id: 'hf/recraft-v4.1', provider: 'higgsfield', endpoint: HF_ENDPOINTS.recraftV41, service: 'image', mode: 'text-to-image', family: 'recraft-v4.1',
    ...names('hf/recraft-v4.1'), tier: 'fast', output: 'images', fallback: [], input: recraftV41Input, schema: 'page', timeoutMs: 10 * MIN },
  { id: 'hf/ideogram-4', provider: 'higgsfield', endpoint: HF_ENDPOINTS.ideogram4, service: 'image', mode: 'text-to-image', family: 'ideogram-4',
    ...names('hf/ideogram-4'), tier: 'standard', output: 'images', fallback: [], input: ideogram4Input, schema: 'page', timeoutMs: 10 * MIN },
  { id: 'hf/z-image-turbo', provider: 'higgsfield', endpoint: HF_ENDPOINTS.zImageTurbo, service: 'image', mode: 'text-to-image', family: 'z-image-turbo',
    ...names('hf/z-image-turbo'), tier: 'fast', output: 'images', fallback: [], input: zImageTurboInput, schema: 'page', timeoutMs: 10 * MIN },
  { id: 'hf/marketing-studio-image', provider: 'higgsfield', endpoint: HF_ENDPOINTS.marketingStudioImage, service: 'image', mode: 'text-to-image',
    family: 'marketing-studio-image', ...names('hf/marketing-studio-image'), tier: 'pro', output: 'images', fallback: [], input: marketingStudioImageInput,
    schema: 'page', timeoutMs: 10 * MIN },
  {
    id: 'hf/kling-3-std-t2v',
    provider: 'higgsfield',
    endpoint: HF_ENDPOINTS.kling3StdT2v,
    service: 'video',
    mode: 'text-to-video',
    family: 'kling-3-t2v',
    ...names('hf/kling-3-std-t2v'),
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
    ...names('hf/kling-3-pro-t2v'),
    tier: 'pro',
    output: 'video',
    fallback: ['hf/kling-3-std-t2v'],
    input: klingT2vInput,
    schema: 'page',
    timeoutMs: 25 * MIN,
  },
  {
    id: 'hf/kling-3-std-i2v',
    provider: 'higgsfield',
    endpoint: HF_ENDPOINTS.kling3StdI2v,
    service: 'video',
    mode: 'image-to-video',
    family: 'kling-3-i2v',
    ...names('hf/kling-3-std-i2v'),
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
    ...names('hf/kling-3-pro-i2v'),
    tier: 'pro',
    output: 'video',
    fallback: ['hf/kling-3-std-i2v'],
    input: klingI2vInput,
    schema: 'page',
    timeoutMs: 25 * MIN,
  },
  {
    id: 'hf/seedance-2.5-t2v',
    provider: 'higgsfield',
    endpoint: HF_ENDPOINTS.seedance25T2v,
    service: 'video',
    mode: 'text-to-video',
    family: 'seedance-2.5-t2v',
    ...names('hf/seedance-2.5-t2v'),
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
    ...names('hf/seedance-2.5-r2v'),
    tier: 'standard',
    output: 'video',
    fallback: [],
    input: seedanceR2vInput,
    schema: 'page',
    timeoutMs: 20 * MIN,
    priceUsd: videoTokensUsd,
    requireOneOf: ['image_urls', 'audio_urls'],
  },
  // ── video, read 2026-10-02 ──
  { id: 'hf/kling-3-turbo-t2v', provider: 'higgsfield', endpoint: HF_ENDPOINTS.kling3TurboT2v, service: 'video', mode: 'text-to-video',
    family: 'kling-3-turbo-t2v', ...names('hf/kling-3-turbo-t2v'), tier: 'fast', output: 'video', fallback: [], input: klingTurboT2vInput,
    schema: 'page', timeoutMs: 20 * MIN },
  { id: 'hf/kling-3-turbo-i2v', provider: 'higgsfield', endpoint: HF_ENDPOINTS.kling3TurboI2v, service: 'video', mode: 'image-to-video',
    family: 'kling-3-turbo-i2v', ...names('hf/kling-3-turbo-i2v'), tier: 'fast', output: 'video', fallback: [], input: klingTurboI2vInput,
    schema: 'page', timeoutMs: 20 * MIN },
  // 4K: the same schema as its std / pro siblings (both pages read), but never their fallback — a 4K order is not silently 1080p.
  { id: 'hf/kling-3-4k-t2v', provider: 'higgsfield', endpoint: HF_ENDPOINTS.kling34kT2v, service: 'video', mode: 'text-to-video',
    family: 'kling-3-4k-t2v', ...names('hf/kling-3-4k-t2v'), tier: 'pro', output: 'video', fallback: [], input: klingT2vInput,
    schema: 'page', timeoutMs: 30 * MIN },
  { id: 'hf/kling-3-4k-i2v', provider: 'higgsfield', endpoint: HF_ENDPOINTS.kling34kI2v, service: 'video', mode: 'image-to-video',
    family: 'kling-3-4k-i2v', ...names('hf/kling-3-4k-i2v'), tier: 'pro', output: 'video', fallback: [], input: klingI2vInput,
    schema: 'page', timeoutMs: 30 * MIN },
  { id: 'hf/seedance-2.5-i2v', provider: 'higgsfield', endpoint: HF_ENDPOINTS.seedance25I2v, service: 'video', mode: 'image-to-video',
    family: 'seedance-2.5-i2v', ...names('hf/seedance-2.5-i2v'), tier: 'standard', output: 'video', fallback: [], input: seedanceI2vInput,
    schema: 'page', timeoutMs: 20 * MIN, priceUsd: seedanceI2vUsd },
  {
    id: 'hf/kling-3-motion-std',
    provider: 'higgsfield',
    endpoint: HF_ENDPOINTS.kling3McStd,
    service: 'motion',
    mode: 'motion-transfer',
    family: 'kling-3-motion',
    ...names('hf/kling-3-motion-std'),
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
    ...names('hf/kling-3-motion-pro'),
    tier: 'pro',
    output: 'video',
    fallback: ['hf/kling-3-motion-std'],
    input: klingMotionInput,
    schema: 'page',
    timeoutMs: 30 * MIN,
  },
  {
    id: 'hf/genjutsu-motion',
    provider: 'higgsfield',
    endpoint: HF_ENDPOINTS.genjutsuMotion,
    service: 'motion',
    mode: 'motion-transfer',
    family: 'genjutsu-motion',
    ...names('hf/genjutsu-motion'),
    tier: 'standard',
    output: 'video',
    fallback: [],
    input: genjutsuMotionInput,
    schema: 'page',
    timeoutMs: 30 * MIN,
  },
  // ── motion, read 2026-10-02: Kling 2.6 Motion Control takes Kling 3.0's exact schema on its own endpoints ──
  { id: 'hf/kling-2.6-motion-std', provider: 'higgsfield', endpoint: HF_ENDPOINTS.kling26McStd, service: 'motion', mode: 'motion-transfer',
    family: 'kling-2.6-motion', ...names('hf/kling-2.6-motion-std'), tier: 'standard', output: 'video', fallback: [], input: klingMotionInput,
    schema: 'page', timeoutMs: 30 * MIN },
  { id: 'hf/kling-2.6-motion-pro', provider: 'higgsfield', endpoint: HF_ENDPOINTS.kling26McPro, service: 'motion', mode: 'motion-transfer',
    family: 'kling-2.6-motion', ...names('hf/kling-2.6-motion-pro'), tier: 'pro', output: 'video', fallback: ['hf/kling-2.6-motion-std'], input: klingMotionInput,
    schema: 'page', timeoutMs: 30 * MIN },
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
  const m = BY_ID.get(id);
  if (!m) return false;
  const allow = enabledIds(env);
  // ⚠️ A schema nobody read is a guess about what the provider accepts — a 422 after the reserve at best. It runs only
  // where the owner has named it (after `npm run hf:smoke` against it), never because the list happens to be unset.
  if (m.schema === 'unverified') return allow !== null && allow.has(id);
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

/**
 * The public, UI-safe view of a model: no endpoint, no schema object — the form description derived from the
 * schema instead (lib/providers/paramSpec.ts), so the chips offer exactly what the server will accept.
 */
export function publicModel(m: ModelEntry) {
  return {
    id: m.id,
    service: m.service,
    mode: m.mode,
    label_ka: m.label_ka,
    description_ka: m.description_ka,
    label_en: m.label_en,
    tier: m.tier,
    output: m.output,
    params: describeInput(m.input),
    requireOneOf: m.requireOneOf ?? [],
  };
}

export type PublicModel = ReturnType<typeof publicModel>;
