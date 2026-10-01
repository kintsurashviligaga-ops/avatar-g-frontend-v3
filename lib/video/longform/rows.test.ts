/** @jest-environment node */
/**
 * rows.ts — row ⇄ record mapping. Rules under test: timestamps ISO ⇄ epoch ms; statuses / tiers / formats outside
 * the vocabulary degrade to safe values; jsonb (bible, options, spec) is coerced, never trusted, and NEVER throws
 * (an unmappable job would be re-leased forever without reaching its deadline); patches write only the keys present;
 * an error string also yields its queryable code.
 */
import {
  coerceOptions,
  coerceShot,
  emptyBible,
  errorCodeOf,
  jobFromRow,
  jobPatchToColumns,
  sceneFromRow,
  scenePatchToColumns,
} from './rows';

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
});
