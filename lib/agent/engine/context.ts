/**
 * The VALIDATE context (Phase 3.5a, M-4): the facts about one user and this moment, turned into the functions
 * validate.ts asks. Pure: the caller loads the facts (the admin rule, the service switches, the price book) and this
 * file only decides what they mean, so every rule here is a unit test, not a database read.
 *
 *   modelOf      the Google model a tool calls, or null for pure ffmpeg / file work (no model to retire)
 *   lifecycleOf  that model's row in config/google-lifecycle.json today (lib/capabilities/lifecycle)
 *   serviceOn    the admin service switch the tool sits behind (lib/server/serviceSwitches), when it has one
 *   entitled     D-08: code and research (the sandbox and the browser) are admin-only
 *   inAudience   a tool still rolling out: closed unless the caller says it is open to this user
 *   domainAllowed a research link must be a public host name (lib/agent/browser/policy isPublicHost)
 *   priceOf      the price book (each step adapter's list price), never the planner's estimate
 */
import { LIFECYCLE, lifecycleEntry, lifecycleLevel, type LifecycleRegistry } from '@/lib/capabilities/lifecycle';
import { isPublicHost } from '@/lib/agent/browser/policy';
import type { EngineTool, PlanStep } from './types';
import type { ValidateContext } from './validate';

/**
 * The model each tool calls by default. Pure ffmpeg and file tools have none. A caller may override one (for example
 * video on VERTEX_OMNI_MODEL); a model the lifecycle registry does not list is refused, never assumed safe (04 §5).
 */
export const TOOL_MODEL: Readonly<Record<EngineTool, string | null>> = {
  research: null,
  code: null,
  pdf: null,
  export: null,
  audio_extract: null,
  montage: null,
  edit: null,
  image: 'gemini-3.1-flash-image',
  video: 'gemini-omni-1.2-flash',
  // lib/ai/lyriaMusic's default (LYRIA_MODEL overrides it there; pass the same override in ValidateFacts.models).
  music: 'lyria-3-clip-preview',
  speech: 'gemini-3.8-flash-tts',
  write: 'gemini-3.8-flash',
};

/** The admin service switch each tool sits behind (lib/server/serviceSwitches SWITCHABLE_TOOLS), or null for none. */
export const TOOL_SWITCH: Readonly<Record<EngineTool, string | null>> = {
  research: null,
  code: null,
  pdf: null,
  export: null,
  audio_extract: 'audio-extract',
  montage: 'montage',
  edit: 'media-edit',
  image: 'image',
  video: 'video',
  music: 'music',
  speech: null,
  write: null,
};

/** D-08: the sandbox and the browser are for admins only. */
export const ADMIN_ONLY_TOOLS: ReadonlySet<EngineTool> = new Set(['code', 'research']);

export interface ValidateFacts {
  now: Date;
  /** The server-truth admin rule (lib/auth/adminGuard isAdminIdentity); false when it could not be read. */
  isAdmin: boolean;
  /** Service switches that are off right now (lib/server/serviceSwitches disabledServices). */
  switchedOff: ReadonlySet<string>;
  /** List price per tool, in credits. A tool with no row is refused (validate.ts: no price, no plan). */
  priceBook: Readonly<Partial<Record<EngineTool, number>>>;
  /** The most one run may cost this user, in credits. */
  runCeilingCredits: number;
  /** Tools still rolling out, and whether each is open to this user. A tool not listed is open. */
  audience?: Readonly<Partial<Record<EngineTool, boolean>>>;
  /** Per-tool model overrides (env), on top of TOOL_MODEL. Empty or null keeps the default: an override never removes a model. */
  models?: Readonly<Partial<Record<EngineTool, string | null>>>;
  /** Defaults to the real registry; tests pass their own. */
  registry?: LifecycleRegistry;
}

export function buildValidateContext(f: ValidateFacts): ValidateContext {
  const reg = f.registry ?? LIFECYCLE;
  return {
    // An override names another model; it can never remove one. An empty or missing override falls back to the default,
    // so a tool that calls a model is always checked against the registry (fail closed, never "no model, nothing to check").
    modelOf: (tool) => {
      const o = f.models?.[tool];
      const name = typeof o === 'string' ? o.trim() : '';
      return name || TOOL_MODEL[tool];
    },
    lifecycleOf: (model) => {
      const entry = lifecycleEntry(model, reg);
      return { known: entry !== null, level: lifecycleLevel(entry, f.now, reg) };
    },
    serviceOn: (tool) => {
      const sw = TOOL_SWITCH[tool];
      return sw === null || !f.switchedOff.has(sw);
    },
    entitled: (tool) => !ADMIN_ONLY_TOOLS.has(tool) || f.isAdmin,
    inAudience: (tool) => f.audience?.[tool] ?? true,
    domainAllowed: (host) => isPublicHost(host),
    runCeilingCredits: Number.isFinite(f.runCeilingCredits) && f.runCeilingCredits >= 0 ? f.runCeilingCredits : 0,
    priceOf: (step: PlanStep) => {
      const p = f.priceBook[step.tool];
      return typeof p === 'number' && Number.isFinite(p) && p >= 0 ? p : null;
    },
  };
}
