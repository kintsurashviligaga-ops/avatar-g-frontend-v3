/**
 * A multi-step run as one card: the upload, the plan, one row per run step from what the server reads, check and save;
 * a credits line; the step that waits for the user's yes; the events in words; Retry only where the run can be carried on.
 */
import { canRetry, creditsText, eventText, retryCredits, runCredits, runTask, stepErrorText, type AgentRunState } from './runCard';
import type { TaskStepView, TaskView } from '@/lib/tasks/taskView';
import type { RunChain } from './runChat';
import type { RunPlanView } from './runClient';

const SOUND_CUT: RunChain = { kind: 'sound-cut', source: { index: 0 }, clips: [1, 2] };
const CUT_EDIT: RunChain = { kind: 'cut-edit', edits: [{ op: 'grade', style: 'noir' }] };
const PLAN: RunPlanView = { runId: 'run-1', credits: 6, expiresAt: 9, steps: [{ id: 'sound', tool: 'audio_extract', credits: 0 }, { id: 'cut', tool: 'montage', credits: 6 }] };

const step = (id: string, tool: TaskStepView['tool'], over: Partial<TaskStepView> = {}): TaskStepView => ({
  id, tool, capability: tool === 'montage' ? 'agent.montage' : tool === 'edit' ? 'media.edit' : 'agent.audio-extract',
  status: 'queued', taskId: null, stage: null, pct: null, result: null, error: null, reused: false, approval: null, credits: null, ...over,
});
const run = (status: TaskView['status'], steps: TaskStepView[], over: Partial<TaskView> = {}): TaskView => ({
  id: 'run-1', kind: 'agent-run', service: 'film', status, stage: null, pct: null, attempt: null, result: null, error: null,
  cancellable: true, label: null, position: null, createdAt: null, updatedAt: null, steps, events: [], ...over,
});
const base = (over: Partial<AgentRunState> = {}): AgentRunState => ({ phase: 'reading', chain: SOUND_CUT, names: ['a.mp4', 'b.mp4', 'c.mp4'], total: 3, uploaded: 0, t0: 1000, ...over });
const states = (s: AgentRunState) => runTask(s, 'en').steps.map((x) => `${x.key}=${x.state}`);

describe('before the run', () => {
  test('uploading: the upload step counts the files, everything else waits', () => {
    const m = runTask(base({ uploaded: 1 }), 'en');
    expect(states(base({ uploaded: 1 }))).toEqual(['upload=active', 'plan=pending', 'step:sound=pending', 'step:cut=pending', 'finish=pending']);
    expect(m.steps[0]!.note).toBe('1/3');
    expect(m).toMatchObject({ title: 'One sound, the clips cut to it', status: 'working', countText: '0/5 steps', clock: { from: 1000 }, credits: null });
  });

  test('planned: the plan waits for Start with its steps and price; no clock', () => {
    const m = runTask(base({ phase: 'planned', uploaded: 3, plan: PLAN }), 'en');
    expect(m.steps.map((x) => x.state)).toEqual(['done', 'waiting', 'pending', 'pending', 'pending']);
    expect(m.steps[1]).toMatchObject({ detail: '2 steps · ✦ 6', note: 'Waiting for Start' });
    expect(m.steps.map((x) => x.label)).toEqual(['Upload the files', 'Plan and your go-ahead', 'Take the sound out of the video', 'Cut the clips to that sound', 'Check and save']);
    expect(m).toMatchObject({ status: 'waiting', statusText: 'Waiting for you', clock: null, credits: '✦ 0 spent · up to ✦ 6' });
  });

  test('a link source and the cut-edit chain name their steps; the edit step says what it will do', () => {
    const link = runTask(base({ phase: 'planned', chain: { kind: 'sound-cut', source: { url: 'https://x.example/a.mp4' }, clips: [0] }, plan: PLAN }), 'ka');
    expect(link.steps[2]!.label).toBe('ბმულიდან ხმის ამოღება');
    const edit = runTask(base({ phase: 'planned', chain: CUT_EDIT }), 'ru');
    expect(edit.title).toBe('Монтаж и правка');
    expect(edit.steps[3]).toMatchObject({ key: 'step:edit', label: 'Правка монтажа', detail: 'цвет: чёрно-белый' });
  });

  test('Cancel on the plan: stopped there, nothing after it ran', () => {
    const m = runTask(base({ phase: 'dismissed', plan: PLAN }), 'en');
    expect(m.steps.map((x) => x.state)).toEqual(['done', 'stopped', 'skipped', 'skipped', 'skipped']);
    expect(m).toMatchObject({ status: 'stopped', statusText: 'Cancelled', clock: null });
  });

  test('a file that did not upload fails the upload step; a refused plan fails the plan step', () => {
    expect(states(base({ phase: 'failed', error: 'upload_failed', t1: 2000 }))).toEqual(['upload=failed', 'plan=skipped', 'step:sound=skipped', 'step:cut=skipped', 'finish=skipped']);
    expect(states(base({ phase: 'failed', error: 'bad_spec', uploaded: 3, t1: 2000 }))).toEqual(['upload=done', 'plan=failed', 'step:sound=skipped', 'step:cut=skipped', 'finish=skipped']);
  });
});

describe('while it runs', () => {
  test('just created and not read yet: the first step is under way', () => {
    expect(states(base({ phase: 'running', plan: PLAN, runId: 'run-1', uploaded: 3 }))).toEqual(['upload=done', 'plan=done', 'step:sound=active', 'step:cut=pending', 'finish=pending']);
  });

  test('each step from the server: delivered with what it made, the next one at its own stage, the credits it holds', () => {
    const task = run('running', [
      step('sound', 'audio_extract', { status: 'completed', taskId: 'a', result: { url: 'u', media: 'audio', durationSec: 189 }, credits: 0 }),
      step('cut', 'montage', { status: 'running', taskId: 'm', stage: 'stitch', pct: 40, credits: 6 }),
    ], { pct: 70 });
    const m = runTask(base({ phase: 'running', plan: PLAN, runId: 'run-1', uploaded: 3, task }), 'en');
    expect(m.steps.map((x) => x.state)).toEqual(['done', 'done', 'done', 'active', 'pending']);
    expect(m.steps[2]!.detail).toBe('MP3 · 3:09');
    expect(m.steps[3]!.note).toBe('Joining the shots');
    expect(m).toMatchObject({ status: 'working', pct: 70, countText: '3/5 steps', credits: '✦ 0 spent · ✦ 6 held · up to ✦ 6' });
  });

  test('a queued step with a job is in line; Stop pressed says so on the step at work', () => {
    const task = run('running', [step('sound', 'audio_extract', { status: 'queued', taskId: 'a' }), step('cut', 'montage')]);
    expect(runTask(base({ phase: 'running', plan: PLAN, runId: 'r', task }), 'en').steps[2]!.note).toBe('In line');
    const stopping = runTask(base({ phase: 'running', plan: PLAN, runId: 'r', task, stopping: true }), 'en');
    expect(stopping.steps[2]!.note).toBe('Stopping…');
    expect(stopping.statusText).toBe('Stopping…');
  });

  test('a step priced above its approval waits for the user\'s yes: the card names it, its price and its quote', () => {
    const task = run('awaiting_approval', [
      step('sound', 'audio_extract', { status: 'completed', taskId: 'a', result: { url: 'u', media: 'audio' } }),
      step('cut', 'montage', { status: 'awaiting_approval', approval: { credits: 9, quoteId: 'q-1', expiresAt: 5 }, credits: 9 }),
    ]);
    const m = runTask(base({ phase: 'running', plan: PLAN, runId: 'run-1', task }), 'en');
    expect(m.steps[3]).toMatchObject({ state: 'waiting', note: 'Needs your yes: ✦ 9' });
    expect(m.approval).toEqual({ step: 'cut', label: 'Cut the clips to that sound', credits: 9, quoteId: 'q-1' });
    expect(m).toMatchObject({ status: 'waiting', statusText: 'Waiting for you' });
  });
});

describe('after the run', () => {
  test('completed: every step done, saved, the clock frozen, the credits spent', () => {
    const task = run('completed', [
      step('sound', 'audio_extract', { status: 'completed', taskId: 'a', result: { url: 'u', media: 'audio', durationSec: 60 }, credits: 0 }),
      step('cut', 'montage', { status: 'completed', taskId: 'm', result: { url: 'v', media: 'video', durationSec: 31, aspect: '9:16' }, credits: 6 }),
    ]);
    const m = runTask(base({ phase: 'ended', plan: PLAN, runId: 'run-1', task, t1: 5000 }), 'en');
    expect(m.steps.map((x) => x.state)).toEqual(['done', 'done', 'done', 'done', 'done']);
    expect(m.steps[3]!.detail).toBe('0:31 · 9:16 · ✦ 6');
    expect(m.steps[4]!.detail).toBe('Also saved to your Library');
    expect(m).toMatchObject({ status: 'done', countText: '5/5 steps', clock: { from: 1000, to: 5000 }, pct: null, credits: '✦ 6 spent · up to ✦ 6' });
  });

  test('the first step refused (a platform link): its reason in its own card\'s words, the next one not started, Retry offered', () => {
    const task = run('failed', [
      step('sound', 'audio_extract', { status: 'failed', error: 'platform' }),
      step('cut', 'montage', { status: 'cancelled', error: 'skipped' }),
    ], { error: 'platform' });
    const s = base({ phase: 'ended', plan: PLAN, runId: 'run-1', task, t1: 3000 });
    const m = runTask(s, 'en');
    expect(m.steps.map((x) => x.state)).toEqual(['done', 'done', 'failed', 'skipped', 'skipped']);
    expect(m.steps[2]).toMatchObject({ warn: true });
    expect(m.steps[2]!.detail).toMatch(/does not allow its videos or audio to be downloaded/);
    expect(m.steps[3]!.detail).toBe('Not started: the step before it did not finish');
    expect(m).toMatchObject({ status: 'failed', statusText: 'Did not finish' });
    expect(canRetry(s)).toBe(true);
    expect(retryCredits(s)).toBe(6);
  });

  test('partly done: what was delivered stays, the count of results is said, Retry charges only what is left', () => {
    const task = run('partially_completed', [
      step('sound', 'audio_extract', { status: 'completed', taskId: 'a', result: { url: 'u', media: 'audio' } }),
      step('cut', 'montage', { status: 'failed', taskId: 'm', error: 'render_failed' }),
    ]);
    const s = base({ phase: 'ended', plan: { ...PLAN, steps: [{ id: 'sound', tool: 'audio_extract', credits: 2 }, { id: 'cut', tool: 'montage', credits: 6 }] }, runId: 'run-1', task });
    const m = runTask(s, 'en');
    expect(m.steps.map((x) => x.state)).toEqual(['done', 'done', 'done', 'failed', 'failed']);
    expect(m.steps[3]!.detail).toBe('The edit did not finish. Nothing was charged.');
    expect(m.steps[4]!.detail).toBe('1/2 results saved');
    expect(m.statusText).toBe('Partly done');
    expect(retryCredits(s)).toBe(6);
  });

  test('a resumed run shows the step it kept from the earlier try', () => {
    const task = run('running', [
      step('sound', 'audio_extract', { status: 'completed', taskId: 'a', reused: true, result: { url: 'u', media: 'audio', durationSec: 9 } }),
      step('cut', 'montage', { status: 'queued', taskId: 'm2' }),
    ]);
    const m = runTask(base({ phase: 'running', plan: PLAN, runId: 'run-2', task }), 'en');
    expect(m.steps[2]!.detail).toBe('MP3 · 0:09 · kept from the earlier try, not redone');
  });

  test('stopped: the step at work is where it ended; no Retry while it still runs or once complete', () => {
    const task = run('cancelled', [step('sound', 'audio_extract', { status: 'cancelled', taskId: 'a' }), step('cut', 'montage', { status: 'cancelled', error: 'skipped' })]);
    const s = base({ phase: 'ended', plan: PLAN, runId: 'r', task });
    expect(runTask(s, 'en').steps.map((x) => x.state)).toEqual(['done', 'done', 'stopped', 'skipped', 'skipped']);
    expect(runTask(s, 'en').status).toBe('stopped');
    expect(canRetry(s)).toBe(true);
    expect(canRetry(base({ phase: 'running', runId: 'r', task: run('running', []) }))).toBe(false);
    expect(canRetry(base({ phase: 'ended', runId: 'r', task: run('completed', []) }))).toBe(false);
  });

  test('the follow lost a run it had started: the card says it may still be going', () => {
    expect(runTask(base({ phase: 'failed', runId: 'run-1', plan: PLAN, error: 'network' }), 'en').statusText).toBe('The connection dropped; the task may still be going');
  });
});

describe('credits, events, reasons', () => {
  test('free runs read „Free"; held and spent are counted from the steps', () => {
    expect(creditsText({ approved: 0, reserved: 0, spent: 0 }, 'ka')).toBe('უფასო');
    expect(creditsText({ approved: 8, reserved: 2, spent: 4 }, 'ru')).toBe('потрачено ✦ 4 · в резерве ✦ 2 · не больше ✦ 8');
    expect(runCredits({ plan: undefined, task: undefined })).toBeNull();
  });

  test('events in words with the step\'s own label; bookkeeping says nothing', () => {
    const labels = { cut: 'Cut the clips to that sound' };
    expect(eventText({ seq: 1, at: 0, type: 'step.awaiting_approval', step: 'cut', detail: '9 credits' }, labels, 'en')).toBe('Cut the clips to that sound: needs your yes (✦ 9)');
    expect(eventText({ seq: 2, at: 0, type: 'run.created' }, labels, 'ka')).toBe('დააჭირე „დაწყებას“: დავალება შეიქმნა');
    expect(eventText({ seq: 3, at: 0, type: 'run.status', detail: 'running' }, labels, 'en')).toBeNull();
    expect(eventText({ seq: 4, at: 0, type: 'run.invariant' }, labels, 'en')).toBeNull();
    const m = runTask(base({ phase: 'running', plan: PLAN, runId: 'r', events: Array.from({ length: 9 }, (_, i) => ({ seq: i + 1, at: 0, type: 'step.running' as const, step: 'cut' })) }), 'ru');
    expect(m.log).toHaveLength(6);
    expect(m.log[0]).toBe('Монтаж клипов под этот звук: в работе');
  });

  test('a step\'s reason in its own card\'s words, and the run\'s own codes', () => {
    expect(stepErrorText('edit', 'qc_failed', 'en')).toBe('The result failed its check, so I am not showing it.');
    expect(stepErrorText('montage', 'lost', 'ka')).toMatch(/თავიდან ცდა/);
    expect(stepErrorText('audio_extract', 'input_missing', 'ru')).toBe('У шага не было входного файла');
  });
});
