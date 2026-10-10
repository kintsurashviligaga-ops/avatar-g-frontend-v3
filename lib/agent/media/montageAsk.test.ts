/** Agent G montage: the quote token, the shape and input rules, QC, and who the feature is open to. */
jest.mock('../../admin/guard', () => ({ isAdminUser: (u: { app_metadata?: { role?: string } } | null) => u?.app_metadata?.role === 'admin' }));

import type { User } from '@supabase/supabase-js';
import type { BannerProbe } from '@/lib/video/probeBanner';
import { aspectFromClips, aspectFromPrompt, qcMaster, sortInputs } from './montageAsk';
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
