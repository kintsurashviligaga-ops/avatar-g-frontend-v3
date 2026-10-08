/**
 * lib/contracts/toolRegistry.ts — the Tool Registry + capability routing skeleton (PROJECT_MASTER.md Part 1 §12).
 *
 * A registry of AgentToolDefinitions (§6.3), checked when it is built, and one routing rule: a capability resolves to
 * the tools registered for it, or to an explicit `capability_unavailable` — never to some other capability's tool.
 * A high-risk tool always requires approval (Section E8), whatever its definition says.
 *
 * Skeleton on purpose: no executor. The existing lib/tools/registry.ts (summarize / translate / …) is unrelated text
 * helpers; Agent G's real tools move here as Part 2–3 put them behind the provider interfaces.
 */
import { isAgentCapability, type AgentCapability, type AgentToolDefinition, type AgentToolProvider } from './agent';

const TOOL_PROVIDERS: readonly AgentToolProvider[] = ['google', 'elevenlabs', 'sandbox', 'browser', 'internal'];

export type CapabilityRoute =
  | { ok: true; capability: AgentCapability; tools: AgentToolDefinition[] }
  | { ok: false; capability: AgentCapability; reason: 'capability_unavailable' };

export interface ToolRegistry {
  readonly size: number;
  get(name: string): AgentToolDefinition | undefined;
  forCapability(capability: AgentCapability): AgentToolDefinition[];
  route(capability: AgentCapability): CapabilityRoute;
  /** True for unknown tools too: an unregistered tool never runs without a person saying yes. */
  needsApproval(name: string): boolean;
}

/** Every problem with a set of definitions, as readable lines; [] = valid. */
export function validateToolDefinitions(defs: readonly AgentToolDefinition[]): string[] {
  const problems: string[] = [];
  const names = new Set<string>();
  for (const d of defs) {
    const at = `tool "${d.name}"`;
    if (!/^[a-z][a-z0-9_.-]{1,63}$/.test(d.name)) problems.push(`${at}: name must be lowercase [a-z0-9_.-], 2–64 chars`);
    if (names.has(d.name)) problems.push(`${at}: duplicate name`);
    names.add(d.name);
    if (!isAgentCapability(d.capability)) problems.push(`${at}: unknown capability ${String(d.capability)}`);
    if (!TOOL_PROVIDERS.includes(d.provider)) problems.push(`${at}: provider not allowed (Section A)`);
    if (!['low', 'medium', 'high'].includes(d.riskLevel)) problems.push(`${at}: unknown risk level`);
    if (d.riskLevel === 'high' && !d.requiresApproval) problems.push(`${at}: a high-risk tool must require approval (E8)`);
  }
  return problems;
}

/** Build a registry; throws on an invalid definition set (a startup error, not a runtime surprise). */
export function createToolRegistry(defs: readonly AgentToolDefinition[]): ToolRegistry {
  const problems = validateToolDefinitions(defs);
  if (problems.length) throw new Error(`Invalid tool registry:\n- ${problems.join('\n- ')}`);
  const byName = new Map(defs.map((d) => [d.name, Object.freeze({ ...d })] as const));
  const forCapability = (capability: AgentCapability) => [...byName.values()].filter((d) => d.capability === capability);
  return {
    size: byName.size,
    get: (name) => byName.get(name),
    forCapability,
    route(capability) {
      const tools = forCapability(capability);
      return tools.length ? { ok: true, capability, tools } : { ok: false, capability, reason: 'capability_unavailable' };
    },
    needsApproval(name) {
      const d = byName.get(name);
      return !d || d.requiresApproval || d.riskLevel === 'high';
    },
  };
}
