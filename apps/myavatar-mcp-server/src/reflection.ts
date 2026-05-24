/**
 * Supreme QA Gatekeeper for the MyAvatar MCP pipeline.
 *
 * Wraps every sub-agent tool so its first pass is NEVER streamed raw to the user.
 * The Main Orchestrator (this wrapper) critiques each ToolResult; on a confident
 * failure signal it feeds a critique note back into the tool and re-runs
 * (iterate-before-display), up to `maxIterations`. Successful results return
 * immediately — we never re-run expensive, already-valid work.
 *
 * Mirrors lib/orchestrator/reflection.ts (the unit-tested reference engine);
 * specialized here for the MCP ToolResult contract.
 */

import type { ToolDef, ToolResult } from './tools.js';

interface Critique {
  ok: boolean;
  issues: string[];
}

/** Conservative critique of a tool result — flags only confident failures. */
function critiqueResult(r: ToolResult): Critique {
  const issues: string[] = [];
  if (r.isError) issues.push('sub-agent returned a structured error');
  const text = (r.content ?? []).map((c) => c.text).join('\n').trim();
  if (text.length === 0) issues.push('empty result');
  if (/\b(unauthorized|forbidden|internal server error)\b/i.test(text)) issues.push('permission/server failure');
  if (/"status"\s*:\s*"failed"/i.test(text)) issues.push('pipeline reported failed status');
  const opens = (text.match(/[{[]/g) ?? []).length;
  const closes = (text.match(/[}\]]/g) ?? []).length;
  if (opens !== closes) issues.push('incomplete structured output');
  return { ok: issues.length === 0, issues };
}

export function withGatekeeper(def: ToolDef, maxIterations = 3): ToolDef {
  const max = Math.max(1, Math.min(6, maxIterations));
  return {
    ...def,
    handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
      let last: ToolResult = { content: [{ type: 'text', text: '' }], isError: true };
      let note: string | null = null;
      for (let iteration = 1; iteration <= max; iteration++) {
        const passArgs = note ? { ...args, _critique: note, _iteration: iteration } : args;
        last = await def.handler(passArgs);
        const c = critiqueResult(last);
        if (c.ok) {
          // Accepted by the gatekeeper — annotate for transparency and return.
          if (iteration > 1) {
            last = {
              ...last,
              content: [
                ...last.content,
                { type: 'text', text: `\n[gatekeeper] accepted after ${iteration} pass(es).` },
              ],
            };
          }
          return last;
        }
        if (iteration >= max) break;
        note = `Refine before returning — address: ${c.issues.join('; ')}.`;
      }
      // Exhausted iterations without passing — surface honestly as an error.
      return {
        content: [
          ...last.content,
          { type: 'text', text: `\n[gatekeeper] did not pass QA after ${max} pass(es); returning best effort.` },
        ],
        isError: true,
      };
    },
  };
}
