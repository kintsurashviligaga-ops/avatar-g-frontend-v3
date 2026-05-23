/**
 * MyAvatar MCP skills manifest — the single declarative registry that decouples
 * orchestration from tool execution.
 *
 * `.mcp/skills-manifest.json` is the source of truth: the MCP server reads it to
 * decide which standardized Tools to expose, and specialized agents (Agent N,
 * the video/voice swarms) "install" new field competencies by adding entries
 * here — no other code is touched. This module is the zod-validated contract
 * shared by the app (gate-checked, tested) and the MCP server (which parses the
 * same JSON at boot). Pure — no SDK / network deps.
 */

import { z } from 'zod';

/** Transport shape of a tool's underlying MyAvatar route. */
export const ToolKind = z.enum(['json', 'sse', 'binary']);
export type ToolKind = z.infer<typeof ToolKind>;

export const ManifestToolSchema = z.object({
  /** Stable MCP tool id (snake_case) — what an MCP client invokes. */
  id: z.string().regex(/^[a-z][a-z0-9_]*$/, 'tool id must be snake_case'),
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(['database', 'hardware', 'synthesis', 'vision', 'assembly']),
  /** Disabled tools are NOT exposed by the server — the kill-switch / install gate. */
  enabled: z.boolean(),
  route: z.object({
    path: z.string().startsWith('/'),
    method: z.enum(['GET', 'POST']),
    kind: ToolKind,
    /** true → requires a MyAvatar bearer token (authed produce/jobs routes). */
    auth: z.boolean().default(false),
  }),
  /** Free-form input hints surfaced to the model (kept loose by design). */
  inputHints: z.record(z.string()).optional(),
});
export type ManifestTool = z.infer<typeof ManifestToolSchema>;

export const ManifestAgentSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** Tool ids this agent is competent to call (must exist in `tools`). */
  skills: z.array(z.string()).min(1),
});
export type ManifestAgent = z.infer<typeof ManifestAgentSchema>;

export const SkillsManifestSchema = z.object({
  version: z.literal(1),
  server: z.object({ name: z.string().min(1), version: z.string().min(1) }),
  tools: z.array(ManifestToolSchema).min(1),
  agents: z.array(ManifestAgentSchema).min(1),
});
export type SkillsManifest = z.infer<typeof SkillsManifestSchema>;

export interface ManifestParseResult {
  ok: boolean;
  manifest?: SkillsManifest;
  /** Human-readable validation problems (schema + referential integrity). */
  errors: string[];
}

/**
 * Validate a raw manifest object: zod shape + referential integrity (every
 * agent skill must reference a declared tool id). Never throws.
 */
export function parseSkillsManifest(raw: unknown): ManifestParseResult {
  const parsed = SkillsManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  }
  const m = parsed.data;
  const toolIds = new Set(m.tools.map((t) => t.id));
  const errors: string[] = [];
  for (const agent of m.agents) {
    for (const skill of agent.skills) {
      if (!toolIds.has(skill)) errors.push(`agent "${agent.id}" references unknown tool "${skill}"`);
    }
  }
  // Duplicate tool ids are a hard error (would shadow each other on the server).
  const seen = new Set<string>();
  for (const t of m.tools) {
    if (seen.has(t.id)) errors.push(`duplicate tool id "${t.id}"`);
    seen.add(t.id);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, manifest: m, errors: [] };
}

/** The tool ids the server will actually expose (enabled only). */
export function enabledToolIds(manifest: SkillsManifest): string[] {
  return manifest.tools.filter((t) => t.enabled).map((t) => t.id);
}
