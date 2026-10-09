import { mapTaskToTrayJob, mapActiveTasks, mergeTrayJobs, serviceTypeForKind } from './durableJobs';
import { taskFromRow, type TaskRow, type TaskView } from '@/lib/tasks/taskView';
import type { Job } from './jobQueue';

function row(over: Partial<TaskRow> = {}): TaskRow {
  return {
    id: 'prod_1',
    user_id: 'u1',
    service_type: 'film',
    status: 'processing',
    current_stage: 'Rendering scenes 3/6',
    pct: 45,
    params: {},
    result: null,
    signed_url: null,
    error: null,
    created_at: '2026-07-04T00:00:00.000Z',
    updated_at: '2026-07-04T00:01:00.000Z',
    ...over,
  };
}

/** The whole read path: a generation_jobs row → its task (GET /api/tasks) → the tray's row. */
const fromRow = (r: TaskRow, locale: 'ka' | 'en' | 'ru' = 'ka') => mapTaskToTrayJob(taskFromRow(r), locale);
const activeOf = (rows: TaskRow[], nowMs: number) => mapActiveTasks(rows.map(taskFromRow), 'ka', nowMs);

/** An Agent G lease job's task, as its executor reports it through /api/tasks. */
function lease(over: Partial<TaskView> = {}): TaskView {
  return {
    id: '11111111-2222-4333-8444-555555555555', kind: 'agent-montage', service: 'film', status: 'running', stage: 'stitch',
    pct: 55, attempt: 1, result: null, error: null, cancellable: true, label: null, position: null,
    createdAt: '2026-07-04T00:00:00.000Z', updatedAt: '2026-07-04T00:01:00.000Z', ...over,
  };
}

function localJob(over: Partial<Job> = {}): Job {
  return {
    id: 'image#1', kind: 'image', label: 'local', status: 'rendering', pct: 30, stage: null,
    position: null, error: null, result: null, createdAt: 5000, startedAt: 5000, endedAt: null, ...over,
  };
}

describe('durableJobs — hydrate the tray from the caller\'s tasks (/api/tasks)', () => {
  it('maps a processing row to an OBSERVED rendering job synced to pct + current_stage', () => {
    const j = fromRow(row(), 'en');
    expect(j.status).toBe('rendering');
    expect(j.kind).toBe('video'); // film → video
    expect(j.pct).toBe(45);
    expect(j.stage).toBe('Rendering scenes 3/6');
    expect(j.observed).toBe(true);
    expect(j.position).toBeNull();
  });

  it('maps completed → done (pct forced 100), failed → failed and a cancel → canceled (codes, not raw errors)', () => {
    expect(fromRow(row({ status: 'completed', pct: 90 })).status).toBe('done');
    expect(fromRow(row({ status: 'completed', pct: 90 })).pct).toBe(100);
    const f = fromRow(row({ status: 'failed', error: 'provider 500' }));
    expect(f.status).toBe('failed');
    expect(f.error).toBe('failed'); // a task carries a code, never the provider's raw words
    expect(fromRow(row({ status: 'failed', error: 'cancelled by user' })).status).toBe('canceled');
  });

  it('maps each service_type to the right tray kind', () => {
    expect(fromRow(row({ service_type: 'music' })).kind).toBe('music');
    expect(fromRow(row({ service_type: 'avatar' })).kind).toBe('avatar');
    expect(fromRow(row({ service_type: 'image' })).kind).toBe('image');
    expect(fromRow(row({ service_type: 'voice' })).kind).toBe('music');
    expect(fromRow(row({ service_type: 'interior' })).kind).toBe('image');
  });

  it('prefers a params prompt/brief as the label, else a localized kind fallback', () => {
    expect(fromRow(row({ params: { prompt: 'A red sports car on a coastal road' } }), 'en').label)
      .toBe('A red sports car on a coastal road');
    expect(fromRow(row({ params: {} }), 'en').label).toBe('Video'); // film → video kind label
    expect(fromRow(row({ params: {}, service_type: 'music' }), 'ka').label).toBe('მუსიკა');
  });

  it('clamps an out-of-range pct into 0–100', () => {
    expect(fromRow(row({ pct: 140 })).pct).toBe(100);
    expect(fromRow(row({ pct: -10 })).pct).toBe(0);
    expect(fromRow(row({ pct: 45.7 })).pct).toBe(46);
  });

  it('mapActiveTasks keeps only live tasks, oldest-first', () => {
    const rows = [
      row({ id: 'a', status: 'processing', created_at: '2026-07-04T00:00:03.000Z' }),
      row({ id: 'b', status: 'completed', created_at: '2026-07-04T00:00:02.000Z' }), // dropped
      row({ id: 'c', status: 'pending', created_at: '2026-07-04T00:00:01.000Z' }),
      row({ id: 'd', status: 'failed', created_at: '2026-07-04T00:00:00.000Z' }), // dropped
    ];
    const active = activeOf(rows, Date.parse('2026-07-04T00:05:00.000Z')); // fresh vs fixtures
    expect(active.map((j) => j.id)).toEqual(['c', 'a']); // c older than a, terminals filtered
    expect(active.every((j) => j.status === 'rendering' && j.observed)).toBe(true);
  });

  it('maps a pending row WITH a queue position to a queued job (reload recovers waiting jobs)', () => {
    const j = fromRow(row({ status: 'pending', position_in_queue: 2, params: { prompt: 'lofi beat' } }), 'en');
    expect(j.status).toBe('queued');
    expect(j.position).toBe(2);
    expect(j.pct).toBe(0);
    expect(j.observed).toBe(true);
  });

  it('a pending row WITHOUT a real position stays rendering (job just starting, not waiting)', () => {
    expect(fromRow(row({ status: 'pending' })).status).toBe('rendering');
    expect(fromRow(row({ status: 'pending', position_in_queue: null })).status).toBe('rendering');
    expect(fromRow(row({ status: 'pending', position_in_queue: 0 })).status).toBe('rendering'); // 0 ⇒ not a real position
  });

  it('mapActiveTasks restores the layout: rendering first (oldest-first), then queued by position', () => {
    const rows = [
      row({ id: 'q2', status: 'pending', position_in_queue: 2, created_at: '2026-07-04T00:00:05.000Z' }),
      row({ id: 'r1', status: 'processing', created_at: '2026-07-04T00:00:02.000Z' }),
      row({ id: 'q1', status: 'pending', position_in_queue: 1, created_at: '2026-07-04T00:00:04.000Z' }),
      row({ id: 'r0', status: 'processing', created_at: '2026-07-04T00:00:01.000Z' }),
      row({ id: 'gone', status: 'completed' }), // dropped
    ];
    const active = activeOf(rows, Date.parse('2026-07-04T00:05:00.000Z')); // fresh vs fixtures
    expect(active.map((j) => j.id)).toEqual(['r0', 'r1', 'q1', 'q2']); // rendering oldest-first, then queue #1,#2
    expect(active.map((j) => j.status)).toEqual(['rendering', 'rendering', 'queued', 'queued']);
    expect(active[2]!.position).toBe(1);
    expect(active[3]!.position).toBe(2);
  });

  it('drops a STALE phantom: an active row older than STALE_ACTIVE_MS never spins forever', () => {
    const rows = [
      row({ id: 'live', status: 'processing', created_at: '2026-07-04T00:00:00.000Z', updated_at: '2026-07-04T00:04:00.000Z' }),
      row({ id: 'phantom', status: 'processing', created_at: '2026-07-04T00:00:00.000Z', updated_at: '2026-07-04T00:00:00.000Z' }),
    ];
    // "now" = 40 min after the fixtures → the phantom (last touched at 00:00) is >30min stale; the live
    // one (touched at 00:04) is 36 min old → also stale. Use a now that separates them: 20 min after live.
    const now = Date.parse('2026-07-04T00:24:00.000Z'); // live is 20min old (kept), phantom is 24min... both < 30
    expect(activeOf(rows, now).map((j) => j.id)).toEqual(['live', 'phantom']);
    // push now far past the window: BOTH are now stale phantoms → tray clears (no perpetual spinner)
    const later = Date.parse('2026-07-04T01:00:00.000Z'); // 56–60 min old
    expect(activeOf(rows, later)).toEqual([]);
    // a row with NO parseable timestamp is kept (never punish missing metadata)
    const noTs = [row({ id: 'notime', status: 'processing', created_at: '', updated_at: '' })];
    expect(activeOf(noTs, later).map((j) => j.id)).toEqual(['notime']);
  });

  it('a studio render is read-only in the tray: no server-side stop, so no cancel', () => {
    expect(fromRow(row()).cancellable).toBe(false);
    expect(fromRow(row({ status: 'pending', position_in_queue: 1 })).cancellable).toBe(false);
  });

  it('cuts a long prompt to the tray\'s row', () => {
    const long = 'A slow aerial shot over a misty pine forest at dawn, golden light';
    expect(fromRow(row({ params: { prompt: long } }), 'en').label).toBe(long.slice(0, 42));
    expect(fromRow(row({ params: { brief: '  Product ad  ' } }), 'en').label).toBe('Product ad');
  });

  it('an Agent G montage is named for what it is, its stage in words, and the server can stop it while it runs', () => {
    const j = mapTaskToTrayJob(lease(), 'en');
    expect(j).toMatchObject({ id: lease().id, kind: 'video', label: 'Agent G · montage', status: 'rendering', pct: 55, stage: 'Joining the shots', observed: true, cancellable: true });
    expect(mapTaskToTrayJob(lease(), 'ka')).toMatchObject({ label: 'Agent G · მონტაჟი', stage: 'კადრებს ვაერთებ' });
    expect(mapTaskToTrayJob(lease(), 'ru').label).toBe('Agent G · монтаж');
    // A stage code the chat has no words for still reads as the edit starting, never as a raw code.
    expect(mapTaskToTrayJob(lease({ stage: 'mystery' }), 'en').stage).toBe('Starting the edit');
  });

  it('an Agent G MP3 extraction takes the music icon and the audio card\'s words', () => {
    const j = mapTaskToTrayJob(lease({ kind: 'agent-audio-extract', service: 'music', stage: 'qc', pct: 85 }), 'en');
    expect(j).toMatchObject({ kind: 'music', label: 'Agent G · MP3', stage: 'Checking the result', pct: 85, cancellable: true });
  });

  it('a lease job waiting for a worker stays a live row (it has no studio queue place) and can be stopped', () => {
    const j = mapTaskToTrayJob(lease({ status: 'queued', stage: 'queued', pct: 0 }), 'en');
    expect(j).toMatchObject({ status: 'rendering', stage: 'Queued, starting shortly', cancellable: true, position: null });
  });

  it('only a live task offers a stop, even when the server still says cancellable', () => {
    expect(mapTaskToTrayJob(lease({ status: 'completed', cancellable: true, pct: 100 })).cancellable).toBe(false);
    expect(mapTaskToTrayJob(lease({ status: 'cancelled', cancellable: true, error: 'cancelled' }))).toMatchObject({ status: 'canceled', cancellable: false });
    expect(mapTaskToTrayJob(lease({ status: 'running', cancellable: false })).cancellable).toBe(false);
  });

  it('mapActiveTasks lists a live Agent G job beside the studio renders, and drops it once it ends', () => {
    const now = Date.parse('2026-07-04T00:05:00.000Z');
    const tasks = [taskFromRow(row({ id: 'r1', created_at: '2026-07-04T00:00:01.000Z' })), lease({ createdAt: '2026-07-04T00:00:00.000Z' })];
    expect(mapActiveTasks(tasks, 'en', now).map((j) => j.id)).toEqual([lease().id, 'r1']);
    expect(mapActiveTasks([lease({ status: 'completed' })], 'en', now)).toEqual([]);
  });

  it('mergeTrayJobs dedups by id (local wins) and lists observed jobs first', () => {
    const durable = [fromRow(row({ id: 'x' })), fromRow(row({ id: 'image#1' }))];
    const local = [localJob({ id: 'image#1' })]; // same id as a durable row → local wins, no dup
    const merged = mergeTrayJobs(local, durable);
    expect(merged.map((j) => j.id)).toEqual(['x', 'image#1']); // observed 'x' first, then the local
    expect(merged.find((j) => j.id === 'image#1')!.observed).toBeUndefined(); // the LOCAL one
    expect(merged.find((j) => j.id === 'image#1')!.label).toBe('local');
  });

  it('mergeTrayJobs handles empty sides', () => {
    expect(mergeTrayJobs([], [])).toEqual([]);
    expect(mergeTrayJobs([localJob()], [])).toHaveLength(1);
    expect(mergeTrayJobs([], [fromRow(row())])).toHaveLength(1);
  });

  it('serviceTypeForKind (write-side) maps every JobKind to a VALID generation_jobs type', () => {
    // Only film|avatar|interior|image|music|voice satisfy the table CHECK — the video-ish
    // composer kinds collapse to 'film'.
    expect(serviceTypeForKind('image')).toBe('image');
    expect(serviceTypeForKind('music')).toBe('music');
    expect(serviceTypeForKind('avatar')).toBe('avatar');
    expect(serviceTypeForKind('lipsync')).toBe('avatar');
    expect(serviceTypeForKind('product')).toBe('film');
    expect(serviceTypeForKind('remix')).toBe('film');
    expect(serviceTypeForKind('video')).toBe('film');
    expect(serviceTypeForKind(undefined)).toBe('film');
    // Round-trip: a written kind hydrates back to a sensible tray kind.
    expect(fromRow(row({ service_type: serviceTypeForKind('image') })).kind).toBe('image');
    expect(fromRow(row({ service_type: serviceTypeForKind('product') })).kind).toBe('video');
  });
});
