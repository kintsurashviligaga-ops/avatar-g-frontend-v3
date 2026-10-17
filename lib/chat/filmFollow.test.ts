/** @jest-environment node */
/**
 * The pure part of a film the server follows once its tab closes (owner's decision 2026-10-17, „სერვერზე"): the signed
 * record a sweep acts on, the stitch plan it keeps, and the decision it makes on each poll.
 */
import {
  FOLLOW_MAX_MS, FOLLOW_TTL_MS, MAX_POLL_TOKEN, decideFollow, followJobId, sanitizeFollowPlan, signFollow, verifyFollow,
  type FilmFollowRecord,
} from './filmFollow';
import type { FilmStudioMatrix } from './filmStudioClient';

const KEY = 'test-key';
const T0 = 1_760_000_000_000;
const rec: FilmFollowRecord = { u: 'user-1', t: 'f0123456789abcdef', p: 'film:abc', s: 'session_1', c: T0, m: 'a film about the sea', plan: { orientation: 'vertical', locale: 'ka' } };
const expect1 = { userId: 'user-1', jobId: followJobId(rec.t), now: T0 + 1_000 };

describe('the signed record', () => {
  test('a record signs and verifies for its own owner and row', () => {
    const signed = signFollow(rec, KEY)!;
    expect(verifyFollow(signed, KEY, expect1)).toEqual({ ok: true, rec });
  });

  test('another key, another owner, another row, or a changed payload is refused', () => {
    const signed = signFollow(rec, KEY)!;
    expect(verifyFollow(signed, 'other-key', expect1)).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyFollow(signed, KEY, { ...expect1, userId: 'user-2' })).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyFollow(signed, KEY, { ...expect1, jobId: followJobId('f0000000000000000') })).toEqual({ ok: false, reason: 'invalid' });
    const [payload, sig] = signed.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload!, 'base64url').toString()), u: 'user-2' })).toString('base64url');
    expect(verifyFollow(`${forged}.${sig}`, KEY, { ...expect1, userId: 'user-2' })).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyFollow(`${signed}.x`, KEY, expect1)).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyFollow({ signed }, KEY, expect1)).toEqual({ ok: false, reason: 'invalid' });
  });

  test('past its life the record is expired, and still names its film (its debt can be checked)', () => {
    const signed = signFollow(rec, KEY)!;
    expect(verifyFollow(signed, KEY, { ...expect1, now: T0 + FOLLOW_TTL_MS })).toEqual({ ok: false, reason: 'expired', rec });
  });

  test('nothing is signed without a key, an owner or a start, or with an oversized poll token', () => {
    expect(signFollow(rec, '')).toBeNull();
    expect(signFollow({ ...rec, u: '' }, KEY)).toBeNull();
    expect(signFollow({ ...rec, c: 0 }, KEY)).toBeNull();
    expect(signFollow({ ...rec, p: 'x'.repeat(MAX_POLL_TOKEN + 1) }, KEY)).toBeNull();
    expect(verifyFollow(signFollow(rec, KEY), '', expect1)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('the stitch plan kept with the film', () => {
  test('known choices are kept', () => {
    const plan = {
      orientation: 'vertical', transition: 'dissolve', joinTransitions: ['cut', 'crossfade'], noMusic: true, musicVideoMode: true,
      soundtrackUrl: 'https://cdn.example/song.mp3', locale: 'ru', vocalGender: 'duet', finalDurationSec: 30,
      audioMix: { threeTrack: true, musicVolume: 0.4, sfxVolume: 1.2, smartDuck: false, duckDb: -12 }, subtitles: true,
    };
    expect(sanitizeFollowPlan(plan)).toEqual(plan);
  });

  test('anything else is dropped, field by field', () => {
    expect(sanitizeFollowPlan({
      orientation: 'diagonal', transition: 'wipe', joinTransitions: ['cut', 'spin'], noMusic: 'yes', soundtrackUrl: 'file:///etc/passwd',
      locale: 'de', vocalGender: 'robot', finalDurationSec: 9_999, audioMix: { musicVolume: 9, duckDb: 3 }, subtitles: 'yes', extra: 1,
    })).toEqual({});
    expect(sanitizeFollowPlan(null)).toEqual({});
    expect(sanitizeFollowPlan(['vertical'])).toEqual({});
  });
});

describe('the decision on each poll (the tab\'s rules)', () => {
  const clip = (ordinal: number, status: FilmStudioMatrix['clips'][number]['status'], url?: string) => ({ ordinal, status, url: url ?? null });
  const m = (clips: FilmStudioMatrix['clips'], extra: Partial<FilmStudioMatrix> = {}): FilmStudioMatrix => ({
    sceneCount: clips.length, seed: 1, storyboard: 'succeeded', clips, stitch: 'pending', audio: 'succeeded', ...extra,
  });

  test.each([
    ['every scene in → stitch', m([clip(1, 'succeeded', 'a'), clip(2, 'succeeded', 'b')], { readyToStitch: true }), 60_000, { kind: 'assemble' }],
    ['scenes still rendering → wait', m([clip(1, 'succeeded', 'a'), clip(2, 'queued')]), 60_000, { kind: 'wait' }],
    ['one failed while another still renders → wait for it', m([clip(1, 'failed'), clip(2, 'succeeded', 'b'), clip(3, 'pending')]), 60_000, { kind: 'wait' }],
    ['all settled, two survived → stitch the survivors', m([clip(1, 'failed'), clip(2, 'succeeded', 'b'), clip(3, 'succeeded', 'c')]), 60_000, { kind: 'assemble' }],
    ['all settled, one of three survived → failed', m([clip(1, 'failed'), clip(2, 'succeeded', 'b'), clip(3, 'failed')]), 60_000, { kind: 'fail', reason: 'scenes_failed' }],
    ['a one-scene film with its clip → stitch', m([clip(1, 'succeeded', 'a')], { readyToStitch: true }), 60_000, { kind: 'assemble' }],
    ['every clip in but the score still pending → wait', m([clip(1, 'succeeded', 'a'), clip(2, 'succeeded', 'b')], { audio: 'pending' }), 60_000, { kind: 'wait' }],
    ['…and past the deadline, stitch what is there', m([clip(1, 'succeeded', 'a'), clip(2, 'succeeded', 'b')], { audio: 'pending' }), FOLLOW_MAX_MS + 1, { kind: 'assemble' }],
    ['past the deadline with one clip of three → timed out', m([clip(1, 'succeeded', 'a'), clip(2, 'queued'), clip(3, 'queued')]), FOLLOW_MAX_MS + 1, { kind: 'fail', reason: 'timed_out' }],
    ['no film came back, inside the deadline → wait', null, 60_000, { kind: 'wait' }],
    ['no film came back, past it → timed out', null, FOLLOW_MAX_MS + 1, { kind: 'fail', reason: 'timed_out' }],
  ])('%s', (_name, matrix, age, decision) => {
    expect(decideFollow(matrix as FilmStudioMatrix | null, age as number)).toEqual(decision);
  });
});
