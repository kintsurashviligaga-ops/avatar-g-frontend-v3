/** @jest-environment node */
/**
 * One shape for every task (EF-7): a studio render from its row's columns, an Agent G montage and an audio extraction
 * from their executors' own owner views. A raw error text never leaves the server; only a code does.
 */
import { newRun, moveStep, stepOf, type RunState } from '@/lib/agent/run/runEngine';
import { LABEL_MAX, isFinal, parseTaskId, taskFromAudio, taskFromMontage, taskFromRow, taskFromRun, type TaskRow } from './taskView';

const row = (r: Partial<TaskRow> = {}): TaskRow => ({
  id: 'prod_1700000000000_ab12',
  user_id: 'user-1',
  service_type: 'film',
  status: 'pending',
  current_stage: null,
  pct: null,
  params: {},
  result: null,
  signed_url: null,
  error: null,
  created_at: '2026-10-09T10:00:00Z',
  updated_at: '2026-10-09T10:01:00Z',
  ...r,
});

test('ids: generation_jobs keys only (a UUID, a studio key); nothing that could walk a path or carry a query', () => {
  expect(parseTaskId('0b9f2c1e-4c2a-4f7e-9a51-1d2c3b4a5f60')).toBe('0b9f2c1e-4c2a-4f7e-9a51-1d2c3b4a5f60');
  expect(parseTaskId('prod_1700000000000_ab12')).toBe('prod_1700000000000_ab12');
  for (const bad of ['', '../x', 'a b', 'a?b=1', 'a/b', '_x', 'x'.repeat(101), null, 42, undefined, {}]) expect(parseTaskId(bad)).toBeNull();
});

describe('a studio render (no lease)', () => {
  test('queued and running carry the row stage and percent; nothing can be stopped server-side', () => {
    expect(taskFromRow(row())).toEqual({
      id: 'prod_1700000000000_ab12', kind: 'render', service: 'film', status: 'queued', stage: null, pct: null, attempt: null,
      result: null, error: null, cancellable: false, label: null, position: null, createdAt: '2026-10-09T10:00:00Z', updatedAt: '2026-10-09T10:01:00Z',
    });
    expect(taskFromRow(row({ status: 'processing', current_stage: 'render', pct: 40 }))).toMatchObject({ status: 'running', stage: 'render', pct: 40, cancellable: false });
  });

  test('its label is the owner\'s own words: the prompt, else the brief, else the title, trimmed and cut short', () => {
    expect(taskFromRow(row({ params: { prompt: '  A red car on a coast road  ', brief: 'b' } })).label).toBe('A red car on a coast road');
    expect(taskFromRow(row({ params: { prompt: '   ', brief: 'Launch reel' } })).label).toBe('Launch reel');
    expect(taskFromRow(row({ params: { title: 'Deck' } })).label).toBe('Deck');
    expect(taskFromRow(row({ params: { prompt: 'x'.repeat(200) } })).label).toHaveLength(LABEL_MAX);
    expect(taskFromRow(row({ params: { prompt: 42 } })).label).toBeNull();
    expect(taskFromRow(row({ params: null })).label).toBeNull();
  });

  test('its queue place shows only while it waits, and only a real one (1, 2, …)', () => {
    expect(taskFromRow(row({ status: 'pending', position_in_queue: 2 }))).toMatchObject({ status: 'queued', position: 2 });
    expect(taskFromRow(row({ status: 'pending', position_in_queue: 0 })).position).toBeNull();
    expect(taskFromRow(row({ status: 'pending', position_in_queue: null })).position).toBeNull();
    expect(taskFromRow(row({ status: 'processing', position_in_queue: 3 })).position).toBeNull();
    expect(taskFromRow(row({ status: 'completed', position_in_queue: 1 })).position).toBeNull();
  });

  test('completed: the signed URL first, then the result URL fields; the media follows the service', () => {
    expect(taskFromRow(row({ status: 'completed', signed_url: 'https://s/v.mp4', result: { url: 'https://other' } })).result).toEqual({ url: 'https://s/v.mp4', media: 'video' });
    expect(taskFromRow(row({ status: 'completed', service_type: 'music', result: { audioUrl: 'https://s/a.mp3' } })).result).toEqual({ url: 'https://s/a.mp3', media: 'audio' });
    expect(taskFromRow(row({ status: 'completed', service_type: 'image', result: { imageUrl: 'https://s/i.png' } })).result).toEqual({ url: 'https://s/i.png', media: 'image' });
    expect(taskFromRow(row({ status: 'completed', service_type: 'interior', result: { url: 'https://s/r.png' } })).result).toEqual({ url: 'https://s/r.png', media: 'image' });
    expect(taskFromRow(row({ status: 'completed', service_type: 'other', result: { url: 'https://s/f' } })).result).toEqual({ url: 'https://s/f', media: 'file' });
    const none = taskFromRow(row({ status: 'completed', result: {} }));
    expect(none).toMatchObject({ status: 'completed', pct: 100, result: null });
  });

  test('failed: a cancel reads as cancelled; any other reason is the code "failed", never the raw text', () => {
    expect(taskFromRow(row({ status: 'failed', error: 'Cancelled by user' }))).toMatchObject({ status: 'cancelled', error: 'cancelled' });
    const t = taskFromRow(row({ status: 'failed', error: 'Vertex 500 at https://internal/x?key=abc' }));
    expect(t).toMatchObject({ status: 'failed', error: 'failed', result: null });
    expect(JSON.stringify(t)).not.toContain('internal');
  });
});

describe('an Agent G montage (its executor view)', () => {
  const r = row({ id: 'job-1', status: 'processing', service_type: 'film' });
  test('live: its stage, percent and attempt; its owner can stop it', () => {
    expect(taskFromMontage(r, 'agent-montage', { ok: true, jobId: 'job-1', status: 'running', stage: 'stitch', pct: 55, attempt: 2 }))
      .toMatchObject({ id: 'job-1', kind: 'agent-montage', status: 'running', stage: 'stitch', pct: 55, attempt: 2, cancellable: true, result: null, error: null });
    expect(taskFromMontage(r, 'agent-montage', { ok: true, jobId: 'job-1', status: 'queued', stage: null, pct: 0, attempt: 0 })).toMatchObject({ status: 'queued' });
  });
  test('delivered: the master with its length and aspect', () => {
    expect(taskFromMontage(r, 'agent-montage', { ok: true, jobId: 'job-1', status: 'completed', videoUrl: 'https://s/m.mp4', durationSec: 19.97, aspect: '9:16' }))
      .toMatchObject({ status: 'completed', pct: 100, cancellable: false, result: { url: 'https://s/m.mp4', media: 'video', durationSec: 19.97, aspect: '9:16' } });
  });
  test('ended: cancelled is its own status; every other code is failed with that code', () => {
    expect(taskFromMontage(r, 'agent-montage', { ok: true, jobId: 'job-1', status: 'failed', error: 'cancelled' })).toMatchObject({ status: 'cancelled', error: 'cancelled', cancellable: false });
    expect(taskFromMontage(r, 'agent-montage', { ok: true, jobId: 'job-1', status: 'failed', error: 'qc_failed' })).toMatchObject({ status: 'failed', error: 'qc_failed' });
  });
});

describe('an Agent G audio extraction (its executor view)', () => {
  const r = row({ id: 'job-2', status: 'completed', service_type: 'music' });
  test('delivered: the MP3 with its name, length, size, bitrate and rights', () => {
    expect(taskFromAudio(r, 'agent-audio-extract', {
      ok: true, jobId: 'job-2', status: 'completed', audioUrl: 'https://s/a.mp3', name: 'Concert.mp3', durationSec: 189.5, bytes: 4_546_000, bitrateKbps: 192,
      rights: { status: 'licensed', license: 'CC BY 4.0' },
    })).toMatchObject({
      kind: 'agent-audio-extract', status: 'completed',
      result: { url: 'https://s/a.mp3', media: 'audio', name: 'Concert.mp3', durationSec: 189.5, bytes: 4_546_000, bitrateKbps: 192, rights: { status: 'licensed', license: 'CC BY 4.0' } },
    });
  });
  test('live and ended', () => {
    expect(taskFromAudio(r, 'agent-audio-extract', { ok: true, jobId: 'job-2', status: 'running', stage: 'extract', pct: 30, attempt: 1 })).toMatchObject({ status: 'running', cancellable: true });
    expect(taskFromAudio(r, 'agent-audio-extract', { ok: true, jobId: 'job-2', status: 'failed', error: 'no_audio' })).toMatchObject({ status: 'failed', error: 'no_audio' });
  });
});

test('final: completed, failed, cancelled', () => {
  expect(['queued', 'running', 'completed', 'failed', 'cancelled'].map((status) => isFinal({ status } as never))).toEqual([false, false, true, true, true]);
});

describe('an Agent G multi-step run (PART 2): one task with its steps and its events', () => {
  const T0 = 1_000_000;
  const spec = {
    title: 'Clips to the concert sound',
    steps: [
      { id: 'sound', tool: 'audio_extract' as const, source: { file: 'omni-uploads/user-1/v.mp4' } },
      { id: 'clip', tool: 'montage' as const, files: ['omni-uploads/user-1/a.mp4', 'omni-uploads/user-1/b.mp4', { step: 'sound' }] },
    ],
  };
  const approval = { quoteFingerprint: 'run:x', channel: 'tap' as const, evidence: 'plan', at: new Date(T0).toISOString(), userId: 'user-1' };
  const runRow = (r: Partial<TaskRow> = {}) => row({ id: '0b9f2c1e-4c2a-4f7e-9a51-1d2c3b4a5f60', status: 'processing', params: { _exec: { kind: 'agent-run' } }, ...r });
  const AUDIO = 'https://x.supabase.co/storage/v1/object/sign/renders/audio/a.mp3?token=t';
  const VIDEO = 'https://x.supabase.co/storage/v1/object/sign/renders/montage/m.mp4?token=t';

  /** sound delivered, clip running at 40%. */
  function midway(): RunState {
    const run = newRun(spec, approval, () => 0, T0);
    run.status = 'running';
    const sound = stepOf(run, 'sound')!;
    sound.taskId = 'aud-1';
    moveStep(run, sound, 'queued', T0, 'step.queued');
    moveStep(run, sound, 'running', T0, 'step.running');
    sound.output = { url: AUDIO, media: 'audio', durationSec: 189.5, name: 'concert.mp3' };
    moveStep(run, sound, 'completed', T0, 'step.completed', 'audio');
    const clip = stepOf(run, 'clip')!;
    clip.taskId = 'job-1';
    moveStep(run, clip, 'queued', T0, 'step.queued');
    return run;
  }

  test('live: which step of how many, the share done, every step with its own job, stage and result; the run can be stopped', () => {
    const t = taskFromRun(runRow(), midway(), { clip: { state: 'live', running: true, stage: 'stitch', pct: 40 } });
    expect(t).toMatchObject({
      kind: 'agent-run', status: 'running', stage: '2/2:clip', pct: 70, result: null, error: null, cancellable: true, label: 'Clips to the concert sound',
    });
    expect(t.steps).toEqual([
      { id: 'sound', tool: 'audio_extract', capability: 'agent.audio-extract', status: 'completed', taskId: 'aud-1', stage: null, pct: 100, result: { url: AUDIO, media: 'audio', name: 'concert.mp3', durationSec: 189.5 }, error: null, reused: false, approval: null },
      { id: 'clip', tool: 'montage', capability: 'agent.montage', status: 'queued', taskId: 'job-1', stage: 'stitch', pct: 40, result: null, error: null, reused: false, approval: null },
    ]);
    expect(t.events!.map((e) => e.type)).toEqual(['run.created', 'step.queued', 'step.running', 'step.completed', 'step.queued']);
    // `after`: only what the reader has not seen yet.
    expect(taskFromRun(runRow(), midway(), {}, { after: 3 }).events!.map((e) => e.seq)).toEqual([4, 5]);
    // A stop already asked for: no second stop button.
    expect(taskFromRun(runRow(), { ...midway(), cancelRequested: true }).cancellable).toBe(false);
  });

  test('waiting for a yes: the step carries the price and the quote id the yes must name', () => {
    const run = newRun(spec, approval, () => 0, T0);
    const sound = stepOf(run, 'sound')!;
    sound.quote = { taskId: 'aud-1', credits: 5, request: {}, token: 'tok', expiresAt: T0 + 60_000, quoteId: 'q-1' };
    moveStep(run, sound, 'awaiting_approval', T0, 'step.awaiting_approval');
    run.status = 'awaiting_approval';
    const t = taskFromRun(runRow(), run);
    expect(t).toMatchObject({ status: 'awaiting_approval', stage: 'awaiting_approval', cancellable: true });
    expect(t.steps![0]).toMatchObject({ status: 'awaiting_approval', approval: { credits: 5, quoteId: 'q-1', expiresAt: T0 + 60_000 } });
  });

  test('ended: completed gives the last result; partially completed keeps what was delivered; cancelled and failed say so', () => {
    const done = midway();
    const clip = stepOf(done, 'clip')!;
    clip.output = { url: VIDEO, media: 'video', durationSec: 30 };
    moveStep(done, clip, 'running', T0, 'step.running');
    moveStep(done, clip, 'completed', T0, 'step.completed');
    done.status = 'completed';
    expect(taskFromRun(runRow({ status: 'completed' }), done)).toMatchObject({ status: 'completed', stage: null, pct: 100, result: { url: VIDEO, media: 'video' }, error: null, cancellable: false });

    const part = midway();
    const c2 = stepOf(part, 'clip')!;
    c2.error = 'render_failed';
    moveStep(part, c2, 'failed', T0, 'step.failed');
    part.status = 'partially_completed';
    part.error = 'render_failed';
    expect(taskFromRun(runRow({ status: 'completed' }), part)).toMatchObject({ status: 'partially_completed', pct: null, result: { url: AUDIO, media: 'audio' }, error: 'render_failed' });

    expect(taskFromRun(runRow({ status: 'failed' }), { ...midway(), status: 'cancelled', error: 'cancelled' })).toMatchObject({ status: 'cancelled', error: 'cancelled', result: null, cancellable: false });
    expect(isFinal({ status: 'partially_completed' })).toBe(true);
  });

  test('a step job names its run (`_parent`), so the tray can show the run alone', () => {
    expect(taskFromMontage(row({ id: 'job-1', params: { _parent: 'run-1' } }), 'agent-montage', { ok: true, jobId: 'job-1', status: 'running', stage: 'stitch', pct: 40, attempt: 1 }).parentId).toBe('run-1');
    expect(taskFromRow(row()).parentId).toBeUndefined();
  });
});
