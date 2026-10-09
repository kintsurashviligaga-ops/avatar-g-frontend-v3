/**
 * lib/agent/tools/registry.ts — Agent G's tool allowlist: the only tools a model can call, each one typed.
 *
 * A tool is a spec the agent is handed, never a function it reaches into:
 *   name     what the model calls it.
 *   effect   what it may do, and nothing else:
 *              read     looks up public facts (a search, a web page). No user data, no state, no money.
 *              prepare  assembles something for the USER to act on (a post draft). It never publishes.
 *              quote    analyses the user's own files and prices a job. It spends nothing and starts nothing.
 *            There is NO effect that lets a model start a job, spend credits or change the user's data. Those run only
 *            on the user's own Confirm, through a route that holds the session and the signed quote: the confirmed
 *            actions below. defineTool refuses any other effect, so an "execute" tool cannot be registered by mistake.
 *   input    a zod schema. The model's input is parsed before the tool sees it (unknown keys dropped, every field
 *            bounded); a bad input comes back as an observation the model can correct, never as a call.
 *   offered  whether this request gets the tool at all (the user's access, the files they attached).
 *   limit    calls per agent run; the next one is refused as an observation.
 *   confirms for a quote: the confirmed action its plan leads to.
 *
 * bindTools turns the specs for one request into the coordinator's tools (lib/agent/react/coordinator): parse, count,
 * never throw. Adding a tool means adding a spec here or in its binding AND updating the allowlist test
 * (registry.test.ts), which pins every name and effect.
 */
import { z } from 'zod';
import type { AgentTool } from '@/lib/agent/react/coordinator';

export type ToolEffect = 'read' | 'prepare' | 'quote';
const EFFECTS: readonly string[] = ['read', 'prepare', 'quote'];

/**
 * What the user's Confirm runs, and where. The model never calls these: a quote tool returns a plan, the user sees it
 * on a card, and only their press reaches the route (with their session and the quote's signed token).
 */
export const CONFIRMED_ACTIONS = {
  montage_run: {
    route: '/api/agent/media/montage',
    action: 'run',
    access: 'AGENT_G_MEDIA_EXEC',
    does: 'queues the quoted montage once per quote; a worker renders it under a lease (lib/agent/media/montageWorker)',
  },
  audio_extract_run: {
    route: '/api/agent/media/audio',
    action: 'run',
    access: 'AGENT_G_MEDIA_EXEC',
    does: 'queues the quoted audio extraction once per quote; a worker turns it into an MP3 under a lease (lib/agent/media/audioWorker)',
  },
} as const;
export type ConfirmedAction = keyof typeof CONFIRMED_ACTIONS;

export interface ToolSpec<C, S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  effect: ToolEffect;
  description: string;
  input: S;
  offered?: (ctx: C) => boolean;
  limit?: number;
  confirms?: ConfirmedAction;
  run: (input: z.infer<S>, ctx: C) => Promise<unknown>;
}

const NAME = /^[a-z][a-z0-9_]{2,40}$/;

/**
 * Check a spec once, where it is written: a wrong one fails at load (and in its test), never mid-conversation. The run
 * is typed against its own schema here; the registry holds it by its schema only (bindTools parses before it runs).
 */
export function defineTool<C, S extends z.ZodTypeAny>(spec: ToolSpec<C, S>): ToolSpec<C> {
  if (!NAME.test(spec.name)) throw new Error(`tool name "${spec.name}" is not a tool name`);
  if (!EFFECTS.includes(spec.effect)) throw new Error(`tool ${spec.name}: effect "${String(spec.effect)}" is not allowed for a model`);
  if (spec.effect === 'quote' && !(spec.confirms && spec.confirms in CONFIRMED_ACTIONS)) {
    throw new Error(`tool ${spec.name}: a quote must name the confirmed action it leads to`);
  }
  if (spec.effect !== 'quote' && spec.confirms) throw new Error(`tool ${spec.name}: only a quote leads to a confirmed action`);
  if (spec.limit !== undefined && !(Number.isInteger(spec.limit) && spec.limit > 0)) throw new Error(`tool ${spec.name}: bad limit`);
  return spec as unknown as ToolSpec<C>;
}

/** The tools one request gets: the offered specs, each parsing its input, counting its calls, and never throwing. */
export function bindTools<C>(specs: ReadonlyArray<ToolSpec<C>>, ctx: C): AgentTool[] {
  const seen = new Set<string>();
  const out: AgentTool[] = [];
  for (const spec of specs) {
    if (seen.has(spec.name)) throw new Error(`tool ${spec.name} is registered twice`);
    seen.add(spec.name);
    if (spec.offered && !spec.offered(ctx)) continue;
    let calls = 0;
    out.push({
      name: spec.name,
      description: spec.description,
      run: async (raw) => {
        if (spec.limit !== undefined && calls >= spec.limit) {
          return { error: 'call_limit', message: `At most ${spec.limit} ${spec.name} calls per request.` };
        }
        const parsed = spec.input.safeParse(raw ?? {});
        if (!parsed.success) {
          return { error: 'invalid_input', issues: parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`) };
        }
        calls += 1;
        try {
          return await spec.run(parsed.data, ctx);
        } catch (e) {
          return { error: 'tool_failed', message: e instanceof Error ? e.message.slice(0, 200) : 'the tool failed' };
        }
      },
    });
  }
  return out;
}

/** The allowlist as data (name → effect), for the test that pins it and for the audit trail. */
export const allowlistOf = <C>(specs: ReadonlyArray<ToolSpec<C>>): Record<string, ToolEffect> =>
  Object.fromEntries(specs.map((s) => [s.name, s.effect]));
