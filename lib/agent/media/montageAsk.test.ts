/** Agent G montage: the quote token, the shape and input rules, QC, and who the feature is open to. */
jest.mock('../../admin/guard', () => ({ isAdminUser: (u: { app_metadata?: { role?: string } } | null) => u?.app_metadata?.role === 'admin' }));

import type { User } from '@supabase/supabase-js';
import type { BannerProbe } from '@/lib/video/probeBanner';
import { CLIP_QC_MAX_DIFF, aspectFromClips, aspectFromPrompt, clipCheckPoints, frameDiff, outputTimeline, qcAvSync, qcClips, qcMaster, sortInputs } from './montageAsk';
import type { AgentMontageRequest } from './montageManifest';
import { signQuote, verifyQuote } from './quoteToken';
import { agentMediaAccess, agentMediaOpenTo } from './access';

const P = (o: Partial<BannerProbe>): BannerProbe => ({
  durationSec: 10, hasVideo: true, hasAudio: true, width: 1920, height: 1080, rotation: 0, videoCodec: 'h264', audioCodec: 'aac', ...o,
});

describe('quote token', () => {
  const claims = { u: 'u1', j: 'job-1', f: 'fp', c: 0, x: 2000 };
  const ok = { userId: 'u1', fingerprint: 'fp', now: 1000 };
  test('round-trips for its user, plan and time', () => {
    const t = signQuote(claims, 'key')!;
    expect(verifyQuote(t, 'key', ok)).toEqual({ ok: true, claims });
  });
  test('refuses another user, another plan, a late run, another key, a tampered payload, and no key', () => {
    const t = signQuote(claims, 'key')!;
    expect(verifyQuote(t, 'key', { ...ok, userId: 'u2' })).toEqual({ ok: false, reason: 'not_yours' });
    expect(verifyQuote(t, 'key', { ...ok, fingerprint: 'other' })).toEqual({ ok: false, reason: 'changed' });
    expect(verifyQuote(t, 'key', { ...ok, now: 2000 })).toEqual({ ok: false, reason: 'expired' });
    expect(verifyQuote(t, 'other', ok)).toEqual({ ok: false, reason: 'invalid' });
    const [payload, mac] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ v: 1, ...claims, c: -5 })).toString('base64url');
    expect(verifyQuote(`${forged}.${mac}`, 'key', ok)).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyQuote(`${payload}.${mac}.x`, 'key', ok)).toEqual({ ok: false, reason: 'invalid' });
    expect(signQuote(claims, '')).toBeNull();
    expect(verifyQuote(t, '', ok)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('inputs and shape', () => {
  test('clips have a picture, the track has only sound; one track exactly', () => {
    expect(sortInputs([P({}), P({ hasVideo: false }), P({})])).toEqual({ ok: true, clips: [0, 2], track: 1 });
    expect(sortInputs([P({}), null])).toEqual({ ok: false, error: 'unreadable', files: [1] });
    expect(sortInputs([P({ hasVideo: false })])).toEqual({ ok: false, error: 'no_clip' });
    expect(sortInputs([P({}), P({ durationSec: 0 })])).toEqual({ ok: false, error: 'unreadable', files: [1] });
    expect(sortInputs(Array(13).fill(P({})).concat([P({ hasVideo: false })]))).toEqual({ ok: false, error: 'too_many_clips' });
  });

  test.each([
    ['make a reel from these', '9:16'],
    ['TikTok please', '9:16'],
    ['დაამონტაჟე ვერტიკალურად', '9:16'],
    ['для сторис', '9:16'],
    ['square post', '1:1'],
    ['კვადრატული', '1:1'],
    ['for YouTube', '16:9'],
    ['горизонтально', '16:9'],
    ['cut them to the song', null],
  ])('%s → %s', (text, aspect) => expect(aspectFromPrompt(text)).toBe(aspect));

  test('with no shape named, most clips decide it, rotation included', () => {
    expect(aspectFromClips([P({ width: 1920, height: 1080, rotation: -90 }), P({ width: 1080, height: 1920 }), P({})])).toBe('9:16');
    expect(aspectFromClips([P({}), P({ width: 1080, height: 1920 })])).toBe('16:9');
  });
});

describe('QC of the master', () => {
  test('passes a playable master of the planned length', () => {
    expect(qcMaster(P({ durationSec: 30.2 }), 30)).toEqual({ ok: true, problems: [], durationSec: 30.2 });
  });
  test('names every problem', () => {
    const v = qcMaster(P({ hasAudio: false, videoCodec: 'hevc', durationSec: 20 }), 30);
    expect(v.ok).toBe(false);
    expect(v.problems).toEqual(['no sound', 'picture codec hevc', 'length 20.0s, planned 30.0s']);
    expect(qcMaster(null, 30).ok).toBe(false);
  });
});

describe('AGENT_G_MEDIA_EXEC', () => {
  const user = { id: 'u', app_metadata: {}, user_metadata: {}, email: 'someone@example.com' } as unknown as User;
  test('off unless set; admin by default on a Preview only', () => {
    expect(agentMediaAccess({} as NodeJS.ProcessEnv)).toBe('off');
    expect(agentMediaAccess({ VERCEL_ENV: 'production' } as unknown as NodeJS.ProcessEnv)).toBe('off');
    expect(agentMediaAccess({ VERCEL_ENV: 'preview' } as unknown as NodeJS.ProcessEnv)).toBe('admin');
    expect(agentMediaAccess({ VERCEL_ENV: 'preview', AGENT_G_MEDIA_EXEC: 'off' } as unknown as NodeJS.ProcessEnv)).toBe('off');
    expect(agentMediaAccess({ AGENT_G_MEDIA_EXEC: 'admin' } as unknown as NodeJS.ProcessEnv)).toBe('admin');
    expect(agentMediaAccess({ AGENT_G_MEDIA_EXEC: 'on' } as unknown as NodeJS.ProcessEnv)).toBe('all');
  });
  test('admin opens it to admins only; nobody signed out', () => {
    expect(agentMediaOpenTo(user, { AGENT_G_MEDIA_EXEC: 'admin' } as unknown as NodeJS.ProcessEnv)).toBe(false);
    const admin = { ...user, app_metadata: { role: 'admin' } } as unknown as User;
    expect(agentMediaOpenTo(admin, { AGENT_G_MEDIA_EXEC: 'admin' } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(agentMediaOpenTo(user, { AGENT_G_MEDIA_EXEC: 'on' } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(agentMediaOpenTo(null, { AGENT_G_MEDIA_EXEC: 'on' } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe('per-clip contribution QC (owner, 2026-10-11)', () => {
  const shot = (source: number, startSec: number, endSec: number) => ({ url: `https://x.supabase.co/c${source}.mp4`, source, kind: 'video' as const, startSec, endSec, transition: 'cut' as const });
  const REQ = {
    shots: [shot(0, 1, 3), shot(0, 5, 6), shot(1, 0, 4), shot(2, 2, 3)],
    aspect: '9:16', musicUrl: 'https://x.supabase.co/s.mp3', musicStartSec: 0, musicDuckDb: 0, musicOnly: true,
    manifest: [
      { index: 0, path: 'p0', name: 'a.mp4', kind: 'video', durationSec: 9 },
      { index: 1, path: 'p1', name: 'b.mp4', kind: 'video', durationSec: 11 },
      { index: 2, path: 'p2', name: 'c.mp4', kind: 'video', durationSec: 6 },
      { index: 3, path: 'p3', name: 's.mp3', kind: 'audio', durationSec: 30 },
    ],
  } as unknown as AgentMontageRequest;

  test('the output timeline of hard cuts: each shot starts where the last ended', () => {
    expect(outputTimeline(REQ.shots).map((t) => [t.source, t.outStartSec, t.outEndSec])).toEqual([[0, 0, 2], [0, 2, 3], [1, 3, 7], [2, 7, 8]]);
  });

  test('one probe point per video, in the middle of its longest shot, in the output and in the source', () => {
    expect(clipCheckPoints(REQ).map((p) => [p.index, p.name, p.outT, p.srcT])).toEqual([[0, 'a.mp4', 1, 2], [1, 'b.mp4', 5, 2], [2, 'c.mp4', 7.5, 2.5]]);
  });

  const grey = (v: number, n = 4) => new Uint8Array(n).fill(v);

  test('frameDiff is the mean absolute grey difference; frames that cannot be compared are infinitely far apart', () => {
    expect(frameDiff(grey(10), grey(13))).toBe(3);
    expect(frameDiff(grey(10), grey(10, 8))).toBe(Number.POSITIVE_INFINITY);
    expect(frameDiff(null, grey(1))).toBe(Number.POSITIVE_INFINITY);
  });

  test('every clip seen → ok; a clip whose frame is not in the output → missing; an unread frame fails closed', () => {
    const points = clipCheckPoints(REQ);
    expect(qcClips(points, [grey(10), grey(50), grey(90)], [grey(11), grey(52), grey(90)])).toMatchObject({ ok: true, missing: [], unchecked: [] });
    const gone = qcClips(points, [grey(10), grey(10), grey(90)], [grey(10), grey(50), grey(90)]);
    expect(gone).toMatchObject({ ok: false, missing: [1], unchecked: [] });
    expect(gone.problems).toEqual([`clip 2 "b.mp4" is not in the output at 5s (diff 40 > ${CLIP_QC_MAX_DIFF})`]);
    const unread = qcClips(points, [grey(10), null, grey(90)], [grey(10), grey(50), grey(90)]);
    expect(unread).toMatchObject({ ok: false, missing: [], unchecked: [1] });
  });

  test('A/V: picture and sound present, the picture as long as planned, the sound ending with the picture', () => {
    expect(qcAvSync({ videoSec: 30, audioSec: 29.9 }, 30)).toMatchObject({ ok: true });
    expect(qcAvSync({ videoSec: 30, audioSec: null }, 30).problems).toEqual(['no soundtrack stream']);
    expect(qcAvSync({ videoSec: 30, audioSec: 28 }, 30).problems).toEqual(['sound 28.00s against picture 30.00s']);
    expect(qcAvSync({ videoSec: 20, audioSec: 20 }, 30).problems).toEqual(['picture 20.00s, planned 30.00s']);
    expect(qcAvSync(null, 30)).toMatchObject({ ok: false });
  });
});
