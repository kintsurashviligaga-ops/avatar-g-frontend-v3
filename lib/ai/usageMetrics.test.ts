/** @jest-environment node */
import { callUsageOf, newRunMeter } from './usageMetrics';
import { estimateCost } from '../services/billing/costModel';

describe('callUsageOf — one call, as Gemini reported it', () => {
  test('thinking is billed as output (the REST candidates count leaves it out); cache hits are a subset of the prompt', () => {
    const u = callUsageOf({ model: 'gemini-2.5-flash', tokensIn: 2000, tokensOut: 100, tokensThinking: 300, tokensCached: 1500, latencyMs: 900 }, { input: 1, output: 1 });
    expect(u).toMatchObject({ tokensIn: 2000, tokensOut: 400, tokensCached: 1500, tokensThinking: 300, latencyMs: 900 });
    expect(u.costUsd).toBe(estimateCost({ service: 'chat', model: 'gemini-2.5-flash', inputTokens: 2000, outputTokens: 400, cachedInputTokens: 1500 }).estimatedCost);
  });

  test('a cache hit makes the same call cheaper', () => {
    const cold = callUsageOf({ model: 'gemini-2.5-flash', tokensIn: 50_000, tokensOut: 200 }, { input: 0, output: 0 });
    const warm = callUsageOf({ model: 'gemini-2.5-flash', tokensIn: 50_000, tokensOut: 200, tokensCached: 40_000 }, { input: 0, output: 0 });
    expect(warm.costUsd).toBeLessThan(cold.costUsd);
  });

  test('a total larger than prompt + output counts the rest as output; cache hits never exceed the prompt', () => {
    const u = callUsageOf({ model: 'gemini-2.5-flash', tokensIn: 100, tokensOut: 10, tokensTotal: 160, tokensCached: 999 }, { input: 0, output: 0 });
    expect(u).toMatchObject({ tokensOut: 60, tokensCached: 100 });
  });

  test('no usage reported: characters stand in (≈4 per token), so a call is never free; garbage counts read as 0', () => {
    const u = callUsageOf({ model: 'gemini-2.5-flash', tokensIn: Number.NaN, tokensOut: -5, latencyMs: Infinity }, { input: 401, output: 40 });
    expect(u).toMatchObject({ tokensIn: 101, tokensOut: 10, tokensCached: 0, latencyMs: 0 });
    expect(u.costUsd).toBeGreaterThan(0);
  });
});

describe('newRunMeter — one Agent G run', () => {
  test('sums calls and tools, the cache hit ratio and the models in first-use order', () => {
    let clock = 1000;
    const m = newRunMeter(() => clock);
    m.addLlm(callUsageOf({ model: 'gemini-2.5-flash', tokensIn: 1000, tokensOut: 50, latencyMs: 300 }, { input: 0, output: 0 }));
    m.addTool(120);
    m.addLlm(callUsageOf({ model: 'gemini-2.5-flash', tokensIn: 1600, tokensOut: 70, tokensCached: 1024, latencyMs: 200 }, { input: 0, output: 0 }));
    m.addTool(Number.NaN);
    clock = 1900;
    const r = m.finish();
    expect(r).toMatchObject({
      llmCalls: 2, tokensIn: 2600, tokensOut: 120, tokensCached: 1024, cacheHitRatio: 0.394,
      llmMs: 500, toolCalls: 2, toolMs: 120, totalMs: 900, models: ['gemini-2.5-flash'],
    });
    expect(r.costUsd).toBeGreaterThan(0);
  });

  test('a run that never reached the model reports zeros, not NaN', () => {
    expect(newRunMeter(() => 5).finish()).toEqual({
      llmCalls: 0, tokensIn: 0, tokensOut: 0, tokensCached: 0, tokensThinking: 0, cacheHitRatio: 0,
      llmMs: 0, toolCalls: 0, toolMs: 0, totalMs: 0, costUsd: 0, models: [],
    });
  });
});
