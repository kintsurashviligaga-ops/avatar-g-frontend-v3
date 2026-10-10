/** @jest-environment node */
/**
 * The registry as Gemini function declarations, and a model's calls answered through bindTools — offline, from a
 * recorded response shape. No network and no model: what the model is told is generated from the schemas the server
 * parses with, and what it asks for is checked by the same parse.
 */
import { z } from 'zod';
import { LIVE_TOOL_SPECS } from '@/lib/agent/react/bindLiveAgent';
import { CONFIRMED_ACTIONS, bindTools, defineTool } from './registry';
import {
  answerFunctionCalls, callDeclaredTool, functionCallsOf, functionResponseParts, geminiSchemaOf, toolDeclarations,
} from './declarations';

describe('the live registry as declarations', () => {
  const decls = toolDeclarations(LIVE_TOOL_SPECS);

  test('one declaration per tool, same names and order, and nothing a model could run on its own', () => {
    expect(decls.map((d) => d.name)).toEqual(LIVE_TOOL_SPECS.map((s) => s.name));
    for (const d of decls) {
      expect(d.name in CONFIRMED_ACTIONS).toBe(false);
      expect(d.description.length).toBeGreaterThan(20);
    }
    for (const s of LIVE_TOOL_SPECS) expect(['read', 'prepare', 'quote']).toContain(s.effect);
  });

  test('web_search: one required string, bounded in words', () => {
    expect(decls.find((d) => d.name === 'web_search')!.parameters).toEqual({
      type: 'OBJECT',
      properties: { query: { type: 'STRING', description: 'At most 400 characters.' } },
      required: ['query'],
    });
  });

  test('quote_montage_to_music: the frame shape is an enum, the length a number through its "30"-reader, both optional', () => {
    const p = decls.find((d) => d.name === 'quote_montage_to_music')!.parameters!;
    expect(p.properties!.aspect).toEqual({ type: 'STRING', enum: ['9:16', '16:9', '1:1'] });
    expect(p.properties!.targetSec).toMatchObject({ type: 'NUMBER', minimum: 0 });
    expect(p.properties!.targetSec!.maximum).toBeGreaterThan(0);
    expect(p.required).toBeUndefined();
  });

  test('prepare_instagram_post: preprocessors and nullish fields keep their inner shape', () => {
    const p = decls.find((d) => d.name === 'prepare_instagram_post')!.parameters!;
    expect(p.required).toEqual(['caption']);
    expect(p.properties!.hashtags).toMatchObject({ type: 'ARRAY', items: { type: 'STRING' } });
    expect(p.properties!.mediaUrl).toMatchObject({ type: 'STRING', nullable: true });
    expect(p.properties!.mediaUrl!.description).toMatch(/URL/);
  });

  test('scrape_webpage: an integer with its bounds', () => {
    const p = decls.find((d) => d.name === 'scrape_webpage')!.parameters!;
    expect(p.properties!.maxChars).toEqual({ type: 'INTEGER', minimum: 0, maximum: 20000 });
    expect(p.required).toEqual(['url']);
  });

  test('the declarations are plain JSON (what a request body carries)', () => {
    expect(JSON.parse(JSON.stringify(decls))).toEqual(decls);
  });

  test('a tool not offered to this request is not declared', () => {
    const ctx = { userId: 'u', files: [], goal: '' } as unknown as Parameters<NonNullable<(typeof LIVE_TOOL_SPECS)[number]['offered']>>[0];
    const names = toolDeclarations(LIVE_TOOL_SPECS, ctx).map((d) => d.name);
    expect(names).toContain('web_search');
    expect(names).not.toContain('quote_montage_to_music');
  });
});

describe('geminiSchemaOf', () => {
  test('booleans, literals, descriptions, defaults', () => {
    expect(geminiSchemaOf(z.object({ on: z.boolean().default(false), kind: z.literal('x'), n: z.number().int().describe('How many.') })))
      .toEqual({ type: 'OBJECT', properties: { on: { type: 'BOOLEAN' }, kind: { type: 'STRING', enum: ['x'] }, n: { type: 'INTEGER', description: 'How many.' } }, required: ['kind', 'n'] });
  });
  test('a type the subset cannot say fails loudly', () => {
    expect(() => geminiSchemaOf(z.object({ when: z.date() }))).toThrow(/ZodDate/);
    expect(() => geminiSchemaOf(z.union([z.string(), z.number()]))).toThrow(/ZodUnion/);
  });
});

describe('a model\'s calls, answered through bindTools', () => {
  type Ctx = { userId: string };
  const ran: string[] = [];
  const specs = [
    defineTool<Ctx, z.ZodObject<{ query: z.ZodString }>>({
      name: 'web_search', effect: 'read', description: 'Search the web for public facts.',
      input: z.object({ query: z.string().trim().min(1).max(400) }), limit: 2,
      run: async ({ query }) => { ran.push(query); return { answer: `about ${query}` }; },
    }),
    defineTool<Ctx, z.ZodObject<Record<string, never>>>({
      name: 'list_nothing', effect: 'read', description: 'Returns a list (a non-object answer).',
      input: z.object({}),
      run: async () => ['a', 'b'],
    }),
  ];
  const tools = bindTools(specs, { userId: 'u1' });

  // The shape a generateContent response carries parallel calls in (ids kept by the API on Vertex and the Developer API).
  const RECORDED = {
    candidates: [{
      content: {
        role: 'model',
        parts: [
          { text: 'Let me look.' },
          { functionCall: { id: 'call-1', name: 'web_search', args: { query: 'Tbilisi weather' } } },
          { functionCall: { id: 'call-2', name: 'montage_run', args: { request: {}, token: 'x' } } },
          { functionCall: { id: 'call-3', name: 'web_search', args: { query: '' } } },
          { functionCall: { name: 'list_nothing', args: {} } },
          { functionCall: { id: 'call-5', name: 'web_search', args: { query: 'one more' } } },
          { functionCall: { id: 'call-6', name: 'web_search', args: { query: 'over the limit' } } },
        ],
      },
    }],
  };

  test('functionCallsOf reads every call in order and skips the text', () => {
    expect(functionCallsOf(RECORDED).map((c) => [c.id ?? null, c.name])).toEqual([
      ['call-1', 'web_search'], ['call-2', 'montage_run'], ['call-3', 'web_search'], [null, 'list_nothing'], ['call-5', 'web_search'], ['call-6', 'web_search'],
    ]);
    expect(functionCallsOf(null)).toEqual([]);
    expect(functionCallsOf({ candidates: [{ content: { parts: [{ functionCall: { name: '' } }] } }] })).toEqual([]);
  });

  test('each call is answered once, by id; a confirmed action, a bad input and a call over the limit are observations', async () => {
    const results = await answerFunctionCalls(tools, functionCallsOf(RECORDED));
    expect(results.map((r) => r.id ?? null)).toEqual(['call-1', 'call-2', 'call-3', null, 'call-5', 'call-6']);
    expect(results[0]!.response).toEqual({ answer: 'about Tbilisi weather' });
    // The model named the user's own Start: it is not a tool, so nothing ran.
    expect(results[1]!.response).toMatchObject({ error: 'unknown_tool' });
    expect(results[2]!.response).toMatchObject({ error: 'invalid_input' });
    expect(results[3]!.response).toEqual({ result: ['a', 'b'] });
    expect(results[4]!.response).toEqual({ answer: 'about one more' });
    expect(results[5]!.response).toMatchObject({ error: 'call_limit' });
    expect(ran).toEqual(['Tbilisi weather', 'one more']);
  });

  test('the answers go back as functionResponse parts with the same ids and names', async () => {
    const r = await callDeclaredTool(tools, { id: 'x1', name: 'list_nothing' });
    expect(functionResponseParts([r])).toEqual([{ functionResponse: { id: 'x1', name: 'list_nothing', response: { result: ['a', 'b'] } } }]);
  });

  test('a tool that throws is an observation too', async () => {
    const boom = [{ name: 'boom', description: 'd', run: () => { throw new Error('kaput'); } }];
    expect(await callDeclaredTool(boom, { name: 'boom' })).toEqual({ name: 'boom', response: { error: 'tool_failed', message: 'kaput' } });
  });
});
