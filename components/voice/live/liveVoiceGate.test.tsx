/**
 * Agent G Master Task PART 4, tightened by the final-release master task §8.D: a voice call never starts a run.
 *
 * Every start — start_generation, agent_task start, extract_audio start — answers ui_confirmation_required at the
 * executor, whatever the transcript, the told price or plan, or the model's `confirmed` says: the studio is never
 * asked, no countdown starts, no yes is recorded and nothing runs. The user presses the priced button (or the plan
 * card's button) on screen. Status and stop still work by voice, and a stop still cancels.
 */
import { act, renderHook } from '@testing-library/react';

import type { LiveActionEventDetail, LiveStudioReply } from '@/lib/voice/liveTools';
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

describe('start_generation: refused by voice in every state', () => {
  const studio = (fp = 'image|a red fox|2') => (d: LiveActionEventDetail): LiveStudioReply | undefined =>
    (d.type === 'prepare_generation' || d.type === 'start_generation' || d.type === 'get_screen_state'
      ? { ok: true, tool: 'image', priceCredits: 2, fingerprint: fp } : undefined);
  const refused = (out: ReturnType<typeof executeLiveToolCall>) => {
    expect(out.response.response).toMatchObject({ ok: false, error: 'ui_confirmation_required' });
    expect(String(out.response.response.message)).toMatch(/confirmation button\. Nothing started/);
    expect(out.run).toBeUndefined();
  };

  it('no transcript, a price never told, a "wait" after it, and a clear yes after it: all refused, the studio never sees a start', () => {
    const g = gateEnv(studio());
    refused(executeLiveToolCall(call('s0', 'start_generation', { confirmed: 'yes' }), { ...g.env, voice: undefined }));
    refused(executeLiveToolCall(call('s1', 'start_generation', { confirmed: 'yes' }), g.env));
    executeLiveToolCall(call('p', 'prepare_generation', { tool: 'image', prompt: 'a red fox' }), g.env);
    g.say('wait, not yet');
    refused(executeLiveToolCall(call('s2', 'start_generation', { confirmed: 'yes' }), g.env));
    g.say('yes please, start it');
    refused(executeLiveToolCall(call('s3', 'start_generation', { confirmed: 'yes' }), g.env));
    refused(executeLiveToolCall(call('s4', 'start_generation', {}), g.env)); // no `confirmed`: still the same refusal
    expect(g.actions.map((a) => a.type)).toEqual(['prepare_generation']);
    expect(g.env.runGeneration).not.toHaveBeenCalled();
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

  it('agent_task start and extract_audio start are refused by voice — with no plan, a plan not told, a "no", or a clear yes', () => {
    const g = gateEnv(cards);
    const refusedStart = (id: string, name: string, args: Record<string, unknown>) => {
      const out = executeLiveToolCall(call(id, name, args), g.env);
      expect(out.response.response).toMatchObject({ ok: false, error: 'ui_confirmation_required' });
      expect(out.run).toBeUndefined();
    };
    refusedStart('a', 'agent_task', { action: 'start' });
    g.voice.registerPlan('msg-a', 'audio', 'MP3 of talk.mp4');
    refusedStart('b', 'agent_task', { action: 'start', plan: 1 });
    g.voice.planTold('msg-a');
    g.say('нет, подожди');
    refusedStart('c', 'agent_task', { action: 'start', plan: 1 });
    g.say('კი, დაიწყე');
    refusedStart('d', 'agent_task', { action: 'START', plan: 1 });
    refusedStart('e', 'extract_audio', { action: 'start', confirmed: 'yes' });
    expect(g.actions).toEqual([]);
    expect(g.env.runGeneration).not.toHaveBeenCalled();
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

describe('useLiveActions: no voice start reaches the countdown', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('a told price, a told plan and a yes: every start answers ui_confirmation_required; nothing is recorded or run; stop still answers', async () => {
    const env: LiveActionEnv = {
      dispatchAction: (d) => {
        if (d.type === 'prepare_generation') d.reply = { ok: true, tool: 'music', priceCredits: 4 };
        return true;
      },
      openArtifact: () => true,
      runGeneration: jest.fn(() => true),
      recordApproval: jest.fn(async () => ({ ok: true as const })),
      notify: jest.fn(),
    };
    const { result } = renderHook(() => useLiveActions(env));
    act(() => { result.current.onToolCall([call('p', 'prepare_generation', { tool: 'music', prompt: 'lo-fi rain' })]); jest.advanceTimersByTime(300); });
    act(() => { result.current.registerPlan('msg-1', 'montage', '4 clips to song.mp3'); result.current.planTold('msg-1'); });
    act(() => { result.current.onHeard({ text: 'да, давай' }); result.current.onHeard({ end: true }); });
    let out: ReturnType<typeof result.current.onToolCall> = [];
    act(() => { out = result.current.onToolCall([call('s', 'start_generation', { confirmed: 'yes' }), call('a', 'agent_task', { action: 'start', plan: 1 })]); });
    expect(out.map((r) => r.response)).toEqual([expect.objectContaining({ error: 'ui_confirmation_required' }), expect.objectContaining({ error: 'ui_confirmation_required' })]);
    expect(result.current.pendingRun).toBeNull();
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(env.recordApproval).not.toHaveBeenCalled();
    expect(env.runGeneration).not.toHaveBeenCalled();
    act(() => { out = result.current.onToolCall([call('x', 'stop', { what: 'generation' })]); });
    expect(out[0]!.response).toMatchObject({ ok: true });
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
