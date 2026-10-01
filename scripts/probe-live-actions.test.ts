/** @jest-environment node */
/**
 * The Live-actions probe (scripts/probe-live-actions.mjs) is only worth running if it asks Google about the SAME locks
 * the mint route sends. These pin its mirrored setup builder to the real buildLiveSetup, its model list to LIVE_MODELS,
 * and its safety defaults: importing it runs nothing, no billable turn without --turn, secrets never survive printing.
 * Nothing here touches the network.
 */
import { buildLiveSetup } from '@/lib/voice/geminiLive';
import { LIVE_MODELS } from '@/lib/ai/google/models';
import { LIVE_ACTIONS_RULE } from '@/lib/voice/liveTools';

import {
  PROBE_INSTRUCTION,
  PROBE_LANGUAGE_CODE,
  PROBE_LIVE_MODELS,
  PROBE_TURN_TEXT,
  PROBE_VOICE,
  buildProbeVariants,
  parseProbeArgs,
  probeModel,
  probeToolResponse,
  scrub,
} from './probe-live-actions.mjs';

type Frame = { setup: Record<string, unknown> };
const variant = (name: string, model: string, search: boolean): Frame =>
  (buildProbeVariants({ model, search }) as Array<{ name: string; frame: Frame }>).find((v) => v.name === name)!.frame;

describe('the probe asks about the locks the route actually mints', () => {
  for (const model of ['gemini-2.5-flash-native-audio-latest', 'gemini-3.1-flash-live-preview']) {
    for (const search of [false, true]) {
      test(`${model}, search ${search ? 'on' : 'off'}: full / actions-dropped / no-tools === buildLiveSetup`, () => {
        const parity = { model, voiceName: PROBE_VOICE, transcribe: true, languageCode: PROBE_LANGUAGE_CODE, compression: true, resumptionHandle: null };
        const searchTool = search ? (['google_search'] as const) : [];
        expect(variant('full', model, search)).toEqual(buildLiveSetup({
          ...parity, systemInstruction: `${PROBE_INSTRUCTION} ${LIVE_ACTIONS_RULE}`, tools: ['live_actions', ...searchTool],
        }));
        expect(variant('actions-dropped', model, search)).toEqual(buildLiveSetup({
          ...parity, systemInstruction: PROBE_INSTRUCTION, ...(search ? { tools: ['google_search'] } : {}),
        }));
        // The `tools: false` retry: the legacy wire — no captions, resumption, compression or tools of any kind.
        expect(variant('no-tools', model, search)).toEqual(buildLiveSetup({ model, voiceName: PROBE_VOICE, systemInstruction: PROBE_INSTRUCTION }));
      });
    }
  }

  test('only the full lock declares functions and carries the actions paragraph (the route rule)', () => {
    const variants = buildProbeVariants({ model: PROBE_LIVE_MODELS[0], search: true }) as Array<{ name: string; declares: boolean; frame: Frame }>;
    expect(variants.map((v) => [v.name, v.declares])).toEqual([['full', true], ['actions-dropped', false], ['no-tools', false]]);
    for (const v of variants) {
      const text = JSON.stringify(v.frame);
      expect(text.includes('functionDeclarations')).toBe(v.declares);
      expect(text.includes(JSON.stringify(LIVE_ACTIONS_RULE).slice(1, -1))).toBe(v.declares);
    }
  });

  test('its model list is the allowlist (lib/ai/google/models.ts LIVE_MODELS), default first', () => {
    expect([...PROBE_LIVE_MODELS]).toEqual([...LIVE_MODELS]);
    expect(probeModel(null, undefined)).toBe(LIVE_MODELS[0]);
    expect(probeModel(null, 'models/gemini-3.8-live')).toBe('gemini-3.8-live');
    expect(probeModel(null, 'gemini-9-imaginary')).toBe(LIVE_MODELS[0]);
  });
});

describe('safe by default', () => {
  test('loading the probe runs nothing (main only runs as `node scripts/probe-live-actions.mjs`)', () => {
    const realFetch = global.fetch;
    const fetchSpy = jest.fn(() => Promise.reject(new Error('the probe must not call the network in a test')));
    // main() would parse jest's own argv, refuse it and exit synchronously — so a run is caught right here.
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    (global as { fetch: unknown }).fetch = fetchSpy;
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('./probe-live-actions.mjs');
      });
      expect(exitSpy).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      (global as { fetch: unknown }).fetch = realFetch;
      exitSpy.mockRestore();
    }
  });

  test('no billable turn unless --turn; a typo is an error, never a silent "probe everything"', () => {
    expect(parseProbeArgs([])).toEqual({ turn: false, search: false, dry: false, only: null, model: null, help: false });
    expect(parseProbeArgs(['--turn'])).toMatchObject({ turn: true });
    expect(parseProbeArgs(['--onyl', 'full'])).toEqual({ error: 'unknown argument: --onyl' });
    expect(parseProbeArgs(['--only', 'everything'])).toHaveProperty('error');
    expect(parseProbeArgs(['--only'])).toHaveProperty('error');
    expect(parseProbeArgs(['--model', 'gemini-1.5-pro'])).toHaveProperty('error');
    expect(parseProbeArgs(['--model', 'models/gemini-3.8-live'])).toMatchObject({ model: 'gemini-3.8-live' });
    expect(parseProbeArgs(['--turn', '--only', 'no-tools'])).toHaveProperty('error');
    expect(parseProbeArgs(['--turn', '--only', 'full'])).toMatchObject({ turn: true, only: 'full' });
  });

  test('scrub removes the key and the tokens (raw and URL-encoded) and bounds the text', () => {
    const key = 'AQ.secret-key/with+chars';
    const token = 'auth_tokens/abc=';
    const out = scrub(`bad key ${key} in wss://x?access_token=${encodeURIComponent(token)} and ${token}`, [key, token, '']);
    expect(out).not.toContain(key);
    expect(out).not.toContain(token);
    expect(out).not.toContain(encodeURIComponent(token));
    expect(out).toContain('[redacted]');
    expect(scrub('x'.repeat(1000), []).length).toBeLessThanOrEqual(301);
  });

  test('the turn is answered like the browser executor: prepare-only on a valid call, the error code on a bad one', () => {
    expect(PROBE_TURN_TEXT).toMatch(/video/);
    const good = probeToolResponse({ id: 'c1', name: 'prepare_generation', args: { tool: 'video', prompt: 'A cat surfing', aspectRatio: '9:16' } });
    expect(good).toMatchObject({ id: 'c1', name: 'prepare_generation', response: { ok: true } });
    expect(String(good.response.summary)).toMatch(/no credits were spent/);
    const bad = probeToolResponse({ id: 'c2', name: 'prepare_generation', args: { tool: 'hologram', prompt: 'x' } });
    expect(bad.response).toMatchObject({ ok: false, error: 'invalid_args' });
    expect(probeToolResponse({ id: 'c3', name: 'start_render', args: {} }).response).toMatchObject({ ok: false, error: 'unknown_tool' });
  });
});
