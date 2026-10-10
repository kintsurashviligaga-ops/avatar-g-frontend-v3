/**
 * Agent G Master Task PART 4 — a voice start runs on the USER'S OWN yes, never the model's word.
 *
 * The executor (at the model's call): no transcript → no start; a price never told in this call, or a screen that
 * changed since it was told, refuses; a "no"/"wait" said after the price or plan refuses; Agent G's plans start by the
 * call's own number (the model never names a card). The hook (when the countdown ends): it runs only when the words
 * said after the price or plan were a clear yes — a studio render's yes is recorded on the server first — and anything
 * else starts nothing and tells the model with an [App] note. A "wait" during the countdown stops it at once.
 */
import { act, renderHook } from '@testing-library/react';

import type { LiveActionEventDetail, LiveRunDetail, LiveStudioReply } from '@/lib/voice/liveTools';
import { createVoiceLedger } from '@/lib/voice/voiceLedger';

import { executeLiveToolCall, fetchApproval, useLiveActions, type LiveActionEnv } from './liveActions';

const call = (id: string, name: string, args: unknown = {}) => ({ id, name, args });

/** A studio that answers each action with `reply(d)`; a ledger on a clock the test moves. */
function gateEnv(reply: (d: LiveActionEventDetail) => LiveStudioReply | undefined, receipt = true) {
  const actions: LiveActionEventDetail[] = [];
  let t = 1000;
  const voice = createVoiceLedger(() => t);
  const env: LiveActionEnv = {
    dispatchAction: (d) => { actions.push(d); const r = reply(d); if (r) d.reply = r; return receipt; },
    openArtifact: () => true,
    runGeneration: jest.fn(() => true),
    voice,
  };
  const say = (text: string) => { t += 100; voice.hear({ text }); voice.hear({ end: true }); };
  return { env, actions, voice, say, tick: (ms = 100) => { t += ms; } };
}

describe('start_generation: the price was told, and the user has not said no since', () => {
  const studio = (fp = 'image|a red fox|2') => (d: LiveActionEventDetail): LiveStudioReply | undefined =>
    (d.type === 'prepare_generation' || d.type === 'start_generation' || d.type === 'get_screen_state'
      ? { ok: true, tool: 'image', priceCredits: 2, fingerprint: fp } : undefined);

  it('no transcript on this host → no start, and the studio is never asked', () => {
    const g = gateEnv(studio());
    const out = executeLiveToolCall(call('s', 'start_generation', { confirmed: 'yes' }), { ...g.env, voice: undefined });
    expect(out.response.response).toMatchObject({ ok: false, error: 'no_transcript' });
    expect(out.run).toBeUndefined();
    expect(g.actions).toEqual([]);
  });

  it('a price never told in this call refuses (the model is sent to read it and ask)', () => {
    const g = gateEnv(studio());
    const out = executeLiveToolCall(call('s', 'start_generation', { confirmed: 'yes' }), g.env);
    expect(out.response.response).toMatchObject({ ok: false, error: 'price_not_told' });
    expect(String(out.response.response.message)).toMatch(/get_screen_state, tell them the price, and ask/);
    expect(out.run).toBeUndefined();
  });

  it('V5: what is on screen changed after the price was told → nothing starts until it is told again', () => {
    let fp = 'image|a red fox|2';
    const g = gateEnv((d) => studio(fp)(d));
    executeLiveToolCall(call('p', 'prepare_generation', { tool: 'image', prompt: 'a red fox' }), g.env);
    g.say('yes');
    fp = 'image|a red fox, neon|4'; // the user edited the prompt by hand; the price changed
    const out = executeLiveToolCall(call('s', 'start_generation', { confirmed: 'yes' }), g.env);
    expect(out.response.response).toMatchObject({ ok: false, error: 'changed_since_price' });
    // Reading the screen again re-quotes (it changed), and a yes after THAT counts.
    executeLiveToolCall(call('g', 'get_screen_state'), g.env);
    g.say('ok, go');
    const again = executeLiveToolCall(call('s2', 'start_generation', { confirmed: 'yes' }), g.env);
    expect(again.run).toMatchObject({ target: { kind: 'studio', tool: 'image', fingerprint: 'image|a red fox, neon|4' } });
  });

  it('a "wait" after the price refuses with the user\'s words; a "no" said BEFORE the price does not count', () => {
    const g = gateEnv(studio());
    g.say('no, a fox, not a dog'); // before the price: about the prompt, not the start
    g.tick();
    executeLiveToolCall(call('p', 'prepare_generation', { tool: 'image', prompt: 'a red fox' }), g.env);
    const ok = executeLiveToolCall(call('s', 'start_generation', { confirmed: 'yes' }), g.env);
    expect(ok.run).toMatchObject({ tool: 'image', priceCredits: 2, since: g.voice.studioQuote().at });
    g.say('wait, not yet');
    const no = executeLiveToolCall(call('s2', 'start_generation', { confirmed: 'yes' }), g.env);
    expect(no.response.response).toMatchObject({ ok: false, error: 'user_said_no' });
    expect(String(no.response.response.message)).toMatch(/"wait, not yet"/);
    expect(no.run).toBeUndefined();
  });

  it('the screen read the rule asks for before a start never voids a yes said just before it', () => {
    const g = gateEnv(studio());
    executeLiveToolCall(call('p', 'prepare_generation', { tool: 'image', prompt: 'a red fox' }), g.env);
    const told = g.voice.studioQuote().at;
    g.say('yes please');
    g.tick();
    executeLiveToolCall(call('g', 'get_screen_state'), g.env); // same screen: the quote time stands
    const out = executeLiveToolCall(call('s', 'start_generation', { confirmed: 'yes' }), g.env);
    expect(out.run?.since).toBe(told);
  });
});

describe('agent_task / extract_audio start: Agent G\'s plans by the call\'s own number', () => {
  const cards = (d: LiveActionEventDetail): LiveStudioReply | undefined => {
    if (d.type === 'agent_task' && d.action === 'start') return { ok: true, priceCredits: 0 };
    if (d.type === 'agent_task' && d.action === 'status') {
      return {
        ok: true,
        plans: [
          { id: 'msg-a', kind: 'audio', phase: 'quoted', what: 'MP3 of talk.mp4, 3:12', credits: 0 },
          { id: 'msg-m', kind: 'montage', phase: 'running', what: '4 clips to song.mp3' },
        ],
        state: { tasks: [{ label: 'Montage', pct: 40 }] },
      };
    }
    if (d.type === 'agent_task' && d.action === 'stop') return { ok: true, message: 'Stopped the montage.' };
    return undefined;
  };

  it('no plan, a plan not yet told, and a "no" since it was told all refuse — the studio never sees a start', () => {
    const g = gateEnv(cards);
    expect(executeLiveToolCall(call('a', 'agent_task', { action: 'start' }), g.env).response.response).toMatchObject({ ok: false, error: 'no_plan' });
    g.voice.registerPlan('msg-a', 'audio');
    expect(executeLiveToolCall(call('b', 'agent_task', { action: 'start', plan: 1 }), g.env).response.response)
      .toMatchObject({ ok: false, error: 'plan_not_told' });
    g.voice.planTold('msg-a');
    g.say('нет, подожди');
    expect(executeLiveToolCall(call('c', 'agent_task', { action: 'start', plan: 1 }), g.env).response.response)
      .toMatchObject({ ok: false, error: 'user_said_no' });
    expect(executeLiveToolCall(call('d', 'agent_task', { action: 'start', plan: 5 }), g.env).response.response)
      .toMatchObject({ ok: false, error: 'no_plan' });
    expect(g.actions).toEqual([]);
  });

  it('a told plan: the studio checks the card it resolved, and a countdown starts with the plan\'s told time', () => {
    const g = gateEnv(cards);
    g.voice.registerPlan('msg-a', 'audio', 'MP3 of talk.mp4');
    g.voice.planTold('msg-a');
    const told = g.voice.plan(1)!.at;
    g.say('კი, დაიწყე');
    const out = executeLiveToolCall(call('s', 'agent_task', { action: 'start', plan: 1 }), g.env);
    expect(g.actions).toEqual([expect.objectContaining({ type: 'agent_task', action: 'start', plan: 1, planId: 'msg-a', planKind: 'audio' })]);
    expect(out.run).toEqual({ tool: 'audio', priceCredits: 0, target: { kind: 'agent', planId: 'msg-a', planKind: 'audio' }, since: told });
    expect(String(out.response.response.summary)).toMatch(/Plan 1 \(MP3\) starts in 3 seconds[\s\S]*It is free/);
    expect(g.env.runGeneration).not.toHaveBeenCalled();
  });

  it('extract_audio start is the newest MP3 plan (a newer montage plan is not it); a studio refusal passes through', () => {
    const g = gateEnv((d) => (d.type === 'agent_task' && d.planId === 'msg-a2' ? { ok: false, error: 'not_quoted', message: 'That plan already ran.' } : cards(d)));
    g.voice.registerPlan('msg-a1', 'audio'); g.voice.planTold('msg-a1');
    g.voice.registerPlan('msg-a2', 'audio'); g.voice.planTold('msg-a2');
    g.voice.registerPlan('msg-m', 'montage'); g.voice.planTold('msg-m');
    const out = executeLiveToolCall(call('x', 'extract_audio', { action: 'start', confirmed: 'yes' }), g.env);
    expect(g.actions[0]).toMatchObject({ planId: 'msg-a2', planKind: 'audio' });
    expect(out.response.response).toEqual({ ok: false, error: 'not_quoted', message: 'That plan already ran.' });
    expect(out.run).toBeUndefined();
  });

  it('status numbers the cards for the model and tells the waiting ones; stop cancels a countdown too', () => {
    const g = gateEnv(cards);
    const st = executeLiveToolCall(call('st', 'agent_task', { action: 'status' }), g.env);
    expect(st.response.response).toMatchObject({
      ok: true,
      plans: [
        { plan: 1, kind: 'MP3', phase: 'quoted', what: 'MP3 of talk.mp4, 3:12', credits: 0 },
        { plan: 2, kind: 'montage', phase: 'running', what: '4 clips to song.mp3' },
      ],
      state: { tasks: [{ label: 'Montage', pct: 40 }] },
    });
    expect(g.voice.plan(1)!.at).toBeGreaterThan(0); // listed while it waits for a yes = told
    expect(g.voice.plan(2)!.at).toBe(0); // running: nothing to say yes to

    const stop = executeLiveToolCall(call('sp', 'agent_task', { action: 'stop', plan: 2 }), g.env);
    expect(g.actions[g.actions.length - 1]).toMatchObject({ type: 'agent_task', action: 'stop', plan: 2, planId: 'msg-m', planKind: 'montage' });
    expect(stop).toMatchObject({ response: { response: { ok: true, summary: 'Stopped the montage.' } }, cancelRun: true });
    expect(executeLiveToolCall(call('sx', 'agent_task', { action: 'stop', plan: 9 }), g.env).response.response).toMatchObject({ ok: false, error: 'no_plan' });
    expect(executeLiveToolCall(call('sg', 'stop', { what: 'generation' }), g.env).cancelRun).toBe(true);
    expect(executeLiveToolCall(call('sr', 'stop', { what: 'reply' }), g.env).cancelRun).toBeUndefined();
  });

  it('get_screen_state lists the plans too, numbered', () => {
    const g = gateEnv((d) => (d.type === 'get_screen_state' ? { ok: true, state: { tool: 'chat' }, plans: [{ id: 'e1', kind: 'edit', phase: 'quoted', what: 'trim' }] } : undefined));
    const out = executeLiveToolCall(call('g', 'get_screen_state'), g.env);
    expect(out.response.response.state).toMatchObject({ tool: 'chat', agentPlans: [{ plan: 1, kind: 'video edit', phase: 'quoted', what: 'trim' }] });
  });
});

describe('useLiveActions: the countdown runs only on the user\'s own yes', () => {
  const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

  function hookEnv(overrides: Partial<LiveActionEnv> = {}) {
    const runs: LiveRunDetail[] = [];
    const env: LiveActionEnv = {
      dispatchAction: (d) => {
        if (d.type === 'prepare_generation' || d.type === 'start_generation') d.reply = { ok: true, tool: 'music', priceCredits: 4 };
        if (d.type === 'agent_task' && d.action === 'start') d.reply = { ok: true, priceCredits: 0 };
        return true;
      },
      openArtifact: () => true,
      runGeneration: jest.fn((d: LiveRunDetail) => { runs.push(d); return true; }),
      recordApproval: jest.fn(async () => ({ ok: true as const })),
      notify: jest.fn(),
      ...overrides,
    };
    return { env, runs };
  }

  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  const prepare = (r: { current: ReturnType<typeof useLiveActions> }) => act(() => {
    r.current.onToolCall([call('p', 'prepare_generation', { tool: 'music', prompt: 'lo-fi rain' })]);
    jest.advanceTimersByTime(300);
  });
  const hear = (r: { current: ReturnType<typeof useLiveActions> }, text: string) => act(() => {
    r.current.onHeard({ text });
    r.current.onHeard({ end: true });
  });

  it('nothing heard → not started: no record, no run, and the model is told', async () => {
    const { env } = hookEnv();
    const { result } = renderHook(() => useLiveActions(env));
    prepare(result);
    act(() => { result.current.onToolCall([call('s', 'start_generation', { confirmed: 'yes' })]); });
    await act(async () => { jest.advanceTimersByTime(3100); });
    expect(env.recordApproval).not.toHaveBeenCalled();
    expect(env.runGeneration).not.toHaveBeenCalled();
    expect(result.current.pendingRun?.state).toBe('not_heard');
    expect(env.notify).toHaveBeenCalledWith({ kind: 'not_started', reason: 'not_heard' });
  });

  it('a yes whose transcript arrives during the countdown still counts (the transcript lags the call)', async () => {
    const { env, runs } = hookEnv();
    const { result } = renderHook(() => useLiveActions(env));
    prepare(result);
    act(() => { result.current.onToolCall([call('s', 'start_generation', { confirmed: 'yes' })]); });
    act(() => { jest.advanceTimersByTime(800); });
    hear(result, ' sure, do it');
    await act(async () => { jest.advanceTimersByTime(2300); });
    await flush();
    expect(env.recordApproval).toHaveBeenCalledWith({ tool: 'music', said: 'sure, do it', credits: 4 });
    expect(runs).toEqual([{ target: { kind: 'studio', tool: 'music' }, approval: { channel: 'voice-transcript', said: 'sure, do it' } }]);
    expect(result.current.pendingRun?.state).toBe('started');
  });

  it('a "wait" during the countdown stops it at once, before the 3 seconds are up', async () => {
    const { env } = hookEnv();
    const { result } = renderHook(() => useLiveActions(env));
    prepare(result);
    hear(result, 'yes');
    act(() => { result.current.onToolCall([call('s', 'start_generation', { confirmed: 'yes' })]); });
    act(() => { jest.advanceTimersByTime(1000); result.current.onHeard({ text: 'wait' }); });
    expect(result.current.pendingRun?.state).toBe('cancelled');
    expect(env.notify).toHaveBeenCalledWith({ kind: 'not_started', reason: 'said_no' });
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(env.runGeneration).not.toHaveBeenCalled();
  });

  it('the server not recording the yes starts nothing (fail closed)', async () => {
    const { env } = hookEnv({ recordApproval: jest.fn(async () => ({ ok: false as const, error: 'approval_unclear' })) });
    const { result } = renderHook(() => useLiveActions(env));
    prepare(result);
    hear(result, 'ok');
    act(() => { result.current.onToolCall([call('s', 'start_generation', { confirmed: 'yes' })]); });
    await act(async () => { jest.advanceTimersByTime(3100); });
    await flush();
    expect(env.runGeneration).not.toHaveBeenCalled();
    expect(result.current.pendingRun?.state).toBe('failed');
    expect(env.notify).toHaveBeenCalledWith({ kind: 'not_started', reason: 'not_recorded', what: 'approval_unclear' });
  });

  it('a Cancel while the yes is being recorded: nothing runs', async () => {
    let release: (v: { ok: true }) => void = () => {};
    const { env } = hookEnv({ recordApproval: jest.fn(() => new Promise<{ ok: true }>((r) => { release = r; })) });
    const { result } = renderHook(() => useLiveActions(env));
    prepare(result);
    hear(result, 'yes');
    act(() => { result.current.onToolCall([call('s', 'start_generation', { confirmed: 'yes' })]); });
    await act(async () => { jest.advanceTimersByTime(3100); });
    expect(env.recordApproval).toHaveBeenCalled();
    act(() => { result.current.cancelRun(); });
    await act(async () => { release({ ok: true }); });
    await flush();
    expect(env.runGeneration).not.toHaveBeenCalled();
  });

  it('an Agent G plan: told, yes, start → the card runs with the words (no studio record: the run request carries them)', async () => {
    const { env, runs } = hookEnv();
    const { result } = renderHook(() => useLiveActions(env));
    let n = 0;
    act(() => { n = result.current.registerPlan('msg-1', 'montage', '4 clips to song.mp3'); });
    expect(n).toBe(1);
    act(() => { jest.advanceTimersByTime(200); result.current.planTold('msg-1'); jest.advanceTimersByTime(200); });
    hear(result, 'да, давай');
    act(() => { result.current.onToolCall([call('s', 'agent_task', { action: 'start', plan: 1 })]); });
    expect(result.current.pendingRun).toMatchObject({ tool: 'montage', state: 'counting' });
    await act(async () => { jest.advanceTimersByTime(3100); });
    expect(env.recordApproval).not.toHaveBeenCalled();
    expect(runs).toEqual([{ target: { kind: 'agent', planId: 'msg-1', planKind: 'montage' }, approval: { channel: 'voice-transcript', said: 'да, давай' } }]);
  });

  it('the studio refusing the run (what was told is gone) → failed, and the model hears why', async () => {
    const { env } = hookEnv({
      runGeneration: jest.fn((d: LiveRunDetail) => { d.reply = { ok: false, error: 'changed', message: 'The prompt changed during the countdown.' }; return true; }),
    });
    const { result } = renderHook(() => useLiveActions(env));
    prepare(result);
    hear(result, 'yes');
    act(() => { result.current.onToolCall([call('s', 'start_generation', { confirmed: 'yes' })]); });
    await act(async () => { jest.advanceTimersByTime(3100); });
    await flush();
    expect(result.current.pendingRun?.state).toBe('failed');
    expect(env.notify).toHaveBeenCalledWith({ kind: 'not_started', reason: 'refused', what: 'The prompt changed during the countdown.' });
  });

  it('stop (generations) cancels a start still counting; hanging up mid-countdown runs nothing', async () => {
    const { env } = hookEnv();
    const { result, unmount } = renderHook(() => useLiveActions(env));
    prepare(result);
    hear(result, 'yes');
    act(() => { result.current.onToolCall([call('s', 'start_generation', { confirmed: 'yes' })]); });
    act(() => { result.current.onToolCall([call('x', 'stop', { what: 'generation' })]); });
    expect(result.current.pendingRun?.state).toBe('cancelled');
    act(() => { result.current.onToolCall([call('s2', 'start_generation', { confirmed: 'yes' })]); });
    unmount();
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(env.runGeneration).not.toHaveBeenCalled();
  });
});

describe('fetchApproval', () => {
  // jsdom has no Response: the little a fetch needs.
  const reply = (body: unknown, status: number) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

  it('posts the words and the studio; only {ok:true} is a yes', async () => {
    const fetchImpl = jest.fn(async () => reply({ ok: true }, 200));
    expect(await fetchApproval({ tool: 'video', said: 'yes', credits: 12 }, { fetchImpl })).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/agent/approvals');
    expect(JSON.parse(String(init.body))).toEqual({ channel: 'voice-transcript', said: 'yes', tool: 'video', credits: 12 });
    const refused = jest.fn(async () => reply({ ok: false, error: 'approval_unclear' }, 400));
    expect(await fetchApproval({ tool: 'video', said: 'hmm', credits: 1.5 }, { fetchImpl: refused })).toEqual({ ok: false, error: 'approval_unclear' });
    expect(JSON.parse(String((refused.mock.calls[0] as unknown as [string, RequestInit])[1].body))).not.toHaveProperty('credits');
    const down = jest.fn(async () => { throw new Error('offline'); });
    expect(await fetchApproval({ tool: 'video', said: 'yes' }, { fetchImpl: down })).toEqual({ ok: false, error: 'network' });
  });
});
