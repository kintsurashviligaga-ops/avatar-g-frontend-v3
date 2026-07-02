import {
  extractJsonObject,
  parseAgentTurn,
  runReActLoop,
  type AgentTool,
} from './coordinator';

/** A mock LLM that replays a fixed script of turns, ignoring the transcript. */
function scriptedLlm(turns: string[]) {
  let i = 0;
  return async () => (i < turns.length ? turns[i++] : null);
}

const searchTool: AgentTool = {
  name: 'web_search',
  description: 'search',
  run: async (input) => ({ results: [`hit for ${(input as { query?: string })?.query}`] }),
};

describe('ReAct coordinator (STEP 3 core, injected LLM, $0)', () => {
  it('extractJsonObject pulls a balanced object out of fenced/prose text', () => {
    expect(extractJsonObject('prefix ```json\n{"a":{"b":1}}\n``` suffix')).toBe('{"a":{"b":1}}');
    expect(extractJsonObject('no json here')).toBeNull();
    expect(extractJsonObject('{"s":"a } b"}')).toBe('{"s":"a } b"}'); // brace inside string ignored
  });

  it('parseAgentTurn distinguishes action / final / unparseable', () => {
    expect(parseAgentTurn('{"action":{"tool":"web_search","input":{"query":"x"}}}')).toMatchObject({ kind: 'action', tool: 'web_search' });
    expect(parseAgentTurn('{"final":"done"}')).toMatchObject({ kind: 'final', answer: 'done' });
    expect(parseAgentTurn('just prose')).toMatchObject({ kind: 'unparseable' });
  });

  it('runs a tool then finalizes (happy path)', async () => {
    const r = await runReActLoop({
      llm: scriptedLlm([
        '{"thought":"look it up","action":{"tool":"web_search","input":{"query":"tbilisi"}}}',
        '{"final":"Tbilisi is the capital."}',
      ]),
      tools: [searchTool],
      userGoal: 'capital of Georgia?',
    });
    expect(r.stopReason).toBe('final');
    expect(r.answer).toBe('Tbilisi is the capital.');
    expect(r.steps[0].tool).toBe('web_search');
    expect(r.steps[0].observation).toMatchObject({ results: ['hit for tbilisi'] });
  });

  it('stops at maxSteps when the model never finalizes', async () => {
    const r = await runReActLoop({
      llm: async () => '{"action":{"tool":"web_search","input":{"query":"loop"}}}',
      tools: [searchTool],
      userGoal: 'go forever',
      maxSteps: 3,
    });
    expect(r.stopReason).toBe('max_steps');
    expect(r.answer).toBeNull();
    expect(r.steps).toHaveLength(3);
  });

  it('turns an unknown tool into an observation and keeps going', async () => {
    const r = await runReActLoop({
      llm: scriptedLlm([
        '{"action":{"tool":"nope","input":{}}}',
        '{"final":"recovered"}',
      ]),
      tools: [searchTool],
      userGoal: 'x',
    });
    expect(r.steps[0].observation).toMatchObject({ error: 'unknown tool: nope' });
    expect(r.answer).toBe('recovered');
  });

  it('a throwing tool becomes an observation, not a crash', async () => {
    const boom: AgentTool = { name: 'boom', description: 'x', run: () => { throw new Error('kaboom'); } };
    const r = await runReActLoop({
      llm: scriptedLlm(['{"action":{"tool":"boom","input":{}}}', '{"final":"ok"}']),
      tools: [boom],
      userGoal: 'x',
    });
    expect(r.steps[0].observation).toMatchObject({ error: 'kaboom' });
    expect(r.stopReason).toBe('final');
  });

  it('reports llm_error when the provider returns null', async () => {
    const r = await runReActLoop({ llm: async () => null, tools: [searchTool], userGoal: 'x' });
    expect(r.stopReason).toBe('llm_error');
    expect(r.answer).toBeNull();
  });
});
