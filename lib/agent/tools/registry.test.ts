/** @jest-environment node */
/**
 * Agent G's tool allowlist (lib/agent/tools/registry): the exact tools the live agent can call and what each may do,
 * pinned; no tool a model can call starts a job or spends credits; a quote names the confirmed action behind it; every
 * input is parsed before a tool runs; limits and failures come back as observations.
 */
jest.mock('server-only', () => ({}));
jest.mock('../../ai/llmText', () => ({ llmText: jest.fn() }));
jest.mock('./googleSearch', () => ({ groundedWebSearch: jest.fn() }));
jest.mock('../../ai/webSearch', () => ({ webSearch: jest.fn() }));

import { z } from 'zod';
import { LIVE_TOOL_SPECS } from '../react/bindLiveAgent';
import { CONFIRMED_ACTIONS, allowlistOf, bindTools, defineTool, type ToolEffect } from './registry';

test('the live allowlist, exactly: three that read or prepare, one that inspects a file, three that quote and lead to a user-confirmed run', () => {
  // Changing this list is a review decision: a new tool lands here with its effect, or not at all.
  expect(allowlistOf(LIVE_TOOL_SPECS)).toEqual({
    web_search: 'read',
    scrape_webpage: 'read',
    prepare_instagram_post: 'prepare',
    quote_montage_to_music: 'quote',
    quote_audio_from_link: 'quote',
    quote_media_edit: 'quote',
    analyze_media: 'inspect',
  });
  expect(LIVE_TOOL_SPECS.find((s) => s.name === 'analyze_media')?.confirms).toBeUndefined();
  expect(LIVE_TOOL_SPECS.filter((s) => s.effect === 'quote').map((s) => s.confirms)).toEqual(['montage_run', 'audio_extract_run', 'media_edit_run']);
  expect(CONFIRMED_ACTIONS.montage_run).toMatchObject({ route: '/api/agent/media/montage', action: 'run', access: 'AGENT_G_MEDIA_EXEC' });
  expect(CONFIRMED_ACTIONS.audio_extract_run).toMatchObject({ route: '/api/agent/media/audio', action: 'run', access: 'AGENT_G_MEDIA_EXEC' });
  expect(CONFIRMED_ACTIONS.media_edit_run).toMatchObject({ route: '/api/agent/media/edit', action: 'run', access: 'AGENT_G_MEDIA_EXEC' });
  expect(Object.keys(CONFIRMED_ACTIONS)).toEqual(['montage_run', 'audio_extract_run', 'media_edit_run']);
  for (const s of LIVE_TOOL_SPECS) expect(s.limit).toBeGreaterThan(0);
});

describe('defineTool refuses what a model must never get', () => {
  const base = { name: 'some_tool', description: 'd', input: z.object({}), run: async () => ({}) };
  test('an effect that executes, publishes or spends', () => {
    for (const effect of ['execute', 'publish', 'spend', 'write']) {
      expect(() => defineTool({ ...base, effect: effect as ToolEffect })).toThrow(/not allowed for a model/);
    }
  });
  test('a quote without its confirmed action, or a confirmed action on anything but a quote', () => {
    expect(() => defineTool({ ...base, effect: 'quote' })).toThrow(/confirmed action/);
    expect(() => defineTool({ ...base, effect: 'quote', confirms: 'delete_everything' as never })).toThrow(/confirmed action/);
    expect(() => defineTool({ ...base, effect: 'read', confirms: 'montage_run' })).toThrow(/only a quote/);
  });
  test('a name a model could confuse, a bad limit, a name twice', () => {
    expect(() => defineTool({ ...base, effect: 'read', name: 'Run Shell' })).toThrow(/not a tool name/);
    expect(() => defineTool({ ...base, effect: 'read', limit: 0 })).toThrow(/bad limit/);
    const t = defineTool({ ...base, effect: 'read' });
    expect(() => bindTools([t, t], {})).toThrow(/twice/);
  });
});

describe('bindTools: parse, count, never throw', () => {
  const echo = defineTool({
    name: 'echo_number',
    effect: 'read',
    description: 'd',
    input: z.object({ n: z.number().int().max(10) }),
    limit: 2,
    offered: (ctx: { on: boolean }) => ctx.on,
    run: async ({ n }) => {
      if (n === 7) throw new Error('boom');
      return { n };
    },
  });

  test('offered only when the request qualifies', () => {
    expect(bindTools([echo], { on: false })).toEqual([]);
    expect(bindTools([echo], { on: true }).map((t) => t.name)).toEqual(['echo_number']);
  });

  test('the tool sees the parsed input only; a bad one is an observation and does not count', async () => {
    const [t] = bindTools([echo], { on: true });
    await expect(t!.run({ n: 99 })).resolves.toMatchObject({ error: 'invalid_input', issues: [expect.stringContaining('n:')] });
    await expect(t!.run(null)).resolves.toMatchObject({ error: 'invalid_input' });
    await expect(t!.run({ n: 3, extra: 'dropped' })).resolves.toEqual({ n: 3 });
    await expect(t!.run({ n: 7 })).resolves.toEqual({ error: 'tool_failed', message: 'boom' });
    await expect(t!.run({ n: 1 })).resolves.toEqual({ error: 'call_limit', message: 'At most 2 echo_number calls per request.' });
  });

  test('limits are per request: a new binding starts at zero', async () => {
    const [a] = bindTools([echo], { on: true });
    await a!.run({ n: 1 });
    await a!.run({ n: 1 });
    const [b] = bindTools([echo], { on: true });
    await expect(b!.run({ n: 1 })).resolves.toEqual({ n: 1 });
  });
});
