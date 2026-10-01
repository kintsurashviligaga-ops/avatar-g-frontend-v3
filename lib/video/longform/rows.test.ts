/** @jest-environment node */
/**
 * rows.ts — row ⇄ record mapping. Rules under test: timestamps ISO ⇄ epoch ms; statuses / tiers / formats outside
 * the vocabulary degrade to safe values; jsonb (bible, options, spec) is coerced, never trusted, and NEVER throws
 * (an unmappable job would be re-leased forever without reaching its deadline); patches write only the keys present;
 * an error string also yields its queryable code.
 */
import { runLongformDirector, type LongformStoryboard } from './director';
import { validateLongformRequest, type LongformPlan } from './plan';
import {
  coerceOptions,
  coerceShot,
  directedColumns,
  emptyBible,
  errorCodeOf,
  jobFromRow,
  jobInsertRow,
  jobPatchToColumns,
  LONGFORM_DIRECTING_GRACE_MS,
  LONGFORM_JOB_DEADLINE_MS,
  sceneFromRow,
  sceneInsertRows,
  scenePatchToColumns,
} from './rows';
import { applyJobEvent, settle } from './stateMachine';
import { fakeGenerator, filmReplies } from './testing/directorFakes';

const ISO = '2027-01-15T08:00:00.000Z';
const MS = Date.parse(ISO);

const jobRow = {
  id: 'j1', user_id: 'u1', status: 'rendering', cancel_requested: false, hold_until: ISO, hold_reason: 'platform_budget',
  stitch_attempts: 1, deadline_at: ISO, error_code: null, output_url: null, scene_count: 13, act_count: 2, tier: 'fast',
  format: '9:16', resolution: '720p', generate_audio: false, seed: '42', credits_per_scene: 39, refunds_pending: true,
  bible: { characters: [{ id: 'ana', description: 'a woman in red' }], arc: [{ summary: 'one' }] },
  options: { negativePrompt: 'crowds', referenceImageUrls: ['https://a/1.jpg', 'http://no', 'https://a/2.jpg', 'https://a/3.jpg', 'https://a/4.jpg'], musicUrl: 'https://cdn/bed.mp3', musicDurationSec: 30 },
};

describe('jobFromRow', () => {
  test('maps every column', () => {
    const j = jobFromRow(jobRow);
    expect(j).toMatchObject({
      id: 'j1', userId: 'u1', status: 'rendering', cancelRequested: false, holdUntil: MS, holdReason: 'platform_budget', stitchAttempts: 1,
      deadlineAt: MS, errorCode: null, outputUrl: null, sceneCount: 13, tier: 'fast', format: '9:16', resolution: '720p', generateAudio: false,
      seed: 42, creditsPerScene: 39, refundsPending: true,
      options: { negativePrompt: 'crowds', referenceImageUrls: ['https://a/1.jpg', 'https://a/2.jpg', 'https://a/3.jpg'], musicUrl: 'https://cdn/bed.mp3', musicDurationSec: 30 },
    });
    expect(j.bible.characters[0]?.description).toBe('a woman in red');
    expect(j.bible.arc).toHaveLength(2);
  });

  test('garbage degrades safely and never throws', () => {
    const j = jobFromRow({ id: 'x', status: 'exploded', tier: 'ultra', format: '3:2', resolution: '8k', hold_reason: 'whatever', bible: 'nope', options: 7, seed: 'abc', act_count: 3 });
    expect(j).toMatchObject({ status: 'failed', tier: 'fast', format: '16:9', resolution: '1080p', holdReason: 'provider_unavailable', seed: null, generateAudio: true, deadlineAt: 0, options: {} });
    expect(j.bible).toEqual(emptyBible(3));
    expect(() => jobFromRow({})).not.toThrow();
  });
});

describe('sceneFromRow + coerceShot', () => {
  test('maps every column and keeps a well-formed shot', () => {
    const s = sceneFromRow({
      ordinal: 7, act: 1, status: 'rendering', attempts: 2, operation_name: 'models/m/operations/7', next_attempt_at: ISO, submitted_at: ISO,
      depends_on: 6, seed_frame_url: 'https://cdn/f.jpg', charge_ref: 'longform:j1:act:1', charge_credits: 39, refunded: false,
      output_url: null, error_detail: 'generation_failed: x', output_bytes: '1234',
      spec: { imagePrompt: 'p', shot: { subject: 'Ana', action: 'walks', setting: 'yard', camera: { move: 'orbit', shot: 'wide' }, audio: { dialogue: [{ speaker: 'Ana', line: 'Hi.' }], sfx: 'wind' } } },
    });
    expect(s).toMatchObject({
      ordinal: 7, act: 1, status: 'rendering', attempts: 2, operation: 'models/m/operations/7', nextAttemptAt: MS, submittedAt: MS, dependsOn: 6,
      seedFrameUrl: 'https://cdn/f.jpg', chargeRef: 'longform:j1:act:1', chargeCredits: 39, refunded: false, outputUrl: null, error: 'generation_failed: x', outputBytes: 1234,
    });
    expect(s.spec.shot).toEqual({
      ordinal: 7, subject: 'Ana', action: 'walks', setting: 'yard', camera: { move: 'orbit', intensity: 5, shot: 'wide', angle: 'auto', lens: 'auto' },
      audio: { dialogue: [{ speaker: 'Ana', line: 'Hi.' }], sfx: 'wind' }, hasStartImage: false, transitionOut: 'cut',
    });
    expect(s.spec.imagePrompt).toBe('p');
  });

  test('a missing or broken shot falls back to the scene prose, never a throw', () => {
    expect(coerceShot({ action: 'from the storyboard' }, 0).action).toBe('from the storyboard');
    expect(coerceShot({ imagePrompt: 'from the prompt' }, 0).action).toBe('from the prompt');
    expect(coerceShot(null, 3)).toMatchObject({ ordinal: 3, subject: '', action: 'the scene continues', hasStartImage: false });
    const dlg = coerceShot({ shot: { action: 'a', audio: { dialogue: [{ line: '' }, { line: 'one' }, { line: 'two' }, { line: 'three' }, 'x'] } } }, 0).audio?.dialogue;
    expect(dlg).toEqual([{ speaker: 'The subject', line: 'one' }, { speaker: 'The subject', line: 'two' }]);
    expect(sceneFromRow({ ordinal: 1, status: '???' }).status).toBe('failed');
  });

  test('coerceOptions drops anything that is not what it claims to be', () => {
    expect(coerceOptions({ musicUrl: 'javascript:alert(1)', musicDurationSec: -3, referenceImageUrls: 'x', negativePrompt: 5 })).toEqual({});
    expect(coerceOptions(null)).toEqual({});
  });
});

describe('patches → columns', () => {
  test('a scene patch writes only the keys present, ISO times, and the error code next to the detail', () => {
    expect(scenePatchToColumns({ status: 'submitted', attempts: 1, submittedAt: MS })).toEqual({ status: 'submitted', attempts: 1, submitted_at: ISO });
    expect(scenePatchToColumns({ operation: 'op', transport: 'vertex', model: 'veo', nextAttemptAt: null })).toEqual({ operation_name: 'op', transport: 'vertex', model: 'veo', next_attempt_at: null });
    expect(scenePatchToColumns({ error: 'retries_exhausted: unavailable' })).toEqual({ error_detail: 'retries_exhausted: unavailable', error_code: 'retries_exhausted' });
    expect(scenePatchToColumns({ error: null })).toEqual({ error_detail: null, error_code: null });
    expect(scenePatchToColumns({ chargeRef: 'r', chargeCredits: 39, refunded: true, outputUrl: 'u', outputBytes: 5, outputPath: 'p', deliveredAt: MS, seedFrameUrl: 'f', dependsOn: null })).toEqual({
      charge_ref: 'r', charge_credits: 39, refunded: true, output_url: 'u', output_bytes: 5, output_path: 'p', delivered_at: ISO, seed_frame_url: 'f', depends_on: null,
    });
    expect(scenePatchToColumns({})).toEqual({});
  });

  test('a job patch likewise', () => {
    expect(jobPatchToColumns({ status: 'done', outputUrl: 'u', completedAt: MS, outputPath: 'p', outputBytes: 9 })).toEqual({ status: 'done', output_url: 'u', completed_at: ISO, output_path: 'p', output_bytes: 9 });
    expect(jobPatchToColumns({ holdUntil: MS, holdReason: 'insufficient_credits' })).toEqual({ hold_until: ISO, hold_reason: 'insufficient_credits' });
    expect(jobPatchToColumns({ holdUntil: null, holdReason: null, refundsPending: false, errorCode: 'deadline', errorDetail: 'd', stitchAttempts: 2, cancelRequested: true, deadlineAt: MS })).toEqual({
      hold_until: null, hold_reason: null, refunds_pending: false, error_code: 'deadline', error_detail: 'd', stitch_attempts: 2, cancel_requested: true, deadline_at: ISO,
    });
  });

  test('errorCodeOf', () => {
    expect(errorCodeOf('filtered: safety')).toBe('filtered');
    expect(errorCodeOf('canceled')).toBe('canceled');
    expect(errorCodeOf(null)).toBeNull();
  });

  test('the new columns read back: prompt, trim_to_seconds, a scene\'s output_path', () => {
    expect(jobFromRow({ ...jobRow, prompt: '  a road trip  ', trim_to_seconds: 30 })).toMatchObject({ prompt: 'a road trip', trimToSeconds: 30 });
    expect(jobFromRow({ ...jobRow }).trimToSeconds).toBeNull();
    expect(sceneFromRow({ ordinal: 2, status: 'delivered', output_path: 'longform/j1/s02-ab.mp4' }).outputPath).toBe('longform/j1/s02-ab.mp4');
    expect(sceneFromRow({ ordinal: 2, status: 'queued' }).outputPath).toBeNull();
  });
});

// ── Inserts ──────────────────────────────────────────────────────────────────────────────────────────────────

const NOW = Date.parse('2027-01-15T08:00:00.000Z');

async function storyboardFor(seconds: number): Promise<LongformStoryboard> {
  const { generate } = fakeGenerator(filmReplies(seconds));
  const r = await runLongformDirector({ brief: 'A road trip to a wedding', seconds }, generate);
  if (!r.ok) throw new Error(r.detail);
  return r.storyboard;
}
function pricedPlan(seconds: number): LongformPlan & { credits: NonNullable<LongformPlan['credits']> } {
  const v = validateLongformRequest({ seconds, tier: 'fast' }, { maxSeconds: 240 }, { marginMultiplier: 1.5 });
  if (!v.plan?.credits) throw new Error('no plan');
  return v.plan as LongformPlan & { credits: NonNullable<LongformPlan['credits']> };
}

describe('jobInsertRow / sceneInsertRows / directedColumns', () => {
  test('a 104 s film (acts 7 / 6): one directing job and 13 queued scenes that round-trip through jobFromRow / sceneFromRow', async () => {
    const sb = await storyboardFor(104);
    const plan = pricedPlan(104);
    const job = jobInsertRow({
      id: 'j-104', userId: 'u1', prompt: 'A road trip to a wedding', plan, bible: sb.bible, format: '9:16',
      options: { negativePrompt: 'crowds', referenceImageUrls: [] }, seed: 77, now: NOW,
    });
    expect(job).toMatchObject({
      id: 'j-104', user_id: 'u1', status: 'directing', seconds: 104, scene_count: 13, act_count: 2, tier: 'fast', format: '9:16',
      resolution: '1080p', generate_audio: true, seed: 77, credits_per_scene: plan.credits.perScene, estimate_usd: plan.cost.totalUsd,
      trim_to_seconds: null, options: { negativePrompt: 'crowds' },
      deadline_at: new Date(NOW + LONGFORM_DIRECTING_GRACE_MS).toISOString(),
    });
    // The row the tick will lease reads back as exactly what was planned.
    const rec = jobFromRow(job);
    expect(rec).toMatchObject({ id: 'j-104', userId: 'u1', status: 'directing', sceneCount: 13, tier: 'fast', format: '9:16', seed: 77, creditsPerScene: plan.credits.perScene, prompt: 'A road trip to a wedding' });
    expect(rec.bible).toEqual(sb.bible);

    const rows = sceneInsertRows({ jobId: 'j-104', userId: 'u1', scenes: sb.scenes, chainActFrames: true });
    expect(rows).toHaveLength(13);
    const back = rows.map(sceneFromRow);
    back.forEach((s, i) => {
      expect(s).toMatchObject({ ordinal: i, act: i < 7 ? 0 : 1, status: 'queued', attempts: 0, chargeRef: null, chargeCredits: 0, refunded: false, operation: null });
      expect(s.spec.shot).toEqual(sb.scenes[i]!.shot); // the locked shot survives the jsonb round trip
      expect(rows[i]).toMatchObject({ job_id: 'j-104', user_id: 'u1' });
    });
    // Act chaining: ONLY act 2's opener waits for act 1's last scene.
    expect(back.map((s) => s.dependsOn)).toEqual([null, null, null, null, null, null, null, 6, null, null, null, null, null]);
  });

  test('240 s = three acts of 10: openers 10 and 20 depend on 9 and 19; reference images switch chaining off', async () => {
    const sb = await storyboardFor(240);
    const chained = sceneInsertRows({ jobId: 'j', userId: 'u', scenes: sb.scenes, chainActFrames: true }).map(sceneFromRow);
    expect(chained.filter((s) => s.dependsOn !== null).map((s) => [s.ordinal, s.dependsOn])).toEqual([[10, 9], [20, 19]]);
    const free = sceneInsertRows({ jobId: 'j', userId: 'u', scenes: sb.scenes, chainActFrames: false }).map(sceneFromRow);
    expect(free.every((s) => s.dependsOn === null)).toBe(true);
  });

  test('a plan without a positive per-scene price is refused — it would render free', async () => {
    const sb = await storyboardFor(8);
    const plan = pricedPlan(8);
    const base = { id: 'j', userId: 'u', prompt: 'p', bible: sb.bible, format: '16:9' as const, options: {}, seed: null, now: NOW };
    expect(() => jobInsertRow({ ...base, plan: { ...plan, credits: { ...plan.credits, perScene: 0 } } })).toThrow(/positive per-scene/);
    expect(() => jobInsertRow({ ...base, plan: { ...plan, credits: null } as never })).toThrow(/positive per-scene/);
  });

  test('directedColumns: directing → planned with the full 24 h deadline, as the state machine\'s `directed`', () => {
    expect(directedColumns(NOW)).toEqual({ status: 'planned', deadline_at: new Date(NOW + LONGFORM_JOB_DEADLINE_MS).toISOString() });
    const t = applyJobEvent(jobFromRow({ status: 'directing' }), { type: 'directed' });
    expect(t.ok && t.job.status).toBe('planned');
    // A directing row the tick sees is never started; once promoted, it starts.
    const directing = jobFromRow({ status: 'directing', deadline_at: new Date(NOW + LONGFORM_DIRECTING_GRACE_MS).toISOString() });
    expect(settle(directing, [], NOW).job.status).toBe('directing');
    const planned = jobFromRow({ status: 'planned', deadline_at: directedColumns(NOW).deadline_at });
    expect(settle(planned, [], NOW).job.status).toBe('failed'); // no scenes = no_scenes — which is why scenes go in first
  });
});
