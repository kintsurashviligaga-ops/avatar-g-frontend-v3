/**
 * lib/adk/pilotTools.ts — the four tools of the Google ADK read-only pilot, and the one gate every call goes through
 * (MASTER TASK v3.1 §2.4, Phase 5).
 *
 * THE TOOLS (v3.1: "owner-scoped capability lookup, quote/status lookup, read-only library metadata and execution-plan
 * proposals"):
 *   capability_lookup  what the app can do for THIS caller: lib/agent/capabilities, minus withdrawn and hidden services,
 *                      with each flag evaluated for the caller.
 *   task_status        the caller's own tasks (lib/tasks/taskService, read with workersOpen=false so a read never hands
 *                      a job to a worker). A quoted run waiting for the user's Start is a task `awaiting_approval`: that
 *                      is the quote lookup. No quote token, no signed result link ever reaches the model.
 *   library_list       the caller's library METADATA (kind, the prompt cut short, when, starred). No media links.
 *   plan_propose       a typed plan for the existing executor: a multi-step media run checked by
 *                      lib/agent/run/runSpec validateRunSpec, or one catalog capability with the user's words. It is a
 *                      PROPOSAL: no price, no token, `executes: false`. The user's own card and the existing quote → Start
 *                      path are the only way it runs, and they check everything again.
 *
 * WHERE THEY COME FROM (v3.1: "generate ADK tool definitions from a reviewed adapter over the canonical registry;
 * reconcile the contract skeleton and legacy text-helper registry explicitly"):
 *   · The canonical registry is lib/contracts/toolRegistry. The four definitions below are AgentToolDefinitions,
 *     provider `internal`, risk `low`, no approval needed (they change nothing), and `pilotRegistry()` builds them
 *     through createToolRegistry, so its checks apply. The ADK FunctionTools are generated from these definitions
 *     (pilots/adk), never written by hand.
 *   · lib/tools/registry (summarize / translate / format-prompt / analyze-sentiment) is the legacy text-helper registry.
 *     It is NOT exposed to the pilot: its translate is a mock, and the others are string helpers a model does better
 *     itself. The test pins that none of its ids is a pilot tool.
 *   · lib/agent/tools/registry is Agent G's coordinator allowlist (read / prepare / quote / inspect). Its quote tools
 *     analyse the user's files and sign a quote; the pilot does not get them. A pilot plan is turned into a quote by
 *     the existing chat path after the user sees it.
 *
 * THE GATE (callPilotTool): cancellation and deadline, the tool-call budget, the allowlist, strict input parsing
 * (unknown keys refused, so a model can never name another user), the read itself with the caller's id and signal, and
 * the untrusted wrapper with the size bound. It never throws: every refusal is an observation the model can read.
 */
import { z } from 'zod';
import { createToolRegistry, type ToolRegistry } from '@/lib/contracts/toolRegistry';
import type { AgentCapability, AgentToolDefinition } from '@/lib/contracts/agent';
import { geminiSchemaOf, type GeminiSchema } from '@/lib/agent/tools/declarations';
import type { CapabilityId } from '@/lib/agent/contracts';
import { CAPABILITIES, capabilityRuns, type Capability } from '@/lib/agent/capabilities';
import { getService } from '@/lib/catalog/services';
import { validateRunSpec, type RunSpec } from '@/lib/agent/run/runSpec';
import type { TaskView } from '@/lib/tasks/taskView';
import { msLeft, runStop, type PilotRunContext, type PilotStop } from './pilotPolicy';
import { cleanText, wrapUntrusted, type Untrusted } from './untrusted';

// ─── definitions ────────────────────────────────────────────────────────────────────────────────────────────────

export const PILOT_TOOL_NAMES = ['capability_lookup', 'task_status', 'library_list', 'plan_propose'] as const;
export type PilotToolName = (typeof PILOT_TOOL_NAMES)[number];
export const isPilotTool = (name: unknown): name is PilotToolName =>
  typeof name === 'string' && (PILOT_TOOL_NAMES as readonly string[]).includes(name);

/** The library kinds a caller can filter by (app/api/studio/library LISTED_KINDS). */
export const PILOT_LIBRARY_KINDS = ['film', 'avatar', 'interior', 'image', 'music', 'voice', 'document'] as const;
export type PilotLibraryKind = (typeof PILOT_LIBRARY_KINDS)[number];

const RUN_TOOLS = ['audio_extract', 'montage', 'edit'] as const;

const FILE_REF = z.string().max(2048)
  .describe('One of the files attached to this message, exactly as given, or "step:<id>" for an earlier step\'s result.');

/** One step of a run plan. Strict: a key validateRunSpec does not read is refused, not carried. */
const STEP = z.object({
  id: z.string().max(24).describe('Short id: a-z, 0-9, -.'),
  tool: z.enum(RUN_TOOLS),
  file: FILE_REF.optional(),
  files: z.array(FILE_REF).max(14).optional(),
  url: z.string().max(2048).optional().describe('audio_extract: a public media link instead of a file.'),
  // An edit is checked op by op by lib/agent/media/editWords editAskOf (inside validateRunSpec); only `op` is declared.
  edits: z.array(z.object({ op: z.string().max(32).describe('An edit, e.g. "trim", "speed", "mute", "stabilize".') }).passthrough())
    .max(9).optional(),
  prompt: z.string().max(2000).optional(),
  aspect: z.enum(['9:16', '16:9', '1:1']).optional(),
  targetSec: z.number().min(1).max(600).optional(),
  name: z.string().max(100).optional(),
}).strict();

/**
 * ONE SOURCE: each tool's input is this zod schema. The server parses with it (strict: an unknown key, such as a
 * `userId`, is refused) and the declaration a model is shown is generated from it (lib/agent/tools/declarations
 * geminiSchemaOf), so the two cannot drift apart.
 */
const INPUT = {
  capability_lookup: z.object({
    id: z.string().max(64).optional().describe('A capability id, e.g. "image.generate".'),
    query: z.string().max(100).optional().describe('Words to filter the list by.'),
  }).strict(),
  task_status: z.object({
    id: z.string().max(100).optional().describe('A task id.'),
    active: z.boolean().optional().describe('Only tasks that are still running or waiting.'),
    limit: z.number().int().min(1).max(10).optional(),
  }).strict(),
  library_list: z.object({
    kind: z.enum(PILOT_LIBRARY_KINDS).optional(),
    favorites: z.boolean().optional().describe('Only starred works.'),
    limit: z.number().int().min(1).max(20).optional(),
  }).strict(),
  plan_propose: z.object({
    kind: z.enum(['run', 'service']),
    title: z.string().max(120).optional(),
    capability: z.string().max(64).optional().describe('kind "service": a capability id from capability_lookup.'),
    prompt: z.string().max(2000).optional().describe('kind "service": the user\'s words for it.'),
    steps: z.array(STEP).max(6).optional().describe('kind "run": the steps, in order.'),
  }).strict(),
} satisfies Record<PilotToolName, z.ZodTypeAny>;

/** The zod schema a tool's input is parsed with. */
export const pilotInputSchema = (name: PilotToolName): z.ZodTypeAny => INPUT[name];

export interface PilotToolInfo {
  definition: AgentToolDefinition & { inputSchema: GeminiSchema };
  description: string;
  /** What the tool may do. There is no other effect. */
  effect: 'read' | 'propose';
}

const define = (name: PilotToolName, capability: AgentCapability, effect: PilotToolInfo['effect'], description: string): PilotToolInfo => ({
  effect,
  description,
  definition: {
    name, capability, provider: 'internal', riskLevel: 'low', requiresApproval: false, inputSchema: geminiSchemaOf(INPUT[name]),
  },
});

export const PILOT_TOOLS: Readonly<Record<PilotToolName, PilotToolInfo>> = Object.freeze({
  capability_lookup: define('capability_lookup', 'search', 'read',
    'What MyAvatar can do for this user: each capability, whether it runs today, how it is charged and approved. '
    + 'Give `id` for one capability or `query` to filter by words; give neither for the list.'),
  task_status: define('task_status', 'files', 'read',
    'This user\'s own tasks: status, stage, progress, error. A task "awaiting_approval" is a quoted run waiting for the '
    + 'user\'s Start. Give `id` for one task, or list the newest (only live ones with `active`).'),
  library_list: define('library_list', 'files', 'read',
    'This user\'s library, newest first: kind, the words it was made from, when, starred. Metadata only.'),
  plan_propose: define('plan_propose', 'media', 'propose',
    'Propose a plan for the user to approve. It runs nothing and has no price: the user sees it on a card and only their '
    + 'Start runs it. kind "run": ordered media steps (audio_extract, montage, edit) on the attached files. kind "service": '
    + 'one capability with the user\'s words.'),
});

/** The pilot's tools as a canonical registry (lib/contracts/toolRegistry): its validation runs when this is built. */
export function pilotRegistry(): ToolRegistry {
  return createToolRegistry(PILOT_TOOL_NAMES.map((n) => PILOT_TOOLS[n].definition));
}

// ─── the reads the tools need (injected) ────────────────────────────────────────────────────────────────────────

export interface PilotIo {
  signal: AbortSignal;
  traceId: string;
}

/** One library entry as the pilot reads it (lib/library/libraryQuery LibraryItem, minus its media link and plan). */
export interface PilotLibraryEntry {
  id: string;
  kind: string;
  prompt: string | null;
  orientation?: string;
  createdAt: string;
  favorite?: boolean;
}

/**
 * Every read is scoped by the caller's id, which comes from the run context, never from a model. A row of anyone else
 * is "not found" (lib/tasks/taskService's rule), so a guessed id tells a model nothing.
 */
export interface PilotDeps {
  readTask(userId: string, id: string, io: PilotIo): Promise<TaskView | null>;
  listTasks(userId: string, opts: { active: boolean; limit: number }, io: PilotIo): Promise<TaskView[]>;
  listLibrary(userId: string, opts: { kind?: PilotLibraryKind; favorites: boolean; limit: number }, io: PilotIo): Promise<PilotLibraryEntry[]>;
  /** Is the feature behind this flag open to this user (lib/agent/capabilities `flag`)? */
  flagOpen(flag: string, userId: string): boolean | Promise<boolean>;
}

// ─── outcomes ───────────────────────────────────────────────────────────────────────────────────────────────────

export type PilotToolError =
  | PilotStop
  | 'tool_unavailable'
  | 'tool_budget_exhausted'
  | 'bad_input'
  | 'not_found'
  | 'not_allowed'
  | 'read_failed';

export type PilotToolOutcome =
  | { ok: true; tool: PilotToolName; traceId: string; result: Untrusted<unknown> }
  | { ok: false; tool: string; traceId: string; error: PilotToolError; message: string };

/** A plan the model proposed. Never executable: the existing quote → card → Start path is the only way it runs. */
export type PilotProposal =
  | { id: string; kind: 'run'; spec: RunSpec; capabilities: CapabilityId[]; approval: 'plan-start'; status: 'awaiting_approval'; executes: false; traceId: string }
  | {
    id: string; kind: 'service'; capability: CapabilityId; prompt: string; title?: string;
    approval: Capability['approval']; status: 'awaiting_approval'; executes: false; traceId: string;
  };

// ─── the tools ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Labels a capability carries that mean nobody can use it today. */
const UNUSABLE = new Set(['MISSING', 'DISABLED', 'DEPRECATED', 'BLOCKED_OWNER']);
/** Capabilities a service proposal may never name: the run tools (kind "run") and code execution. */
const NOT_A_SERVICE_PLAN = new Set<CapabilityId>(['agent.montage', 'agent.audio-extract', 'media.edit', 'agent.code-run']);

/**
 * Withdrawn or hidden catalog services do not exist for the pilot (v3.1: do not reopen withdrawn services). Whether a
 * listed one runs is its capability's own word (capabilityRuns and its proof label), not the catalog's `boundary`.
 */
function listed(cap: Capability): boolean {
  if (!cap.serviceId) return true;
  const svc = getService(cap.serviceId);
  return !!svc && (svc.status === 'live' || svc.status === 'beta');
}

async function capabilityView(cap: Capability, userId: string, deps: PilotDeps) {
  const open = cap.flag ? (await deps.flagOpen(cap.flag, userId)) === true : true;
  return {
    id: cap.id,
    does: cleanText(cap.does, 300),
    runs: capabilityRuns(cap.id) && !UNUSABLE.has(cap.label) && open,
    charge: cap.pricing.charge,
    approval: cap.approval,
    artifact: cap.artifact,
    proof: cap.label,
  };
}

const LISTED_CAPABILITIES = (): Capability[] => (Object.values(CAPABILITIES) as Capability[]).filter(listed);

/** A task as a model may read it: no result link (a signed URL is a bearer token), the owner's words cleaned. */
function taskSummary(t: TaskView) {
  return {
    id: t.id,
    kind: t.kind,
    service: t.service,
    status: t.status,
    stage: cleanText(t.stage, 80),
    pct: typeof t.pct === 'number' ? Math.round(t.pct) : null,
    error: cleanText(t.error, 80),
    cancellable: t.cancellable,
    label: cleanText(t.label, 80),
    result: t.result ? { media: t.result.media, name: cleanText(t.result.name, 100), durationSec: t.result.durationSec ?? null } : null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

type Ok = { ok: true; data: unknown };
type Refusal = { ok: false; error: PilotToolError; message: string };
const refuse = (error: PilotToolError, message: string): Refusal => ({ ok: false, error, message });

const STEP_PREFIX = 'step:';

/** A model's step → the shape validateRunSpec reads; every file must be attached to THIS message or an earlier step. */
function runSpecOf(input: z.infer<typeof INPUT.plan_propose>, attachments: ReadonlySet<string>): { ok: true; spec: unknown } | Refusal {
  const steps = input.steps ?? [];
  const ref = (x: unknown): unknown => {
    if (typeof x !== 'string') return x;
    return x.startsWith(STEP_PREFIX) ? { step: x.slice(STEP_PREFIX.length) } : x;
  };
  const out: Record<string, unknown>[] = [];
  for (const s of steps) {
    const files = Array.isArray(s.files) ? s.files.map(ref) : undefined;
    const step: Record<string, unknown> = { ...s };
    delete step.url;
    if (files) step.files = files;
    if (s.file !== undefined) step.file = ref(s.file);
    if (s.tool === 'audio_extract') {
      delete step.file;
      step.source = typeof s.url === 'string' ? { url: s.url } : { file: ref(s.file) };
    }
    for (const f of [...(files ?? []), ...(s.file !== undefined ? [ref(s.file)] : [])]) {
      if (typeof f === 'string' && !attachments.has(f)) {
        return refuse('not_allowed', 'A plan may only use files attached to this message (or an earlier step\'s result).');
      }
    }
    out.push(step);
  }
  return { ok: true, spec: { ...(input.title ? { title: input.title } : {}), steps: out } };
}

async function runTool(name: PilotToolName, input: unknown, deps: PilotDeps, ctx: PilotRunContext, io: PilotIo): Promise<Ok | Refusal> {
  const { userId } = ctx;
  switch (name) {
    case 'capability_lookup': {
      const q = input as z.infer<typeof INPUT.capability_lookup>;
      const caps = LISTED_CAPABILITIES();
      if (q.id) {
        const cap = caps.find((c) => c.id === q.id);
        return cap ? { ok: true, data: { capability: await capabilityView(cap, userId, deps) } } : refuse('not_found', 'No such capability.');
      }
      const words = (q.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      const hits = words.length ? caps.filter((c) => words.some((w) => `${c.id} ${c.does}`.toLowerCase().includes(w))) : caps;
      return { ok: true, data: { capabilities: await Promise.all(hits.map((c) => capabilityView(c, userId, deps))) } };
    }
    case 'task_status': {
      const q = input as z.infer<typeof INPUT.task_status>;
      if (q.id) {
        const task = await deps.readTask(userId, q.id, io);
        return task ? { ok: true, data: { task: taskSummary(task) } } : refuse('not_found', 'No such task.');
      }
      const tasks = await deps.listTasks(userId, { active: q.active === true, limit: q.limit ?? 5 }, io);
      return { ok: true, data: { tasks: tasks.slice(0, q.limit ?? 5).map(taskSummary) } };
    }
    case 'library_list': {
      const q = input as z.infer<typeof INPUT.library_list>;
      const limit = q.limit ?? 10;
      const items = await deps.listLibrary(userId, { ...(q.kind ? { kind: q.kind } : {}), favorites: q.favorites === true, limit }, io);
      return {
        ok: true,
        data: {
          items: items.slice(0, limit).map((i) => ({
            id: i.id, kind: i.kind, prompt: cleanText(i.prompt, 200), createdAt: i.createdAt, favorite: i.favorite === true,
          })),
        },
      };
    }
    case 'plan_propose': {
      const q = input as z.infer<typeof INPUT.plan_propose>;
      const base = { status: 'awaiting_approval' as const, executes: false as const, traceId: ctx.traceId };
      if (q.kind === 'run') {
        if (q.capability !== undefined || q.prompt !== undefined) return refuse('bad_input', 'A run plan has steps, not a capability or prompt.');
        const shaped = runSpecOf(q, new Set(ctx.attachments));
        if (!shaped.ok) return shaped;
        const checked = validateRunSpec(shaped.spec);
        if (!checked.ok) return refuse('bad_input', checked.message);
        const capabilities = [...new Set(checked.spec.steps.map((s) => (s.tool === 'audio_extract' ? 'agent.audio-extract' : s.tool === 'montage' ? 'agent.montage' : 'media.edit') as CapabilityId))];
        for (const id of capabilities) {
          const cap = CAPABILITIES[id];
          if (cap.flag && (await deps.flagOpen(cap.flag, userId)) !== true) return refuse('not_allowed', `${id} is not open for this user.`);
        }
        const proposal: PilotProposal = { id: `prop_${ctx.newId()}`, kind: 'run', spec: checked.spec, capabilities, approval: 'plan-start', ...base };
        return { ok: true, data: { proposal } };
      }
      if (q.steps !== undefined) return refuse('bad_input', 'A service plan has a capability and a prompt, not steps.');
      const prompt = cleanText(q.prompt, 2000);
      if (!q.capability || !prompt) return refuse('bad_input', 'A service plan needs a capability and the user\'s words.');
      const cap = LISTED_CAPABILITIES().find((c) => c.id === q.capability);
      if (!cap) return refuse('not_found', 'No such capability.');
      const view = await capabilityView(cap, userId, deps);
      if (NOT_A_SERVICE_PLAN.has(cap.id) || cap.approval === 'none' || !view.runs) {
        return refuse('not_allowed', `${cap.id} cannot be proposed as a service plan.`);
      }
      const title = cleanText(q.title, 120);
      const proposal: PilotProposal = {
        id: `prop_${ctx.newId()}`, kind: 'service', capability: cap.id, prompt, ...(title ? { title } : {}), approval: cap.approval, ...base,
      };
      return { ok: true, data: { proposal } };
    }
  }
}

// ─── the gate ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Run `work` with a signal that aborts on the caller's cancellation OR the run's deadline, so the read itself is
 * stopped (not just abandoned). Resolves with the stop when that comes first.
 */
async function bounded<T>(
  work: (signal: AbortSignal) => Promise<T>,
  caller: AbortSignal,
  ms: number,
): Promise<{ done: T } | { stop: PilotStop }> {
  const ac = new AbortController();
  const relay = () => ac.abort();
  caller.addEventListener('abort', relay, { once: true });
  const timer = setTimeout(() => ac.abort(), ms);
  const stopped = new Promise<{ stop: PilotStop }>((resolve) => {
    const onStop = () => resolve({ stop: caller.aborted ? 'cancelled' : 'deadline' });
    if (ac.signal.aborted) onStop();
    else ac.signal.addEventListener('abort', onStop, { once: true });
  });
  try {
    return await Promise.race([work(ac.signal).then((done) => ({ done })), stopped]);
  } finally {
    clearTimeout(timer);
    caller.removeEventListener('abort', relay);
    ac.abort();
  }
}

/**
 * Run one tool call for one pilot run. Never throws; every refusal is a typed observation. Counts every call, refused
 * ones too, so a model cannot spin on bad calls. Any proposal it makes is appended to `proposals`.
 */
export async function callPilotTool(
  deps: PilotDeps,
  ctx: PilotRunContext,
  name: string,
  rawArgs: unknown,
  proposals: PilotProposal[] = [],
): Promise<PilotToolOutcome> {
  const fail = (error: PilotToolError, message: string): PilotToolOutcome => ({ ok: false, tool: name, traceId: ctx.traceId, error, message });
  const stop = runStop(ctx);
  if (stop) return fail(stop, 'The run has stopped.');
  if (ctx.toolCalls >= ctx.limits.maxToolCalls) return fail('tool_budget_exhausted', 'No more tool calls in this run.');
  ctx.toolCalls += 1;
  if (!isPilotTool(name)) return fail('tool_unavailable', 'This tool does not exist here. Only the four read-only pilot tools can be called.');
  const parsed = INPUT[name].safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return fail('bad_input', parsed.error.issues.slice(0, 4).map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '));
  }
  let bound: { done: Ok | Refusal } | { stop: PilotStop };
  try {
    bound = await bounded((signal) => runTool(name, parsed.data, deps, ctx, { signal, traceId: ctx.traceId }), ctx.signal, msLeft(ctx));
  } catch {
    return fail('read_failed', 'The read failed.');
  }
  if ('stop' in bound) {
    ctx.stop = ctx.stop ?? bound.stop;
    return fail(bound.stop, 'The run has stopped.');
  }
  const res = bound.done;
  if (!res.ok) return fail(res.error, res.message);
  const data = res.data as { proposal?: PilotProposal };
  if (data.proposal) proposals.push(data.proposal);
  return { ok: true, tool: name, traceId: ctx.traceId, result: wrapUntrusted(res.data, ctx.limits.maxToolOutputChars) };
}
