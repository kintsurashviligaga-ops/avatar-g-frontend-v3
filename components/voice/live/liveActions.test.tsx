/**
 * The voice-to-action executor: each validated call becomes the window event the app listens for, and is answered
 * at once — ok:true with a summary ONLY when a studio took it (its preventDefault receipt), ok:false otherwise; the
 * canvas gets exactly {title, language, code} and show_code is "saved" only on the canvas's own receipt (no canvas →
 * canvas_unavailable); nothing here can start a render; cards are newest-first, capped at 3,
 * and a toolCallCancellation drops them; a looping model is cut off.
 */
import { act, renderHook } from '@testing-library/react';

import { LIVE_ACTION_EVENT, OPEN_ARTIFACT_EVENT, type LiveActionEventDetail, type OpenArtifactDetail } from '@/lib/voice/liveTools';

import {
  LIVE_ACTIONS_PER_CALL_MAX,
  LIVE_ACTION_CARDS_MAX,
  dispatchLiveAction,
  dispatchOpenArtifact,
  executeLiveToolCall,
  revealLiveAction,
  useLiveActions,
  type LiveActionEnv,
} from './liveActions';

/** `receipt` = a studio took the live-action event; `canvasReceipt` = a canvas took the open-artifact event. */
function spyEnv(receipt = true, canvasReceipt = true) {
  const actions: LiveActionEventDetail[] = [];
  const artifacts: OpenArtifactDetail[] = [];
  const env: LiveActionEnv = {
    dispatchAction: (d) => { actions.push(d); return receipt; },
    openArtifact: (d) => { artifacts.push(d); return canvasReceipt; },
  };
  return { env, actions, artifacts };
}

const call = (id: string, name: string, args: unknown = {}) => ({ id, name, args });

describe('executeLiveToolCall', () => {
  test('prepare_generation: dispatches the typed action; a studio receipt → ok:true, prepare-only summary, a card', () => {
    const { env, actions } = spyEnv(true);
    const out = executeLiveToolCall(call('c1', 'prepare_generation', { tool: 'video', prompt: 'A cat surfing', aspectRatio: '9:16', durationSec: 24 }), env);
    expect(actions).toEqual([{ type: 'prepare_generation', tool: 'video', prompt: 'A cat surfing', aspectRatio: '9:16', durationSec: 24 }]);
    expect(out.response.id).toBe('c1');
    expect(out.response.name).toBe('prepare_generation');
    expect(out.response.response).toMatchObject({ ok: true });
    const summary = String(out.response.response.summary);
    expect(summary).toMatch(/Prepared a video prompt in the Video studio/);
    expect(summary).toMatch(/no credits were spent/);
    expect(summary).toMatch(/Run button/);
    // Honest: the settings are shown, not claimed as applied.
    expect(summary).toMatch(/aspect ratio 9:16, 24 s are shown to the user/);
    expect(out.card).toEqual({ id: 'c1', action: actions[0] });
    expect(out.endCall).toBeUndefined();
  });

  test('no studio on the page (no receipt) → ok:false studio_unavailable, no card — the model never hears "done"', () => {
    const { env } = spyEnv(false);
    for (const c of [call('c1', 'prepare_generation', { tool: 'image', prompt: 'x' }), call('c2', 'open_studio', { tool: 'music' })]) {
      const out = executeLiveToolCall(c, env);
      expect(out.response.response).toMatchObject({ ok: false, error: 'studio_unavailable' });
      expect(out.card).toBeUndefined();
    }
  });

  test('open_studio → ok:true summary + card', () => {
    const { env, actions } = spyEnv(true);
    const out = executeLiveToolCall(call('c1', 'open_studio', { tool: 'avatar' }), env);
    expect(actions).toEqual([{ type: 'open_studio', tool: 'avatar' }]);
    expect(out.response.response).toEqual({ ok: true, summary: 'Opened the Avatar studio. Nothing was started.' });
    expect(out.card?.action).toEqual({ type: 'open_studio', tool: 'avatar' });
  });

  test('show_code → the live-action event AND the canvas event with exactly {title, language, code}', () => {
    // No studio receipt needed: the canvas is what takes code.
    const { env, actions, artifacts } = spyEnv(false, true);
    const out = executeLiveToolCall(call('c9', 'show_code', { title: 'Fib', language: 'py', code: 'def f():\n  pass', extra: 1 }), env);
    expect(actions).toEqual([{ type: 'show_code', title: 'Fib', language: 'python', code: 'def f():\n  pass' }]);
    expect(artifacts).toEqual([{ title: 'Fib', language: 'python', code: 'def f():\n  pass' }]);
    expect(Object.keys(artifacts[0]!).sort()).toEqual(['code', 'language', 'title']);
    expect(out.response.response).toMatchObject({ ok: true });
    // "Saved", never "on screen": the Live dialog covers the canvas for the whole call.
    const summary = String(out.response.response.summary);
    expect(summary).toMatch(/2 lines\) is saved in the code canvas.*Do not read the code aloud/);
    expect(summary).not.toMatch(/screen/);
    expect(out.card?.id).toBe('c9');
  });

  test('show_code with no canvas on the page (no receipt) → ok:false canvas_unavailable, no card — never "it\'s shown"', () => {
    const { env, artifacts } = spyEnv(true, false);
    const out = executeLiveToolCall(call('c10', 'show_code', { title: 'Fib', language: 'python', code: 'pass' }), env);
    expect(artifacts).toHaveLength(1); // it was offered to a canvas; nobody took it
    expect(out.response).toMatchObject({ id: 'c10', name: 'show_code', response: { ok: false, error: 'canvas_unavailable' } });
    expect(String(out.response.response.message)).toMatch(/not shown/);
    expect(out.response.response).not.toHaveProperty('summary');
    expect(out.card).toBeUndefined();
  });

  test('end_call → ok:true goodbye summary, endCall, no card', () => {
    const { env } = spyEnv(true);
    const out = executeLiveToolCall(call('e', 'end_call'), env);
    expect(out.response.response).toMatchObject({ ok: true });
    expect(String(out.response.response.summary)).toMatch(/goodbye/);
    expect(out.endCall).toBe(true);
    expect(out.card).toBeUndefined();
  });

  test('invalid args / unknown tool → a structured ok:false the model can act on; nothing is dispatched', () => {
    const { env, actions, artifacts } = spyEnv(true);
    const bad = executeLiveToolCall(call('b', 'prepare_generation', { tool: 'video', prompt: 'x', aspectRatio: '7:3' }), env);
    expect(bad.response.response).toMatchObject({ ok: false, error: 'invalid_args', field: 'aspectRatio' });
    expect(bad.response.response.allowed).toEqual(['16:9', '9:16', '1:1', '4:5', '3:4', '4:3']);
    expect(Array.isArray(bad.response.response.allowed)).toBe(true); // a plain array: JSON for the toolResponse
    const unknown = executeLiveToolCall(call('u', 'start_render', { tool: 'video' }), env);
    expect(unknown.response).toMatchObject({ id: 'u', name: 'start_render', response: { ok: false, error: 'unknown_tool' } });
    expect(actions).toEqual([]);
    expect(artifacts).toEqual([]);
  });

  test('a call without an id still gets an answer; its card takes the local id', () => {
    const { env } = spyEnv(true);
    const out = executeLiveToolCall({ id: '', name: 'open_studio', args: { tool: 'video' } }, env, 'local-7');
    expect(out.response.id).toBe('');
    expect(out.card?.id).toBe('local-7');
  });
});

describe('window events', () => {
  test('myavatar:live-action is cancelable: a listener\'s preventDefault() is the receipt', () => {
    const seen: unknown[] = [];
    const take = (e: Event) => { seen.push((e as CustomEvent).detail); e.preventDefault(); };
    expect(dispatchLiveAction({ type: 'open_studio', tool: 'video' })).toBe(false); // nobody listening
    window.addEventListener(LIVE_ACTION_EVENT, take);
    try {
      expect(dispatchLiveAction({ type: 'open_studio', tool: 'video' })).toBe(true);
      expect(seen).toEqual([{ type: 'open_studio', tool: 'video' }]);
    } finally {
      window.removeEventListener(LIVE_ACTION_EVENT, take);
    }
  });

  test('a throwing listener never breaks the call', () => {
    const boom = () => { throw new Error('listener bug'); };
    window.addEventListener(LIVE_ACTION_EVENT, boom);
    const onError = (e: ErrorEvent) => e.preventDefault(); // jsdom reports listener errors on window
    window.addEventListener('error', onError);
    try {
      expect(() => dispatchLiveAction({ type: 'end_call' })).not.toThrow();
    } finally {
      window.removeEventListener(LIVE_ACTION_EVENT, boom);
      window.removeEventListener('error', onError);
    }
  });

  test('myavatar:open-artifact is cancelable: a canvas\'s preventDefault() is the receipt', () => {
    const detail: OpenArtifactDetail = { title: 'T', language: 'svg', code: '<svg/>' };
    expect(dispatchOpenArtifact(detail)).toBe(false); // no canvas on the page
    const looks = () => {}; // a listener that does not take it is not a receipt either
    const take = (e: Event) => e.preventDefault();
    window.addEventListener(OPEN_ARTIFACT_EVENT, looks);
    try {
      expect(dispatchOpenArtifact(detail)).toBe(false);
      window.addEventListener(OPEN_ARTIFACT_EVENT, take);
      expect(dispatchOpenArtifact(detail)).toBe(true);
    } finally {
      window.removeEventListener(OPEN_ARTIFACT_EVENT, looks);
      window.removeEventListener(OPEN_ARTIFACT_EVENT, take);
    }
  });

  test('myavatar:open-artifact carries exactly {title, language, code}', () => {
    const got: unknown[] = [];
    const on = (e: Event) => got.push((e as CustomEvent).detail);
    window.addEventListener(OPEN_ARTIFACT_EVENT, on);
    try {
      dispatchOpenArtifact({ title: 'T', language: 'go', code: 'package main', extra: 'x' } as OpenArtifactDetail);
      expect(got).toEqual([{ title: 'T', language: 'go', code: 'package main' }]);
    } finally {
      window.removeEventListener(OPEN_ARTIFACT_EVENT, on);
    }
  });

  test('revealLiveAction: studio actions re-dispatch with reveal:true; code re-opens the canvas', () => {
    const { env, actions, artifacts } = spyEnv(true);
    revealLiveAction({ type: 'prepare_generation', tool: 'music', prompt: 'lo-fi beat' }, env);
    revealLiveAction({ type: 'show_code', title: 'T', language: 'css', code: 'a{}' }, env);
    expect(actions).toEqual([{ type: 'prepare_generation', tool: 'music', prompt: 'lo-fi beat', reveal: true }]);
    expect(artifacts).toEqual([{ title: 'T', language: 'css', code: 'a{}' }]);
  });
});

describe('useLiveActions', () => {
  test('answers every call in order; cards newest first, capped at 3; cancellation drops them; end_call flags', () => {
    const { env } = spyEnv(true);
    const { result } = renderHook(() => useLiveActions(env));
    let responses: ReturnType<typeof result.current.onToolCall> = [];
    act(() => {
      responses = result.current.onToolCall([
        call('a', 'open_studio', { tool: 'video' }),
        call('b', 'prepare_generation', { tool: 'image', prompt: 'p' }),
        call('x', 'nope'),
      ]);
    });
    expect(responses.map((r) => [r.id, r.response.ok])).toEqual([['a', true], ['b', true], ['x', false]]);
    expect(result.current.cards.map((c) => c.id)).toEqual(['b', 'a']);

    act(() => { result.current.onToolCall([call('c', 'open_studio', { tool: 'music' }), call('d', 'show_code', { title: 't', language: 'go', code: 'x' })]); });
    expect(result.current.cards.map((c) => c.id)).toEqual(['d', 'c', 'b']);
    expect(result.current.cards).toHaveLength(LIVE_ACTION_CARDS_MAX);

    act(() => result.current.onToolCallCancellation(['c', 'zzz']));
    expect(result.current.cards.map((c) => c.id)).toEqual(['d', 'b']);

    expect(result.current.endRequested).toBe(false);
    act(() => { result.current.onToolCall([call('e', 'end_call')]); });
    expect(result.current.endRequested).toBe(true);
  });

  test('a model looping on functions is cut off after the per-call budget (answered, not executed)', () => {
    const { env, actions } = spyEnv(true);
    const { result } = renderHook(() => useLiveActions(env));
    const calls = Array.from({ length: LIVE_ACTIONS_PER_CALL_MAX + 5 }, (_, i) => call(`c${i}`, 'open_studio', { tool: 'video' }));
    let responses: ReturnType<typeof result.current.onToolCall> = [];
    act(() => { responses = result.current.onToolCall(calls); });
    expect(responses).toHaveLength(calls.length);
    expect(actions).toHaveLength(LIVE_ACTIONS_PER_CALL_MAX);
    expect(responses[responses.length - 1]!.response).toMatchObject({ ok: false, error: 'too_many_actions' });
    expect(responses[responses.length - 1]!.id).toBe(`c${calls.length - 1}`);
  });
});
