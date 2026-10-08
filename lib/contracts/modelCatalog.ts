/**
 * lib/contracts/modelCatalog.ts — the ModelCatalog contract (PROJECT_MASTER.md Section D, D4–D8).
 *
 * The catalog is the only place a model selector may read from. D1's list is an ALLOWLIST, not the source of truth:
 * an entry reaches the UI only when it is enabled AND verified on the runtime for this project and region (D2,
 * `verifiedAt`). Everything here is pure: the real catalog (Part 2, objective D) is data that must pass
 * validateModelCatalog() in a jest test (D5), and the selectors read uiModelEntries() (D5 runtime, D6).
 */
import { AGENT_CAPABILITIES, type AgentCapability } from './agent';

export const MODEL_CAPABILITIES = [
  'text',
  'code',
  'reasoning',
  'agent',
  'live',
  'image',
  'video',
  'music',
  'tts',
  'transcribe',
  'translate',
  'dialog',
  'robotics',
  'embedding',
  'computer_use',
] as const;
export type ModelCapability = (typeof MODEL_CAPABILITIES)[number];

export const MODEL_FAMILIES = ['gemini', 'gemma', 'imagen', 'veo', 'lyria', 'nano_banana', 'robotics', 'embedding', 'specialty'] as const;
export type ModelFamily = (typeof MODEL_FAMILIES)[number];

export type ModelTransport = 'vertex' | 'gemini_api' | 'either';

export type ModelCatalogEntry = {
  /** e.g. "gemini-3.8-flash" — the id the runtime knows, never a display name. */
  id: string;
  /** UI display; preview models say "Preview" (D6). */
  label: string;
  provider: 'google';
  family: ModelFamily;
  capabilities: ModelCapability[];
  focusModes: AgentCapability[];
  /** D8: `vertex` → only Vertex; `gemini_api` → only the API key; `either` → Vertex, the key only on the user's opt-in. */
  transport: ModelTransport;
  enabled: boolean;
  /** When the runtime last answered for this id (D2). Absent → never shown. */
  verifiedAt?: string;
  notes?: string;
};

export type ModelCatalog = {
  entries: ModelCatalogEntry[];
  updatedAt: string;
  version: string;
};

/**
 * D3 / D7 — forbidden vendors and retired Google models, matched case-insensitively against ids and labels.
 * `xai`, `o1`/`o3` and `cohere` are matched as whole tokens so that words merely containing them ("coherent") do not trip it.
 */
const FORBIDDEN_MODEL =
  /gpt-|openai|claude|anthropic|midjourney|stable[\s_-]?diffusion|flux|dall[\s·.-]?e|sdxl|cohere(?![a-z])|mistral|llama|deepseek|grok|(^|[^a-z0-9])xai([^a-z0-9]|$)|(^|[^a-z0-9])o[13](-|$)|gemini[\s-]1\.[05]/i;

export const isForbiddenModelName = (name: string): boolean => FORBIDDEN_MODEL.test(name);

/** D5 build-time. Every problem as a readable line; [] = valid. */
export function validateModelCatalog(catalog: ModelCatalog): string[] {
  const problems: string[] = [];
  if (!catalog.version) problems.push('version is required');
  if (!catalog.updatedAt || Number.isNaN(Date.parse(catalog.updatedAt))) problems.push('updatedAt must be an ISO date');
  const ids = new Set<string>();
  const enabledFor = new Set<ModelCapability>();
  const seenCapabilities = new Set<ModelCapability>();
  for (const e of catalog.entries) {
    const at = `"${e.id}"`;
    if (e.provider !== 'google') problems.push(`${at}: provider must be google (Section A)`);
    if (ids.has(e.id)) problems.push(`${at}: duplicate id`);
    ids.add(e.id);
    if (!/^[a-z0-9][a-z0-9.\-_]*$/.test(e.id)) problems.push(`${at}: id must be a runtime model id (lowercase, no spaces)`);
    if (isForbiddenModelName(e.id) || isForbiddenModelName(e.label)) problems.push(`${at}: forbidden model (D3)`);
    if (/\b(custom|beta)\b/i.test(e.label)) problems.push(`${at}: "custom" / "beta" labels are not allowed (D3)`);
    if (/preview/i.test(e.id) && !/\bPreview\b/.test(e.label)) problems.push(`${at}: a preview model's label must say "Preview" (D6)`);
    if (!(MODEL_FAMILIES as readonly string[]).includes(e.family)) problems.push(`${at}: unknown family ${String(e.family)}`);
    if (!['vertex', 'gemini_api', 'either'].includes(e.transport)) problems.push(`${at}: unknown transport ${String(e.transport)}`);
    if (e.capabilities.length === 0) problems.push(`${at}: no capability`);
    for (const c of e.capabilities) {
      if (!(MODEL_CAPABILITIES as readonly string[]).includes(c)) problems.push(`${at}: unknown capability ${String(c)}`);
      seenCapabilities.add(c);
      if (e.enabled) enabledFor.add(c);
    }
    for (const f of e.focusModes) {
      if (!(AGENT_CAPABILITIES as readonly string[]).includes(f)) problems.push(`${at}: unknown focus mode ${String(f)}`);
    }
    if (e.verifiedAt !== undefined && Number.isNaN(Date.parse(e.verifiedAt))) problems.push(`${at}: verifiedAt must be an ISO date`);
  }
  for (const c of seenCapabilities) {
    if (!enabledFor.has(c)) problems.push(`capability "${c}" has no enabled entry (D5)`);
  }
  return problems;
}

/** D5 runtime / D6: what a selector may show — enabled and verified, for this focus mode, grouped by family. */
export function uiModelEntries(catalog: ModelCatalog, focusMode?: AgentCapability): ModelCatalogEntry[] {
  return catalog.entries
    .filter((e) => e.enabled && !!e.verifiedAt && e.provider === 'google' && !isForbiddenModelName(e.id))
    .filter((e) => !focusMode || e.focusModes.includes(focusMode))
    .sort((a, b) => MODEL_FAMILIES.indexOf(a.family) - MODEL_FAMILIES.indexOf(b.family) || a.label.localeCompare(b.label));
}

export type ModelPreference =
  | { ok: true; entry: ModelCatalogEntry }
  | { ok: false; reason: 'not_in_catalog' | 'disabled' | 'not_verified' | 'wrong_focus_mode' };

/**
 * D5: a saved model that is no longer usable is an explicit answer the UI must show — never a quiet switch to some
 * default model.
 */
export function resolveModelPreference(catalog: ModelCatalog, modelId: string, focusMode?: AgentCapability): ModelPreference {
  const entry = catalog.entries.find((e) => e.id === modelId);
  if (!entry || entry.provider !== 'google' || isForbiddenModelName(entry.id)) return { ok: false, reason: 'not_in_catalog' };
  if (!entry.enabled) return { ok: false, reason: 'disabled' };
  if (!entry.verifiedAt) return { ok: false, reason: 'not_verified' };
  if (focusMode && !entry.focusModes.includes(focusMode)) return { ok: false, reason: 'wrong_focus_mode' };
  return { ok: true, entry };
}
