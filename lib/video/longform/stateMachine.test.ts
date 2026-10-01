/** @jest-environment node */
/**
 * stateMachine.ts — exhaustive: every scene status × every scene event and every job status × every job event
 * (legal → the documented result, illegal → refused, never a throw), backoff and the failure budget, the refund
 * markers for every terminal path, settle() (cancel, deadline, early abort, stitch, hold expiry, idempotence),
 * planWork() (concurrency cap, order, reservation just ahead of need, holds, stale claims, render timeouts, act
 * chaining), the provider-outcome classifiers, and a full simulated film driven tick by tick.
 */
import {
  allowedFailures,
  applyJobEvent,
  applySceneEvent,
  backoffMs,
  classifySubmit,
  DEFAULT_MACHINE_CONFIG as CFG,
  diffState,
  JOB_STATUSES,
  planWork,
  pollEvent,
  refundableScenes,
  SCENE_STATUSES,
  settle,
  type JobEvent,
  type JobState,
  type JobStatus,
  type MachineConfig,
  type SceneEvent,
  type SceneState,
  type SceneStatus,
} from './stateMachine';

const T0 = 1_800_000_000_000;
const MIN = 60_000;

const scene = (o: Partial<SceneState> = {}): SceneState => ({
  ordinal: 0, act: 0, status: 'queued', attempts: 0, operation: null, nextAttemptAt: null, submittedAt: null,
  dependsOn: null, seedFrameUrl: null, chargeRef: null, chargeCredits: 0, refunded: false, outputUrl: null, error: null,
  ...o,
});
const job = (o: Partial<JobState> = {}): JobState => ({
  status: 'rendering', cancelRequested: false, holdUntil: null, holdReason: null, stitchAttempts: 0,
  deadlineAt: T0 + 24 * 60 * MIN, errorCode: null, outputUrl: null, ...o,
});
const charged = (o: Partial<SceneState> = {}) => scene({ chargeRef: 'longform:j:act:0', chargeCredits: 39, ...o });
/** n scenes split into acts of `perAct`, all reserved unless told otherwise. */
const film = (n: number, perAct = 12, o: (i: number) => Partial<SceneState> = () => ({})) =>
  Array.from({ length: n }, (_, i) => charged({ ordinal: i, act: Math.floor(i / perAct), chargeRef: `ref:${Math.floor(i / perAct)}`, ...o(i) }));

// ── Scene events ─────────────────────────────────────────────────────────────────────────────────────────────

const SCENE_EVENTS: SceneEvent[] = [
  { type: 'claimed', at: T0 },
  { type: 'submit_ok', operation: 'models/veo/operations/1', at: T0 },
  { type: 'submit_retry', reason: 'rate_limited', at: T0 },
  { type: 'submit_hold', until: T0 + MIN },
  { type: 'submit_failed', reason: 'invalid_request' },
  { type: 'poll_processing', at: T0 },
  { type: 'poll_undeliverable', at: T0 },
  { type: 'poll_delivered', url: 'https://cdn/x.mp4', at: T0 },
  { type: 'poll_failed', reason: 'boom', at: T0 },
  { type: 'poll_filtered', reason: 'safety' },
  { type: 'claim_lost' },
  { type: 'render_timeout' },
  { type: 'abandon', reason: 'canceled' },
  { type: 'charged', ref: 'ref:new', credits: 39 },
  { type: 'refunded' },
  { type: 'seed_frame', url: 'https://cdn/f.jpg' },
];

const LEGAL_FROM: Record<SceneEvent['type'], SceneStatus[]> = {
  claimed: ['queued'],
  submit_ok: ['submitted'],
  submit_retry: ['submitted'],
  submit_hold: ['submitted'],
  submit_failed: ['submitted'],
  poll_processing: ['rendering'],
  poll_undeliverable: ['rendering'],
  poll_delivered: ['rendering'],
  poll_failed: ['rendering'],
  poll_filtered: ['rendering'],
  claim_lost: ['submitted'],
  render_timeout: ['rendering'],
  abandon: ['queued', 'submitted', 'rendering'],
  charged: ['queued'],
  refunded: ['delivered', 'failed'],
  seed_frame: ['queued'],
};

/** A scene in `status` that satisfies every NON-status precondition of `event`. */
function sceneFor(status: SceneStatus, event: SceneEvent): SceneState {
  const base: Partial<SceneState> = { status, attempts: 1 };
  if (event.type === 'refunded') Object.assign(base, { chargeRef: 'ref:0', chargeCredits: 39 });
  if (event.type === 'seed_frame') Object.assign(base, { dependsOn: 9 });
  return scene(base);
}

describe('applySceneEvent — the full status × event matrix', () => {
  for (const event of SCENE_EVENTS) {
    for (const status of SCENE_STATUSES) {
      const legal = LEGAL_FROM[event.type].includes(status);
      test(`${event.type} on ${status} → ${legal ? 'applied' : 'refused'}`, () => {
        const t = applySceneEvent(sceneFor(status, event), event);
        expect(t.ok).toBe(legal);
        if (!t.ok) expect(t.reason).toBe(`illegal_transition: ${event.type} on a ${status} scene`);
      });
    }
  }
});

describe('applySceneEvent — results', () => {
  const ok = (s: SceneState, e: SceneEvent, cfg: MachineConfig = CFG) => {
    const t = applySceneEvent(s, e, cfg);
    if (!t.ok) throw new Error(t.reason);
    return t.scene;
  };

  test('claimed: queued → submitted, attempts + 1, stamped, operation cleared', () => {
    expect(ok(scene({ attempts: 1, nextAttemptAt: T0 - 1, error: 'old' }), { type: 'claimed', at: T0 })).toMatchObject({
      status: 'submitted', attempts: 2, submittedAt: T0, operation: null, nextAttemptAt: null, error: null,
    });
  });

  test('submit_ok records the operation and restarts the render clock; an empty name is refused', () => {
    const s = ok(scene({ status: 'submitted', submittedAt: T0 - 5000 }), { type: 'submit_ok', operation: 'models/m/operations/9', at: T0 });
    expect(s).toMatchObject({ status: 'rendering', operation: 'models/m/operations/9', submittedAt: T0 });
    expect(applySceneEvent(scene({ status: 'submitted' }), { type: 'submit_ok', operation: '', at: T0 }).ok).toBe(false);
  });

  test('submit_retry: backoff 30 s → 60 s → exhausted at maxAttempts (3)', () => {
    expect(ok(scene({ status: 'submitted', attempts: 1 }), { type: 'submit_retry', reason: 'rate_limited', at: T0 })).toMatchObject({
      status: 'queued', nextAttemptAt: T0 + 30_000, operation: null, error: 'rate_limited',
    });
    expect(ok(scene({ status: 'submitted', attempts: 2 }), { type: 'submit_retry', reason: 'unavailable', at: T0 }).nextAttemptAt).toBe(T0 + 60_000);
    expect(ok(scene({ status: 'submitted', attempts: 3 }), { type: 'submit_retry', reason: 'unavailable', at: T0 })).toMatchObject({
      status: 'failed', error: 'retries_exhausted: unavailable', nextAttemptAt: null,
    });
  });

  test('submit_hold: back to queued until the hold ends, and the attempt is given back', () => {
    expect(ok(scene({ status: 'submitted', attempts: 1 }), { type: 'submit_hold', until: T0 + 30 * MIN })).toMatchObject({
      status: 'queued', attempts: 0, nextAttemptAt: T0 + 30 * MIN,
    });
    expect(ok(scene({ status: 'submitted', attempts: 0 }), { type: 'submit_hold', until: T0 }).attempts).toBe(0);
  });

  test('submit_failed / claim_lost / poll_filtered / render_timeout / abandon are final', () => {
    expect(ok(scene({ status: 'submitted' }), { type: 'submit_failed', reason: 'ambiguous_submit' })).toMatchObject({ status: 'failed', error: 'ambiguous_submit' });
    expect(ok(scene({ status: 'submitted' }), { type: 'claim_lost' }).error).toMatch(/^claim_lost/);
    expect(ok(scene({ status: 'rendering' }), { type: 'poll_filtered', reason: 'celebrity' }).error).toBe('filtered: celebrity');
    expect(ok(scene({ status: 'rendering' }), { type: 'render_timeout' }).error).toBe('render_timeout');
    expect(ok(scene({ status: 'queued' }), { type: 'abandon', reason: 'canceled' })).toMatchObject({ status: 'failed', error: 'canceled' });
    expect(ok(scene({ status: 'submitted' }), { type: 'submit_failed', reason: 'x'.repeat(999) }).error).toHaveLength(300);
  });

  test('poll_processing / poll_undeliverable keep rendering and space the next poll', () => {
    expect(ok(scene({ status: 'rendering' }), { type: 'poll_processing', at: T0 }).nextAttemptAt).toBe(T0 + CFG.pollIntervalMs);
    expect(ok(scene({ status: 'rendering' }), { type: 'poll_undeliverable', at: T0 })).toMatchObject({ status: 'rendering', nextAttemptAt: T0 + 2 * CFG.pollIntervalMs });
  });

  test('poll_delivered stores the URL; an empty URL is refused', () => {
    expect(ok(scene({ status: 'rendering', error: 'undeliverable: retrying delivery' }), { type: 'poll_delivered', url: 'https://cdn/a.mp4', at: T0 })).toMatchObject({
      status: 'delivered', outputUrl: 'https://cdn/a.mp4', error: null,
    });
    expect(applySceneEvent(scene({ status: 'rendering' }), { type: 'poll_delivered', url: '', at: T0 }).ok).toBe(false);
  });

  test('poll_failed: the operation is over → a fresh submit is safe (re-queued), until attempts run out', () => {
    expect(ok(scene({ status: 'rendering', attempts: 1, operation: 'op' }), { type: 'poll_failed', reason: 'internal', at: T0 })).toMatchObject({
      status: 'queued', operation: null, nextAttemptAt: T0 + 30_000, error: 'generation_failed: internal',
    });
    expect(ok(scene({ status: 'rendering', attempts: 3 }), { type: 'poll_failed', reason: 'internal', at: T0 }).status).toBe('failed');
  });

  test('charged is idempotent on the same ref, refused for another ref or a non-queued scene', () => {
    const c = ok(scene(), { type: 'charged', ref: 'ref:0', credits: 39 });
    expect(c).toMatchObject({ chargeRef: 'ref:0', chargeCredits: 39 });
    expect(ok(c, { type: 'charged', ref: 'ref:0', credits: 39 })).toBe(c);
    expect(applySceneEvent(c, { type: 'charged', ref: 'ref:1', credits: 39 }).ok).toBe(false);
    expect(applySceneEvent(scene(), { type: 'charged', ref: '', credits: 39 }).ok).toBe(false);
    expect(applySceneEvent(scene(), { type: 'charged', ref: 'r', credits: NaN }).ok).toBe(false);
    expect(ok(scene(), { type: 'charged', ref: 'promo', credits: 0 })).toMatchObject({ chargeRef: 'promo', chargeCredits: 0 });
  });

  test('refunded only once, only when charged, only when terminal', () => {
    const f = charged({ status: 'failed' });
    const r = ok(f, { type: 'refunded' });
    expect(r.refunded).toBe(true);
    expect(applySceneEvent(r, { type: 'refunded' }).ok).toBe(false);
    expect(applySceneEvent(scene({ status: 'failed' }), { type: 'refunded' }).ok).toBe(false); // never charged
    expect(applySceneEvent(charged({ status: 'failed', chargeCredits: 0 }), { type: 'refunded' }).ok).toBe(false);
  });

  test('seed_frame: a URL is recorded; null drops the dependency (fail-open)', () => {
    expect(ok(scene({ dependsOn: 9 }), { type: 'seed_frame', url: 'https://cdn/f.jpg' })).toMatchObject({ dependsOn: 9, seedFrameUrl: 'https://cdn/f.jpg' });
    expect(ok(scene({ dependsOn: 9 }), { type: 'seed_frame', url: null })).toMatchObject({ dependsOn: null, seedFrameUrl: null });
    expect(applySceneEvent(scene(), { type: 'seed_frame', url: 'x' }).ok).toBe(false); // no dependency
  });

  test('an unknown event is refused, not thrown', () => {
    expect(applySceneEvent(scene(), { type: 'explode' } as unknown as SceneEvent)).toEqual({ ok: false, reason: 'unknown event explode' });
  });
});

describe('backoff and the failure budget', () => {
  test('backoffMs doubles from 30 s and caps at 10 min; nonsense attempts read as 1', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => backoffMs(n))).toEqual([30_000, 60_000, 120_000, 240_000, 480_000, 600_000, 600_000]);
    expect(backoffMs(0)).toBe(30_000);
    expect(backoffMs(NaN)).toBe(30_000);
    expect(backoffMs(10_000)).toBe(600_000);
  });

  test('allowedFailures = floor(n × 10 %): zero tolerance under 10 scenes', () => {
    expect([1, 9, 10, 19, 20, 30].map((n) => allowedFailures(n))).toEqual([0, 0, 1, 1, 2, 3]);
    expect(allowedFailures(30, { ...CFG, maxFailedFraction: 5 })).toBe(30);
    expect(allowedFailures(30, { ...CFG, maxFailedFraction: -1 })).toBe(0);
    expect(allowedFailures(-4)).toBe(0);
  });
});

// ── Job events ───────────────────────────────────────────────────────────────────────────────────────────────

const JOB_EVENTS: JobEvent[] = [
  { type: 'directed' },
  { type: 'start' },
  { type: 'all_rendered' },
  { type: 'stitch_ok', url: 'https://cdn/film.mp4' },
  { type: 'stitch_failed' },
  { type: 'fail', code: 'deadline' },
  { type: 'cancel' },
  { type: 'hold', reason: 'platform_budget', until: T0 + MIN },
  { type: 'release_hold' },
];
const JOB_LEGAL_FROM: Record<JobEvent['type'], JobStatus[]> = {
  directed: ['directing'],
  start: ['planned'],
  all_rendered: ['rendering'],
  stitch_ok: ['stitching'],
  stitch_failed: ['stitching'],
  fail: ['directing', 'planned', 'rendering', 'stitching'],
  cancel: ['directing', 'planned', 'rendering', 'stitching'],
  hold: ['planned', 'rendering'],
  release_hold: JOB_STATUSES.slice(), // legal whenever a hold exists (see below)
};

describe('applyJobEvent — the full status × event matrix', () => {
  for (const event of JOB_EVENTS) {
    for (const status of JOB_STATUSES) {
      const legal = JOB_LEGAL_FROM[event.type].includes(status);
      test(`${event.type} on ${status} → ${legal ? 'applied' : 'refused'}`, () => {
        const j = job({ status, ...(event.type === 'release_hold' ? { holdUntil: T0, holdReason: 'platform_budget' as const } : {}) });
        expect(applyJobEvent(j, event).ok).toBe(legal);
      });
    }
  }

  test('results: start, all_rendered clears a hold, stitch_ok stores the film, stitch_failed counts, fail/cancel code', () => {
    const a = (j: JobState, e: JobEvent) => { const t = applyJobEvent(j, e); if (!t.ok) throw new Error(t.reason); return t.job; };
    expect(a(job({ status: 'planned' }), { type: 'start' }).status).toBe('rendering');
    expect(a(job({ holdUntil: T0, holdReason: 'platform_budget' }), { type: 'all_rendered' })).toMatchObject({ status: 'stitching', holdUntil: null, holdReason: null });
    expect(a(job({ status: 'stitching' }), { type: 'stitch_ok', url: 'https://cdn/f.mp4' })).toMatchObject({ status: 'done', outputUrl: 'https://cdn/f.mp4' });
    expect(applyJobEvent(job({ status: 'stitching' }), { type: 'stitch_ok', url: '' }).ok).toBe(false);
    expect(a(job({ status: 'stitching', stitchAttempts: 1 }), { type: 'stitch_failed' }).stitchAttempts).toBe(2);
    expect(a(job(), { type: 'fail', code: 'deadline' })).toMatchObject({ status: 'failed', errorCode: 'deadline' });
    expect(a(job(), { type: 'cancel' })).toMatchObject({ status: 'canceled', errorCode: 'canceled_by_user' });
    expect(applyJobEvent(job(), { type: 'release_hold' }).ok).toBe(false); // no hold to release
  });

  test('a hold only ever extends', () => {
    const held = job({ holdUntil: T0 + 30 * MIN, holdReason: 'platform_budget' });
    const shorter = applyJobEvent(held, { type: 'hold', reason: 'provider_unavailable', until: T0 + 15 * MIN });
    expect(shorter.ok && shorter.job).toBe(held);
    const longer = applyJobEvent(held, { type: 'hold', reason: 'insufficient_credits', until: T0 + 60 * MIN });
    expect(longer.ok && longer.job).toMatchObject({ holdUntil: T0 + 60 * MIN, holdReason: 'insufficient_credits' });
  });
});

// ── Refund markers ───────────────────────────────────────────────────────────────────────────────────────────

describe('refundableScenes — "you pay for the clips you receive"', () => {
  const mixed = [
    charged({ ordinal: 0, status: 'delivered', outputUrl: 'u' }),
    charged({ ordinal: 1, status: 'failed' }),
    charged({ ordinal: 2, status: 'failed', refunded: true }),
    scene({ ordinal: 3, status: 'failed' }), // never charged
    charged({ ordinal: 4, status: 'rendering' }), // in flight: never refunded while in flight
    charged({ ordinal: 5, status: 'queued' }),
  ];
  test('in progress / done: only failed scenes', () => {
    expect(refundableScenes(job(), mixed)).toEqual([1]);
    expect(refundableScenes(job({ status: 'done' }), mixed)).toEqual([1]);
  });
  test('canceled / failed (not at the stitch): every terminal undelivered scene; delivered clips stay paid', () => {
    expect(refundableScenes(job({ status: 'canceled' }), mixed)).toEqual([1]);
    expect(refundableScenes(job({ status: 'failed', errorCode: 'too_many_scene_failures' }), mixed)).toEqual([1]);
  });
  test('failed at the stitch: everything charged, delivered included', () => {
    expect(refundableScenes(job({ status: 'failed', errorCode: 'stitch_failed' }), mixed)).toEqual([0, 1]);
  });
});

// ── settle ───────────────────────────────────────────────────────────────────────────────────────────────────

describe('settle — job-level decisions', () => {
  test('directing is never started by a tick: it waits for the route\'s `directed`, then for nothing', () => {
    const queued = film(3, 12, () => ({ chargeRef: null, chargeCredits: 0 }));
    const s = settle(job({ status: 'directing' }), queued, T0);
    expect(s).toMatchObject({ job: { status: 'directing' }, changed: [], refund: [], stitch: false });
    // Even with NO scene rows yet (the route is between its inserts) — never `no_scenes`.
    expect(settle(job({ status: 'directing' }), [], T0).job.status).toBe('directing');
    const t = applyJobEvent(job({ status: 'directing' }), { type: 'directed' });
    expect(t.ok && t.job.status).toBe('planned');
  });

  test('directing past its deadline: the create died mid-write → failed, nothing charged so nothing refunded', () => {
    const queued = film(2, 12, () => ({ chargeRef: null, chargeCredits: 0 }));
    const s = settle(job({ status: 'directing', deadlineAt: T0 }), queued, T0);
    expect(s.job).toMatchObject({ status: 'failed', errorCode: 'directing_abandoned' });
    expect(s.scenes.every((x) => x.status === 'failed')).toBe(true);
    expect(s.refund).toEqual([]);
    expect(settle(job({ status: 'directing', cancelRequested: true }), queued, T0).job).toMatchObject({ status: 'canceled', errorCode: 'canceled_by_user' });
  });

  test('planned → rendering on the first tick', () => {
    const s = settle(job({ status: 'planned' }), film(3), T0);
    expect(s.job.status).toBe('rendering');
    expect(s.changed).toEqual([]);
    expect(s.stitch).toBe(false);
  });

  test('cancel: in-flight and queued scenes are abandoned; undelivered charges refunded; delivered stay paid', () => {
    const scenes = film(4, 12, (i) => ({ status: (['delivered', 'rendering', 'submitted', 'queued'] as const)[i], outputUrl: i === 0 ? 'u' : null }));
    const s = settle(job({ cancelRequested: true }), scenes, T0);
    expect(s.job).toMatchObject({ status: 'canceled', errorCode: 'canceled_by_user' });
    expect(s.changed).toEqual([1, 2, 3]);
    expect(s.scenes.map((x) => x.status)).toEqual(['delivered', 'failed', 'failed', 'failed']);
    expect(s.refund).toEqual([1, 2, 3]);
  });

  test('cancel wins over everything, also while stitching', () => {
    const s = settle(job({ status: 'stitching', cancelRequested: true }), film(2, 12, () => ({ status: 'delivered', outputUrl: 'u' })), T0);
    expect(s.job.status).toBe('canceled');
    expect(s.stitch).toBe(false);
    expect(s.refund).toEqual([]);
  });

  test('deadline: a rendering job fails and refunds; an insufficient-credits hold names the user cause', () => {
    const past = T0 + 25 * 60 * MIN;
    const a = settle(job(), film(2, 12, (i) => ({ status: i === 0 ? 'delivered' : 'queued', outputUrl: i === 0 ? 'u' : null })), past);
    expect(a.job).toMatchObject({ status: 'failed', errorCode: 'deadline' });
    expect(a.refund).toEqual([1]);
    const b = settle(job({ holdUntil: past + MIN, holdReason: 'insufficient_credits' }), film(2), past);
    expect(b.job.errorCode).toBe('deadline_insufficient_credits');
    // The deadline does not cut a stitch short: attempts bound it instead.
    expect(settle(job({ status: 'stitching' }), film(1, 12, () => ({ status: 'delivered', outputUrl: 'u' })), past).job.status).toBe('stitching');
  });

  test('early abort: the job fails as soon as failures exceed 10 %, without waiting for the rest', () => {
    const scenes = film(30, 10, (i) => ({ status: i < 4 ? 'failed' : i < 10 ? 'delivered' : i < 14 ? 'rendering' : 'queued', outputUrl: i >= 4 && i < 10 ? 'u' : null }));
    const s = settle(job(), scenes, T0);
    expect(s.job).toMatchObject({ status: 'failed', errorCode: 'too_many_scene_failures' });
    expect(s.changed).toHaveLength(20); // 4 rendering + 16 queued abandoned
    expect(s.refund).toEqual([0, 1, 2, 3, ...Array.from({ length: 20 }, (_, i) => i + 10)]);
    // 3 of 30 is still within budget: the job carries on and refunds the 3 eagerly.
    const within = settle(job(), film(30, 10, (i) => ({ status: i < 3 ? 'failed' : 'queued' })), T0);
    expect(within.job.status).toBe('rendering');
    expect(within.refund).toEqual([0, 1, 2]);
  });

  test('all terminal within budget → stitching, stitch now, failed scenes refunded', () => {
    const scenes = film(30, 10, (i) => ({ status: i === 7 ? 'failed' : 'delivered', outputUrl: i === 7 ? null : 'u' }));
    const s = settle(job(), scenes, T0);
    expect(s.job.status).toBe('stitching');
    expect(s.stitch).toBe(true);
    expect(s.refund).toEqual([7]);
  });

  test('nothing delivered (reachable only with a 100 % budget) and no scenes both fail the job', () => {
    expect(settle(job(), film(2, 12, () => ({ status: 'failed' })), T0, { ...CFG, maxFailedFraction: 1 }).job.errorCode).toBe('nothing_delivered');
    expect(settle(job({ status: 'planned' }), [], T0).job).toMatchObject({ status: 'failed', errorCode: 'no_scenes' });
  });

  test('stitch attempts are bounded; a stitch failure refunds every charged scene', () => {
    const scenes = film(2, 12, () => ({ status: 'delivered', outputUrl: 'u' }));
    expect(settle(job({ status: 'stitching', stitchAttempts: 1 }), scenes, T0).stitch).toBe(true);
    const s = settle(job({ status: 'stitching', stitchAttempts: 2 }), scenes, T0);
    expect(s.job).toMatchObject({ status: 'failed', errorCode: 'stitch_failed' });
    expect(s.stitch).toBe(false);
    expect(s.refund).toEqual([0, 1]);
  });

  test('a stitch that never gets to run (deferred every tick) fails after the grace period and refunds everything', () => {
    const scenes = film(2, 12, () => ({ status: 'delivered', outputUrl: 'u' }));
    const j = job({ status: 'stitching', deadlineAt: T0 });
    expect(settle(j, scenes, T0 + CFG.stitchGraceMs - 1).stitch).toBe(true);
    const late = settle(j, scenes, T0 + CFG.stitchGraceMs);
    expect(late.job).toMatchObject({ status: 'failed', errorCode: 'stitch_failed' });
    expect(late.refund).toEqual([0, 1]);
  });

  test('an expired hold is released; an active one is kept', () => {
    expect(settle(job({ holdUntil: T0 - 1, holdReason: 'platform_budget' }), film(2), T0).job.holdUntil).toBeNull();
    expect(settle(job({ holdUntil: T0 + 1, holdReason: 'platform_budget' }), film(2), T0).job.holdUntil).toBe(T0 + 1);
  });

  test('terminal jobs only re-list refunds that have not landed yet', () => {
    const scenes = [charged({ ordinal: 0, status: 'failed' }), charged({ ordinal: 1, status: 'failed', refunded: true })];
    const s = settle(job({ status: 'done', outputUrl: 'f' }), scenes, T0);
    expect(s.job.status).toBe('done');
    expect(s.refund).toEqual([0]);
  });

  test('idempotent: settling a settled state changes nothing', () => {
    const states: Array<[JobState, SceneState[]]> = [
      [job({ cancelRequested: true }), film(3, 12, (i) => ({ status: i ? 'queued' : 'delivered', outputUrl: i ? null : 'u' }))],
      [job(), film(12, 12, (i) => ({ status: i < 2 ? 'failed' : 'queued' }))],
      [job(), film(10, 12, () => ({ status: 'delivered', outputUrl: 'u' }))],
      [job({ status: 'planned' }), film(3)],
    ];
    for (const [j, ss] of states) {
      const once = settle(j, ss, T0);
      const twice = settle(once.job, once.scenes, T0);
      expect(twice.job).toEqual(once.job);
      expect(twice.scenes).toEqual(once.scenes);
      expect(twice.changed).toEqual([]);
    }
  });

  test('never mutates its input', () => {
    const ss = film(3);
    const frozen = JSON.stringify(ss);
    settle(job({ cancelRequested: true }), ss, T0);
    expect(JSON.stringify(ss)).toBe(frozen);
  });
});

// ── planWork ─────────────────────────────────────────────────────────────────────────────────────────────────

describe('planWork — what to do for a rendering job', () => {
  test('only a rendering job gets work', () => {
    for (const status of JOB_STATUSES.filter((s) => s !== 'rendering')) {
      expect(planWork(job({ status }), film(5), T0)).toEqual({ fail: [], poll: [], seedFrames: [], reserveAct: null, submit: [] });
    }
  });

  test('concurrency cap of 4, earliest ordinals first', () => {
    expect(planWork(job(), film(10), T0).submit).toEqual([0, 1, 2, 3]);
    const some = film(10, 12, (i) => (i < 3 ? { status: 'rendering', operation: `op${i}`, submittedAt: T0 } : {}));
    expect(planWork(job(), some, T0).submit).toEqual([3]);
    const full = film(10, 12, (i) => (i < 4 ? { status: 'submitted', submittedAt: T0 } : {}));
    expect(planWork(job(), full, T0).submit).toEqual([]);
    expect(planWork(job(), film(10), T0, { ...CFG, maxConcurrentPerJob: 2 }).submit).toEqual([0, 1]);
  });

  test('a scene waiting out its backoff is skipped until due', () => {
    const ss = film(3, 12, (i) => (i === 0 ? { nextAttemptAt: T0 + 1 } : {}));
    expect(planWork(job(), ss, T0).submit).toEqual([1, 2]);
    expect(planWork(job(), ss, T0 + 1).submit).toEqual([0, 1, 2]);
  });

  test('reserve per act: unreserved scenes are never submitted; the next act is reserved only when slots are idle', () => {
    const none = film(24, 12, () => ({ chargeRef: null, chargeCredits: 0 }));
    expect(planWork(job(), none, T0)).toMatchObject({ reserveAct: 0, submit: [] });
    // Act 0 reserved with plenty queued: slots are full, no reservation yet.
    const act0 = film(24, 12, (i) => (i >= 12 ? { chargeRef: null, chargeCredits: 0 } : {}));
    expect(planWork(job(), act0, T0)).toMatchObject({ reserveAct: null, submit: [0, 1, 2, 3] });
    // Act 0 almost done (2 left in flight, nothing queued): reserve act 1 just ahead of need.
    const tail = film(24, 12, (i) => (i < 10 ? { status: 'delivered', outputUrl: 'u' } : i < 12 ? { status: 'rendering', operation: `op${i}`, submittedAt: T0 } : { chargeRef: null, chargeCredits: 0 }));
    expect(planWork(job(), tail, T0)).toMatchObject({ reserveAct: 1, submit: [] });
  });

  test('a hold stops reserving and submitting, but polling and housekeeping go on', () => {
    const ss = film(6, 12, (i) => (i === 0 ? { status: 'rendering', operation: 'op0', submittedAt: T0 - MIN } : i === 1 ? { status: 'submitted', submittedAt: T0 - 11 * MIN } : { chargeRef: null }));
    const w = planWork(job({ holdUntil: T0 + MIN, holdReason: 'insufficient_credits' }), ss, T0);
    expect(w).toEqual({ fail: [{ ordinal: 1, event: 'claim_lost' }], poll: [0], seedFrames: [], reserveAct: null, submit: [] });
  });

  test('stale claims and render timeouts are failed (never re-submitted) and free their slot', () => {
    const ss = film(8, 12, (i) =>
      i === 0 ? { status: 'submitted', submittedAt: T0 - 10 * MIN } // stale exactly at the limit
        : i === 1 ? { status: 'submitted', submittedAt: T0 - 9 * MIN } // a claim still in progress
          : i === 2 ? { status: 'rendering', operation: 'op2', submittedAt: T0 - 20 * MIN }
            : i === 3 ? { status: 'submitted', submittedAt: null }
              : {});
    const w = planWork(job(), ss, T0);
    expect(w.fail).toEqual([{ ordinal: 0, event: 'claim_lost' }, { ordinal: 2, event: 'render_timeout' }, { ordinal: 3, event: 'claim_lost' }]);
    expect(w.poll).toEqual([]); // the timed-out one is not polled
    expect(w.submit).toEqual([4, 5, 6]); // 4 − 1 still-busy claim = 3 free
  });

  test('polls: due ones only, oldest due first, capped per tick', () => {
    const ss = film(20, 20, (i) => ({ status: 'rendering', operation: `op${i}`, submittedAt: T0, nextAttemptAt: i === 5 ? T0 + 1 : T0 - (i % 3) }));
    const w = planWork(job(), ss, T0);
    expect(w.poll).toHaveLength(12);
    expect(w.poll).not.toContain(5);
    expect(w.poll.slice(0, 3)).toEqual([2, 8, 11]); // nextAttemptAt T0 − 2 first, by ordinal
    expect(planWork(job(), film(1, 12, () => ({ status: 'rendering', operation: null, submittedAt: T0 })), T0).poll).toEqual([]);
  });

  test('act chaining: wait for the dependency, extract its last frame, then submit; a failed dependency releases', () => {
    const chain = (dep: Partial<SceneState>, self: Partial<SceneState> = {}) =>
      [charged({ ordinal: 0, ...dep }), charged({ ordinal: 1, act: 1, dependsOn: 0, ...self })];
    // Dependency still rendering: neither extracted nor submitted.
    expect(planWork(job(), chain({ status: 'rendering', operation: 'op', submittedAt: T0 }), T0)).toMatchObject({ seedFrames: [], submit: [] });
    // Delivered: extract the frame this tick; submit on a later tick.
    expect(planWork(job(), chain({ status: 'delivered', outputUrl: 'https://cdn/0.mp4' }), T0)).toMatchObject({ seedFrames: [{ ordinal: 1, fromOrdinal: 0 }], submit: [] });
    // Frame ready → submitted.
    expect(planWork(job(), chain({ status: 'delivered', outputUrl: 'u' }, { seedFrameUrl: 'https://cdn/f.jpg' }), T0)).toMatchObject({ seedFrames: [], submit: [1] });
    // Dependency failed → fail-open, submitted without a frame.
    expect(planWork(job(), chain({ status: 'failed' }), T0).submit).toEqual([1]);
    // A dependency that does not exist cannot block forever.
    expect(planWork(job(), [charged({ ordinal: 1, dependsOn: 42 })], T0).submit).toEqual([1]);
  });
});

// ── Classifiers ──────────────────────────────────────────────────────────────────────────────────────────────

describe('classifySubmit / pollEvent', () => {
  const out = (o: object) => classifySubmit({ kind: 'outcome', outcome: o as never });
  test('every engine outcome', () => {
    expect(out({ ok: true, operation: { transport: 'gemini', name: 'models/m/operations/1', model: 'm' } })).toEqual({ kind: 'ok', operation: 'models/m/operations/1' });
    expect(out({ ok: true, operation: { transport: 'gemini', name: '', model: 'm' } })).toEqual({ kind: 'fail', reason: 'no_operation_name' });
    expect(out({ ok: false, reason: 'rate_limited', retryable: true })).toEqual({ kind: 'retry', reason: 'rate_limited' });
    expect(out({ ok: false, reason: 'unavailable', retryable: true })).toEqual({ kind: 'retry', reason: 'unavailable' });
    for (const r of ['quota', 'auth', 'not_configured']) {
      expect(out({ ok: false, reason: r, retryable: false })).toEqual({ kind: 'hold', reason: 'provider_unavailable', detail: r });
    }
    expect(out({ ok: false, reason: 'ambiguous', retryable: false })).toEqual({ kind: 'fail', reason: 'ambiguous_submit' });
    expect(out({ ok: false, reason: 'invalid_request', retryable: false })).toEqual({ kind: 'fail', reason: 'invalid_request' });
    expect(out({ ok: false, reason: 'safety', retryable: false })).toEqual({ kind: 'fail', reason: 'safety' });
    expect(out({ ok: false, reason: 'weird', retryable: true })).toEqual({ kind: 'fail', reason: 'unknown:weird' });
    expect(classifySubmit({ kind: 'budget_refused', reason: 'daily_limit' })).toEqual({ kind: 'hold', reason: 'platform_budget', detail: 'daily_limit' });
  });

  test('poll reports → scene events', () => {
    expect(pollEvent({ state: 'processing' }, T0)).toEqual({ type: 'poll_processing', at: T0 });
    expect(pollEvent({ state: 'delivered', url: 'u' }, T0)).toEqual({ type: 'poll_delivered', url: 'u', at: T0 });
    expect(pollEvent({ state: 'delivered', url: '' }, T0)).toEqual({ type: 'poll_undeliverable', at: T0 });
    expect(pollEvent({ state: 'undeliverable' }, T0)).toEqual({ type: 'poll_undeliverable', at: T0 });
    expect(pollEvent({ state: 'filtered', reason: '' }, T0)).toEqual({ type: 'poll_filtered', reason: 'safety' });
    expect(pollEvent({ state: 'failed', reason: 'x' }, T0)).toEqual({ type: 'poll_failed', reason: 'x', at: T0 });
  });

  test('diffState returns only the changed fields', () => {
    expect(diffState(scene(), { ...scene(), status: 'submitted', attempts: 1 })).toEqual({ status: 'submitted', attempts: 1 });
    expect(diffState(job(), job())).toEqual({});
  });
});

// ── A whole film, tick by tick ───────────────────────────────────────────────────────────────────────────────

describe('simulation: a 13-scene film (acts 7 / 6) driven by the pure rules', () => {
  test('reserves act by act, never exceeds the cap, never submits a scene twice per attempt, refunds the one failure, stitches', () => {
    const acts = [7, 6];
    let j = job({ status: 'planned' });
    let ss: SceneState[] = Array.from({ length: 13 }, (_, i) => scene({ ordinal: i, act: i < acts[0]! ? 0 : 1, dependsOn: i === 7 ? 6 : null }));
    const submits = new Map<number, number>();
    const refunded: number[] = [];
    const reserved: number[] = [];
    let now = T0;
    const renderTicks = new Map<number, number>();
    const set = (o: number, e: SceneEvent) => {
      const t = applySceneEvent(ss[o]!, e);
      if (!t.ok) throw new Error(`${t.reason} (scene ${o})`);
      ss[o] = t.scene;
    };

    for (let tick = 0; tick < 200 && !['done', 'failed', 'canceled'].includes(j.status); tick++) {
      now += MIN;
      const s1 = settle(j, ss, now);
      j = s1.job; ss = s1.scenes;
      const w = planWork(j, ss, now);
      for (const f of w.fail) set(f.ordinal, { type: f.event });
      if (w.reserveAct !== null) {
        reserved.push(w.reserveAct);
        for (const s of ss.filter((x) => x.act === w.reserveAct && x.status === 'queued')) set(s.ordinal, { type: 'charged', ref: `ref:${w.reserveAct}`, credits: 39 });
      }
      for (const fr of w.seedFrames) set(fr.ordinal, { type: 'seed_frame', url: `https://cdn/frame-${fr.fromOrdinal}.jpg` });
      for (const o of w.submit) {
        set(o, { type: 'claimed', at: now });
        submits.set(o, (submits.get(o) ?? 0) + 1);
        set(o, { type: 'submit_ok', operation: `models/veo/operations/${o}-${submits.get(o)}`, at: now });
        renderTicks.set(o, 0);
      }
      expect(ss.filter((x) => x.status === 'submitted' || x.status === 'rendering').length).toBeLessThanOrEqual(CFG.maxConcurrentPerJob);
      for (const o of w.poll) {
        const n = (renderTicks.get(o) ?? 0) + 1;
        renderTicks.set(o, n);
        // Scene 4 is filtered; scene 9 fails once then renders; everything else takes two polls.
        const report = o === 4 ? { state: 'filtered' as const, reason: 'safety' }
          : o === 9 && submits.get(9) === 1 ? { state: 'failed' as const, reason: 'internal' }
            : n >= 2 ? { state: 'delivered' as const, url: `https://cdn/${o}.mp4` } : { state: 'processing' as const };
        set(o, pollEvent(report, now));
      }
      const s2 = settle(j, ss, now);
      j = s2.job; ss = s2.scenes;
      for (const o of s2.refund) { set(o, { type: 'refunded' }); refunded.push(o); }
      if (s2.stitch) {
        const t = applyJobEvent(j, { type: 'stitch_ok', url: 'https://cdn/film.mp4' });
        if (t.ok) j = t.job;
      }
    }

    expect(j).toMatchObject({ status: 'done', outputUrl: 'https://cdn/film.mp4' });
    expect(reserved).toEqual([0, 1]);
    expect(refunded).toEqual([4]); // the filtered scene; 13 × 10 % = 1 allowed failure
    expect(ss.filter((x) => x.status === 'delivered')).toHaveLength(12);
    expect(submits.get(9)).toBe(2); // one provable failure → exactly one re-submit
    expect([...submits.entries()].filter(([o]) => o !== 9).every(([, n]) => n === 1)).toBe(true);
    expect(ss[7]?.seedFrameUrl).toBe('https://cdn/frame-6.jpg'); // act 2 opened from act 1's last frame
  });
});
