/**
 * ReAct coordinator — STEP 3 core (the autonomous agent's brain).
 *
 * A framework-free Thought→Action→Observation loop. The LLM is INJECTED (`llm`), so the whole
 * control flow is unit-testable at $0 with a scripted mock — no live provider needed. The
 * production binding (./bindLiveAgent) wires `llm` to the proven-live llmText chain and `tools`
 * to the real tool registry (scrape_webpage / web_search / prepare_instagram_post / orchestrate_media).
 *
 * Protocol: each turn the model returns ONE JSON object, either
 *   {"thought": "...", "action": {"tool": "web_search", "input": {...}}}
 * or a terminal
 *   {"thought": "...", "final": "the answer for the user"}
 * The loop is ALWAYS bounded (maxSteps) and ALWAYS terminal (final | max_steps | llm_error) —
 * it can never hang or loop forever.
 */

export interface AgentTool {
  name: string;
  description: string;
  /** Execute the tool. Should be fail-soft (return an error value rather than throw). */
  run: (input: unknown) => Promise<unknown> | unknown;
}

export type ParsedTurn =
  | { kind: 'action'; thought?: string; tool: string; input: unknown }
  | { kind: 'final'; thought?: string; answer: string }
  | { kind: 'unparseable'; raw: string };

export interface ReActStep {
  thought?: string;
  tool?: string;
  input?: unknown;
  observation?: unknown;
  final?: string;
}

export type StopReason = 'final' | 'max_steps' | 'llm_error';

export interface ReActResult {
  answer: string | null;
  steps: ReActStep[];
  stopReason: StopReason;
}

export const DEFAULT_MAX_STEPS = 6;

/** Extract the first balanced top-level JSON object from arbitrary model text. Pure. */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Parse one model turn into an action / final / unparseable. Pure. */
export function parseAgentTurn(text: string): ParsedTurn {
  const raw = (text ?? '').trim();
  const json = extractJsonObject(raw);
  if (json) {
    try {
      const obj = JSON.parse(json) as Record<string, unknown>;
      const thought = typeof obj.thought === 'string' ? obj.thought : undefined;
      if (typeof obj.final === 'string' && obj.final.trim()) {
        return { kind: 'final', thought, answer: obj.final.trim() };
      }
      const action = obj.action as { tool?: unknown; input?: unknown } | undefined;
      if (action && typeof action.tool === 'string' && action.tool.trim()) {
        return { kind: 'action', thought, tool: action.tool.trim(), input: action.input };
      }
    } catch {
      /* fall through */
    }
  }
  return { kind: 'unparseable', raw };
}

/** A system prompt that teaches the model the tool set + the JSON protocol. Pure. */
export function buildSystemPrompt(tools: AgentTool[], extra?: string): string {
  const toolList = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');
  return [
    'You are MyAvatar, an autonomous marketing-media agent. Work step by step.',
    'On EACH turn reply with ONE JSON object and nothing else.',
    'To use a tool: {"thought": "...", "action": {"tool": "<name>", "input": {...}}}',
    'When you can answer the user, finish: {"thought": "...", "final": "<answer>"}',
    'Never invent tool results — only use observations you actually receive.',
    'Publishing to social networks is prepare-only; you never post on the user\'s behalf.',
    '',
    'Available tools:',
    toolList,
    extra ? `\n${extra}` : '',
  ].join('\n');
}

export interface ReActLoopOpts {
  /** Injected LLM: takes the running transcript, returns the next raw turn (or null on failure). */
  llm: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) => Promise<string | null>;
  tools: AgentTool[];
  userGoal: string;
  maxSteps?: number;
  systemExtra?: string;
}

/**
 * Run the bounded ReAct loop. ALWAYS terminates with a StopReason; tool errors become
 * observations (the model can recover) rather than throwing out of the loop.
 */
export async function runReActLoop(opts: ReActLoopOpts): Promise<ReActResult> {
  const maxSteps = Math.max(1, opts.maxSteps ?? DEFAULT_MAX_STEPS);
  const registry = new Map(opts.tools.map((t) => [t.name, t]));
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: buildSystemPrompt(opts.tools, opts.systemExtra) },
    { role: 'user', content: opts.userGoal },
  ];
  const steps: ReActStep[] = [];

  for (let i = 0; i < maxSteps; i++) {
    const text = await opts.llm(messages);
    if (text == null) return { answer: null, steps, stopReason: 'llm_error' };
    const turn = parseAgentTurn(text);

    if (turn.kind === 'final') {
      steps.push({ thought: turn.thought, final: turn.answer });
      return { answer: turn.answer, steps, stopReason: 'final' };
    }
    if (turn.kind === 'unparseable') {
      // Model broke protocol — treat its prose as the final answer (graceful degrade).
      steps.push({ final: turn.raw });
      return { answer: turn.raw, steps, stopReason: 'final' };
    }

    // action
    const tool = registry.get(turn.tool);
    let observation: unknown;
    if (!tool) {
      observation = { error: `unknown tool: ${turn.tool}`, availableTools: [...registry.keys()] };
    } else {
      try {
        observation = await tool.run(turn.input);
      } catch (err) {
        observation = { error: err instanceof Error ? err.message : String(err) };
      }
    }
    steps.push({ thought: turn.thought, tool: turn.tool, input: turn.input, observation });
    messages.push({ role: 'assistant', content: text });
    messages.push({ role: 'user', content: `Observation: ${JSON.stringify(observation).slice(0, 4000)}` });
  }

  return { answer: null, steps, stopReason: 'max_steps' };
}
