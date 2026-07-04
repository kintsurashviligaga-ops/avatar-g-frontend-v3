import { mapDbJobToTrayJob, mapActiveDbJobs, mergeTrayJobs, serviceTypeForKind } from './durableJobs';
import type { GenerationJobRow } from '@/lib/orchestrator/jobs';
import type { Job } from './jobQueue';

function row(over: Partial<GenerationJobRow> = {}): GenerationJobRow {
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

function localJob(over: Partial<Job> = {}): Job {
  return {
    id: 'image#1', kind: 'image', label: 'local', status: 'rendering', pct: 30, stage: null,
    position: null, error: null, result: null, createdAt: 5000, startedAt: 5000, endedAt: null, ...over,
  };
}

describe('durableJobs — hydrate the tray from generation_jobs', () => {
  it('maps a processing row to an OBSERVED rendering job synced to pct + current_stage', () => {
    const j = mapDbJobToTrayJob(row(), 'en');
    expect(j.status).toBe('rendering');
    expect(j.kind).toBe('video'); // film → video
    expect(j.pct).toBe(45);
    expect(j.stage).toBe('Rendering scenes 3/6');
    expect(j.observed).toBe(true);
    expect(j.position).toBeNull();
  });

  it('maps completed → done (pct forced 100) and failed → failed (error carried)', () => {
    expect(mapDbJobToTrayJob(row({ status: 'completed', pct: 90 })).status).toBe('done');
    expect(mapDbJobToTrayJob(row({ status: 'completed', pct: 90 })).pct).toBe(100);
    const f = mapDbJobToTrayJob(row({ status: 'failed', error: 'provider 500' }));
    expect(f.status).toBe('failed');
    expect(f.error).toBe('provider 500');
  });

  it('maps each service_type to the right tray kind', () => {
    expect(mapDbJobToTrayJob(row({ service_type: 'music' })).kind).toBe('music');
    expect(mapDbJobToTrayJob(row({ service_type: 'avatar' })).kind).toBe('avatar');
    expect(mapDbJobToTrayJob(row({ service_type: 'image' })).kind).toBe('image');
    expect(mapDbJobToTrayJob(row({ service_type: 'voice' })).kind).toBe('music');
    expect(mapDbJobToTrayJob(row({ service_type: 'interior' })).kind).toBe('image');
  });

  it('prefers a params prompt/brief as the label, else a localized kind fallback', () => {
    expect(mapDbJobToTrayJob(row({ params: { prompt: 'A red sports car on a coastal road' } }), 'en').label)
      .toBe('A red sports car on a coastal road');
    expect(mapDbJobToTrayJob(row({ params: {} }), 'en').label).toBe('Video'); // film → video kind label
    expect(mapDbJobToTrayJob(row({ params: {}, service_type: 'music' }), 'ka').label).toBe('მუსიკა');
  });

  it('clamps an out-of-range pct into 0–100', () => {
    expect(mapDbJobToTrayJob(row({ pct: 140 })).pct).toBe(100);
    expect(mapDbJobToTrayJob(row({ pct: -10 })).pct).toBe(0);
    expect(mapDbJobToTrayJob(row({ pct: 45.7 })).pct).toBe(46);
  });

  it('mapActiveDbJobs keeps only running rows, oldest-first', () => {
    const rows = [
      row({ id: 'a', status: 'processing', created_at: '2026-07-04T00:00:03.000Z' }),
      row({ id: 'b', status: 'completed', created_at: '2026-07-04T00:00:02.000Z' }), // dropped
      row({ id: 'c', status: 'pending', created_at: '2026-07-04T00:00:01.000Z' }),
      row({ id: 'd', status: 'failed', created_at: '2026-07-04T00:00:00.000Z' }), // dropped
    ];
    const active = mapActiveDbJobs(rows);
    expect(active.map((j) => j.id)).toEqual(['c', 'a']); // c older than a, terminals filtered
    expect(active.every((j) => j.status === 'rendering' && j.observed)).toBe(true);
  });

  it('maps a pending row WITH a queue position to a queued job (reload recovers waiting jobs)', () => {
    const j = mapDbJobToTrayJob(row({ status: 'pending', position_in_queue: 2, params: { prompt: 'lofi beat' } }), 'en');
    expect(j.status).toBe('queued');
    expect(j.position).toBe(2);
    expect(j.pct).toBe(0);
    expect(j.observed).toBe(true);
  });

  it('a pending row WITHOUT a real position stays rendering (job just starting, not waiting)', () => {
    expect(mapDbJobToTrayJob(row({ status: 'pending' })).status).toBe('rendering');
    expect(mapDbJobToTrayJob(row({ status: 'pending', position_in_queue: null })).status).toBe('rendering');
    expect(mapDbJobToTrayJob(row({ status: 'pending', position_in_queue: 0 })).status).toBe('rendering'); // 0 ⇒ not a real position
  });

  it('mapActiveDbJobs restores the layout: rendering first (oldest-first), then queued by position', () => {
    const rows = [
      row({ id: 'q2', status: 'pending', position_in_queue: 2, created_at: '2026-07-04T00:00:05.000Z' }),
      row({ id: 'r1', status: 'processing', created_at: '2026-07-04T00:00:02.000Z' }),
      row({ id: 'q1', status: 'pending', position_in_queue: 1, created_at: '2026-07-04T00:00:04.000Z' }),
      row({ id: 'r0', status: 'processing', created_at: '2026-07-04T00:00:01.000Z' }),
      row({ id: 'gone', status: 'completed' }), // dropped
    ];
    const active = mapActiveDbJobs(rows);
    expect(active.map((j) => j.id)).toEqual(['r0', 'r1', 'q1', 'q2']); // rendering oldest-first, then queue #1,#2
    expect(active.map((j) => j.status)).toEqual(['rendering', 'rendering', 'queued', 'queued']);
    expect(active[2]!.position).toBe(1);
    expect(active[3]!.position).toBe(2);
  });

  it('mergeTrayJobs dedups by id (local wins) and lists observed jobs first', () => {
    const durable = [mapDbJobToTrayJob(row({ id: 'x' })), mapDbJobToTrayJob(row({ id: 'image#1' }))];
    const local = [localJob({ id: 'image#1' })]; // same id as a durable row → local wins, no dup
    const merged = mergeTrayJobs(local, durable);
    expect(merged.map((j) => j.id)).toEqual(['x', 'image#1']); // observed 'x' first, then the local
    expect(merged.find((j) => j.id === 'image#1')!.observed).toBeUndefined(); // the LOCAL one
    expect(merged.find((j) => j.id === 'image#1')!.label).toBe('local');
  });

  it('mergeTrayJobs handles empty sides', () => {
    expect(mergeTrayJobs([], [])).toEqual([]);
    expect(mergeTrayJobs([localJob()], [])).toHaveLength(1);
    expect(mergeTrayJobs([], [mapDbJobToTrayJob(row())])).toHaveLength(1);
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
    expect(mapDbJobToTrayJob(row({ service_type: serviceTypeForKind('image') })).kind).toBe('image');
    expect(mapDbJobToTrayJob(row({ service_type: serviceTypeForKind('product') })).kind).toBe('video');
  });
});
