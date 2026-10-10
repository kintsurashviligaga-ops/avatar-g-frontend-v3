/** @jest-environment node */
import { agentScope, phoneCallRule, phoneDeclarations, runPhoneTool, type PhonePlan, type PhoneToolDeps } from './phoneTools';
import type { HeardUtterance } from '@/lib/voice/spokenYes';
import type { TaskView } from '@/lib/tasks/taskView';

const T0 = 1_760_000_000_000;
const task = (o: Partial<TaskView>): TaskView => ({
  id: 't1', kind: 'agent-audio-extract', service: 'audio', status: 'running', stage: 'extract', pct: 40, attempt: 1, result: null,
  error: null, cancellable: true, label: 'MP3', position: null, createdAt: null, updatedAt: null, ...o,
});

function deps(o: Partial<PhoneToolDeps> & { heardList?: HeardUtterance[]; tasks?: TaskView[] } = {}) {
  const calls: Record<string, unknown[]> = { cancel: [], startFree: [], sendConfirm: [], deliver: [], planMp3: [] };
  const plans: PhonePlan[] = [];
  const d: PhoneToolDeps = {
    now: () => T0,
    scope: 'service',
    mediaOpen: async () => true,
    balance: async () => 120,
    listTasks: async () => o.tasks ?? [task({ id: 't1' }), task({ id: 't2', status: 'succeeded', result: { url: 'https://x/a.mp3', media: 'audio' } as TaskView['result'] })],
    cancelTask: async (_u, id) => { calls.cancel!.push(id); return 'cancelled'; },
    heard: async () => o.heardList ?? [],
    plans: {
      list: async () => plans,
      add: async (_c, p) => { const n = { ...p, n: plans.length + 1 }; plans.push(n); return n; },
    },
    planMp3: async (_u, url) => { calls.planMp3!.push(url); return { ok: true, spec: { url }, token: 'plan-token', credits: 0, label: 'MP3 from link' }; },
    startFree: async (_u, p, said) => { calls.startFree!.push({ n: p.n, said }); return { ok: true, taskId: 'new' }; },
    sendConfirm: async (_u, p) => { calls.sendConfirm!.push(p.n); return true; },
    deliver: async (_u, t) => { calls.deliver!.push(t.id); return { sent: true, mode: 'media' }; },
    scheduleCallback: async () => 'needs_permission',
    ...o,
  };
  return { d, calls, plans };
}

const TICKET = { callId: 'wacid.P', userId: 'u1' };

describe('phone tools: one brain, phone-sized tool list', () => {
  it('service scope (default) cannot start new work; creative scope can plan and confirm', () => {
    expect(agentScope({} as NodeJS.ProcessEnv)).toBe('service');
    expect(agentScope({ WHATSAPP_AGENT_SCOPE: 'Creative' } as NodeJS.ProcessEnv)).toBe('creative');
    expect(phoneDeclarations('service').map((d) => d.name)).toEqual(['account_summary', 'task_status', 'stop_task', 'send_result', 'call_me_when_ready', 'end_call']);
    expect(phoneDeclarations('creative').map((d) => d.name)).toContain('start_order');
    expect(phoneCallRule('service', 'help@x')).toContain('cannot start new work');
    expect(phoneCallRule('creative', 'help@x')).toContain('its price before anything starts');
  });

  it('a tool outside the scope or unknown answers unknown_tool, and never runs', async () => {
    const { d, calls } = deps();
    expect(await runPhoneTool(d, TICKET, 'order_mp3', { url: 'https://example.com/a.mp4' })).toEqual({ error: 'unknown_tool' });
    expect(await runPhoneTool(d, TICKET, 'click_element', {})).toEqual({ error: 'unknown_tool' });
    expect(await runPhoneTool(d, TICKET, 42, {})).toEqual({ error: 'unknown_tool' });
    expect(calls.planMp3).toEqual([]);
  });

  it('reads the account and tasks for the ticket\'s user only', async () => {
    const seen: string[] = [];
    const { d } = deps({ balance: async (u) => { seen.push(u); return 77; }, listTasks: async (u) => { seen.push(u); return [task({})]; } });
    expect(await runPhoneTool(d, TICKET, 'account_summary', { userId: 'u2' })).toEqual({ balance_credits: 77, running_tasks: 1, recent_tasks: 1 });
    expect(await runPhoneTool(d, TICKET, 'task_status', {})).toEqual({ tasks: [{ task: 1, what: 'MP3', status: 'running', percent: 40, stage: 'extract', has_result: false }] });
    expect(await runPhoneTool(d, TICKET, 'task_status', { task: 9 })).toEqual({ error: 'no_such_task' });
    expect(seen.every((u) => u === 'u1')).toBe(true);
  });

  it('stop_task needs the caller\'s OWN recent yes, not the model\'s word', async () => {
    const none = deps();
    expect(await runPhoneTool(none.d, TICKET, 'stop_task', { task: 1 })).toEqual({ stopped: false, reason: 'not_heard_yes' });
    expect(none.calls.cancel).toEqual([]);

    const old = deps({ heardList: [{ text: 'კი', at: T0 - 120_000 }] });
    expect(await runPhoneTool(old.d, TICKET, 'stop_task', { task: 1 })).toEqual({ stopped: false, reason: 'not_heard_yes' });

    const no = deps({ heardList: [{ text: 'არა', at: T0 - 5000 }] });
    expect(await runPhoneTool(no.d, TICKET, 'stop_task', { task: 1 })).toEqual({ stopped: false, reason: 'said_no' });

    // „კი, გააჩერე" ("yes, stop it") reads as a hesitation to the shared judge: it fails safe (nothing stops) and the
    // model asks again. A plain yes stops it.
    const hedged = deps({ heardList: [{ text: 'კი, გააჩერე', at: T0 - 5000 }] });
    expect(await runPhoneTool(hedged.d, TICKET, 'stop_task', { task: 1 })).toMatchObject({ stopped: false });
    expect(hedged.calls.cancel).toEqual([]);

    const yes = deps({ heardList: [{ text: 'კი', at: T0 - 5000 }] });
    expect(await runPhoneTool(yes.d, TICKET, 'stop_task', { task: 1 })).toEqual({ stopped: true });
    expect(yes.calls.cancel).toEqual(['t1']);
  });

  it('send_result delivers a finished task; an unfinished one is refused', async () => {
    const { d, calls } = deps();
    expect(await runPhoneTool(d, TICKET, 'send_result', {})).toEqual({ sent: true, how: 'media' });
    expect(calls.deliver).toEqual(['t2']);
    expect(await runPhoneTool(d, TICKET, 'send_result', { task: 1 })).toEqual({ sent: false, reason: 'not_finished' });
  });

  it('call_me_when_ready reports honestly when WhatsApp call permission is missing', async () => {
    const { d } = deps();
    expect(await runPhoneTool(d, TICKET, 'call_me_when_ready', { task: 1 })).toEqual({ result: 'needs_permission' });
    expect(await runPhoneTool(d, TICKET, 'call_me_when_ready', { task: 2 })).toEqual({ scheduled: false, reason: 'already_finished' });
  });

  it('creative: a free plan starts only on a yes heard AFTER its price was told', async () => {
    let heardList: HeardUtterance[] = [{ text: 'yes', at: T0 - 10_000 }];
    const { d, calls } = deps({ scope: 'creative', heard: async () => heardList });
    expect(await runPhoneTool(d, TICKET, 'order_mp3', { url: 'https://example.com/clip.mp4' })).toEqual({ planned: true, plan: 1, what: 'MP3 from link', price_credits: 0, free: true });
    expect(await runPhoneTool(d, TICKET, 'start_order', { plan: 1 })).toEqual({ started: false, reason: 'not_heard_yes' });
    heardList = [...heardList, { text: 'yes, go ahead', at: T0 + 1 }];
    expect(await runPhoneTool(d, TICKET, 'start_order', { plan: 1 })).toEqual({ started: true });
    expect(calls.startFree).toEqual([{ n: 1, said: 'yes, go ahead' }]);
    expect(await runPhoneTool(d, TICKET, 'start_order', { plan: 7 })).toEqual({ error: 'no_such_plan' });
  });

  it('creative: a PAID plan never starts from the call, even on a clear yes: a Confirm button is sent', async () => {
    const { d, calls } = deps({
      scope: 'creative',
      heardList: [{ text: 'yes', at: T0 + 5 }],
      planMp3: async () => ({ ok: true, spec: {}, token: 'tok', credits: 25, label: 'MP3' }),
    });
    await runPhoneTool(d, TICKET, 'order_mp3', { url: 'https://example.com/a.wav' });
    expect(await runPhoneTool(d, TICKET, 'start_order', { plan: 1 })).toEqual({ started: false, waiting_for: 'confirm_button', price_credits: 25 });
    expect(calls.startFree).toEqual([]);
    expect(calls.sendConfirm).toEqual([1]);
  });

  it('creative: closed media gate, bad links and planner refusals are plain answers', async () => {
    const closed = deps({ scope: 'creative', mediaOpen: async () => false });
    expect(await runPhoneTool(closed.d, TICKET, 'order_mp3', { url: 'https://example.com/a.mp4' })).toEqual({ error: 'not_available' });
    const open = deps({ scope: 'creative', planMp3: async () => ({ ok: false, error: 'blocked_platform' }) });
    expect(await runPhoneTool(open.d, TICKET, 'order_mp3', { url: 'javascript:alert(1)' })).toEqual({ error: 'bad_link' });
    expect(await runPhoneTool(open.d, TICKET, 'order_mp3', { url: 'https://youtube.com/watch?v=x' })).toEqual({ planned: false, reason: 'blocked_platform' });
  });

  it('a failing dependency answers `failed`, never throws', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { d } = deps({ listTasks: async () => { throw new Error('db'); } });
    expect(await runPhoneTool(d, TICKET, 'task_status', {})).toEqual({ error: 'failed' });
    warn.mockRestore();
  });
});
