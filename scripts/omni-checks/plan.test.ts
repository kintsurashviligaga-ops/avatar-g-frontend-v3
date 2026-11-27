/** @jest-environment node */
/**
 * scripts/omni-checks/plan.mjs against the real code: the expected prices are the price book's, the job-id reader
 * agrees with lib/genjutsu/chargeToken, the default lines fit a 4 s clip, and the verdicts are strict.
 */
jest.mock('server-only', () => ({}));

import { composeOmniJobId, signGenjutsuCharge, withGenjutsuCharge } from '@/lib/genjutsu/chargeToken';
import { directClipCredits } from '@/lib/video/directClip';
import { omniEditCredits } from '@/lib/video/omniEdit';
import { clipSpeechFits, promptSpeaksGeorgian } from '@/lib/video/clipPrompt';
import {
  DEFAULT_CLIP_LINE, DEFAULT_CLIP_PROMPT, DEFAULT_EXTEND_LINE, EXPECTED_CREDITS, MAX_RUN_CREDITS,
  bareJobId, interactionAgeDays, judge, readOmniJobId, withinBudget,
} from './plan.mjs';

const ENV = { ...process.env };
beforeEach(() => { process.env = { ...ENV, GENJUTSU_CHARGE_SECRET: 'test-secret' }; });
afterAll(() => { process.env = ENV; });

const signed = (jobId: string) => withGenjutsuCharge(jobId, signGenjutsuCharge({ u: 'user-1', r: 'genjutsu:x', j: jobId })!);

test('the expected prices are the price book rows the routes charge', () => {
  expect(directClipCredits({ seconds: 4, tier: 'fast', photos: 0, resolution: '720p', speech: 'ka' })).toBe(EXPECTED_CREDITS.clip720_4);
  expect(omniEditCredits({ op: 'extend', inputSec: 4, seconds: 4, resolution: '720p' })).toBe(EXPECTED_CREDITS.extend720_4);
  expect(MAX_RUN_CREDITS).toBe(70);
});

test('the default prompt is a Georgian line, and both lines fit 4 s', () => {
  expect(promptSpeaksGeorgian(DEFAULT_CLIP_PROMPT)).toBe(true);
  expect(clipSpeechFits([DEFAULT_CLIP_LINE], 4).fits).toBe(true);
  expect(clipSpeechFits([DEFAULT_EXTEND_LINE], 4).fits).toBe(true);
});

test('the job-id reader agrees with the ids the routes sign', () => {
  const clip12 = signed(composeOmniJobId('interactions/abc', '9:16', 1_763_000_000_000, undefined, 4, true));
  expect(bareJobId(clip12)).not.toContain('~');
  expect(readOmniJobId(clip12)).toMatchObject({ op: 'clip', seconds: 4, model: 'gemini-omni-1.2-flash', aspect: '9:16' });
  const ext11 = signed(composeOmniJobId('interactions/def', '16:9', 1, { op: 'extend', seconds: 4 }, undefined, false));
  expect(readOmniJobId(ext11)).toMatchObject({ op: 'extend', seconds: 4, model: 'gemini-omni-1.1-flash-preview' });
  const clip11 = composeOmniJobId('interactions/ghi', '9:16', 1, undefined, 10, false);
  expect(readOmniJobId(clip11)).toMatchObject({ op: 'clip', seconds: 10, model: 'gemini-omni-1.1-flash-preview' });
  expect(readOmniJobId('operations/veo::9:16::1::c8')).toBeNull();
  expect(readOmniJobId('nonsense')).toBeNull();
});

test('age in days from the id', () => {
  const id = composeOmniJobId('interactions/a', '9:16', 0, undefined, 4, false);
  expect(interactionAgeDays(id, 8 * 864e5)).toBeCloseTo(8);
});

test('the budget never lets a run pass ✦70', () => {
  expect(withinBudget(0, 20)).toBe(true);
  expect(withinBudget(45, 25)).toBe(true);
  expect(withinBudget(46, 25)).toBe(false);
  expect(withinBudget(0, 0)).toBe(false);
  expect(withinBudget(0, 2.5)).toBe(false);
});

describe('verdicts', () => {
  const id12 = composeOmniJobId('interactions/a', '9:16', 1, undefined, 4, true);
  const ext12 = composeOmniJobId('interactions/b', '9:16', 1, { op: 'extend', seconds: 4 }, undefined, true);
  const ext11 = composeOmniJobId('interactions/c', '9:16', 1, { op: 'extend', seconds: 4 }, undefined, false);
  const ready = { state: 'ready', done: true, videoUrl: 'https://x/v.mp4' };

  test('a ready 1.2 clip at the right price passes', () => {
    const v = judge({ name: 'C1', start: { httpStatus: 202, jobId: id12, credits: 20 }, final: ready, expectCredits: 20, expectModel: 'gemini-omni-1.2-flash', expectOp: 'clip' });
    expect(v).toMatchObject({ pass: true, outcome: 'ready' });
  });

  test('the wrong model, price or op fails even when a video came back', () => {
    expect(judge({ name: 'C2', start: { httpStatus: 202, jobId: ext11, credits: 25 }, final: ready, expectCredits: 25, expectModel: 'gemini-omni-1.2-flash', expectOp: 'extend' }).pass).toBe(false);
    expect(judge({ name: 'C2', start: { httpStatus: 202, jobId: ext12, credits: 34 }, final: ready, expectCredits: 25, expectModel: 'gemini-omni-1.2-flash', expectOp: 'extend' }).pass).toBe(false);
    expect(judge({ name: 'C2', start: { httpStatus: 202, jobId: id12, credits: 25 }, final: ready, expectCredits: 25, expectModel: 'gemini-omni-1.2-flash', expectOp: 'extend' }).pass).toBe(false);
  });

  test('C3 may end as a refunded failure; an unrefunded one never passes', () => {
    const base = { name: 'C3', start: { httpStatus: 202, jobId: ext11, credits: 25 }, expectCredits: 25, expectModel: 'gemini-omni-1.1-flash-preview', expectOp: 'extend', allowRefundedFailure: true };
    expect(judge({ ...base, final: { state: 'failed', done: true, error: 'expired', refunded: true } })).toMatchObject({ pass: true, outcome: 'failed_refunded', credits: 0 });
    expect(judge({ ...base, final: { state: 'failed', done: true, error: 'x', refunded: false } })).toMatchObject({ pass: false, outcome: 'failed_not_refunded' });
    expect(judge({ ...base, allowRefundedFailure: false, final: { state: 'failed', done: true, refunded: true } }).pass).toBe(false);
  });

  test('not started or timed out fails', () => {
    expect(judge({ name: 'C1', start: { httpStatus: 402, error: 'insufficient_credits' }, final: null, expectCredits: 20, expectModel: 'gemini-omni-1.2-flash', expectOp: 'clip' })).toMatchObject({ pass: false, outcome: 'not_started' });
    expect(judge({ name: 'C1', start: { httpStatus: 202, jobId: id12, credits: 20 }, final: { state: 'timeout' }, expectCredits: 20, expectModel: 'gemini-omni-1.2-flash', expectOp: 'clip' })).toMatchObject({ pass: false, outcome: 'timeout' });
  });
});
