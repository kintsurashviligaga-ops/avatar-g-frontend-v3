/** Agent G montage: the quote token, the shape and input rules, QC, and who the feature is open to. */
jest.mock('../../admin/guard', () => ({ isAdminUser: (u: { app_metadata?: { role?: string } } | null) => u?.app_metadata?.role === 'admin' }));

import type { User } from '@supabase/supabase-js';
import type { BannerProbe } from '@/lib/video/probeBanner';
import { CLIP_QC_MAX_DIFF, STILL_QC_OFFSET_SEC, aspectFromClips, rampOf, audioTiming, aspectFromPrompt, clipCheckPoints, frameDiff, isStillProbe, montageBody, outputTimeline, pickTracks, qcAvSync, qcClips, qcMaster, soundOf, sortInputs, sourceContribution, transitionAsk, wantsBeatCuts } from './montageAsk';
import { checkCoverage, parseAgentRequest, type MontageManifestItem } from './montageManifest';
import { planBeatCuts } from '@/lib/services/montage/beatPlan';
import { MAX_SHOTS, MAX_SHOT_SEC, MAX_TOTAL_SEC, MIN_SHOT_SEC, timelineDuration } from '@/lib/services/montage/montagePlan';
import { MIXED_STYLES, planTransitions } from '@/lib/services/montage/transitionPlan';
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
  test('clips have a picture, a sound file only sound; none, one or two sound files (GG 2026-10-11 17:38Z)', () => {
    expect(sortInputs([P({}), P({ hasVideo: false }), P({})])).toEqual({ ok: true, clips: [0, 2], stills: [], audios: [1] });
    expect(sortInputs([P({}), P({})])).toEqual({ ok: true, clips: [0, 1], stills: [], audios: [] });
    expect(sortInputs([P({}), P({ hasVideo: false }), P({ hasVideo: false })])).toEqual({ ok: true, clips: [0], stills: [], audios: [1, 2] });
    expect(sortInputs([P({}), P({ hasVideo: false }), P({ hasVideo: false }), P({ hasVideo: false })])).toEqual({ ok: false, error: 'several_tracks', files: [1, 2, 3] });
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

  test('a ramped shot: the output point is in its middle on the master, the source point that far × its speed into the window', () => {
    const ramped = { ...REQ, shots: [{ ...REQ.shots[0]!, speed: 0.5 }, REQ.shots[1]!, { ...REQ.shots[2]!, speed: 2 }, REQ.shots[3]!] } as AgentMontageRequest;
    // Shot 0: 1–3 s of a.mp4 at 0.5× lasts 4 s on the master; shot 2: 0–4 s of b.mp4 at 2× lasts 2 s.
    expect(outputTimeline(ramped.shots).map((t) => [t.source, t.outStartSec, t.outEndSec, t.speed])).toEqual([[0, 0, 4, 0.5], [0, 4, 5, 1], [1, 5, 7, 2], [2, 7, 8, 1]]);
    expect(clipCheckPoints(ramped).map((p) => [p.index, p.outT, p.srcT])).toEqual([[0, 2, 2], [1, 6, 2], [2, 7.5, 2.5]]);
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

describe('a photo among the clips (owner, 2026-10-11 11:37Z: 4 clips + a photo + an MP3 were refused)', () => {
  const JPG = P({ hasAudio: false, videoCodec: 'mjpeg', durationSec: 0.04, width: 1200, height: 1600, audioCodec: undefined });

  test('a still picture is a photo; a camera clip in MJPEG, a clip with sound, an h264 clip and nothing are not', () => {
    expect(isStillProbe(JPG)).toBe(true);
    expect(isStillProbe({ ...JPG, videoCodec: 'png', durationSec: 0 })).toBe(true);
    expect(isStillProbe({ ...JPG, videoCodec: 'HEVC', durationSec: Number.NaN })).toBe(true);
    expect(isStillProbe({ ...JPG, durationSec: 6 })).toBe(false);
    expect(isStillProbe({ ...JPG, hasAudio: true })).toBe(false);
    expect(isStillProbe({ ...JPG, videoCodec: 'h264' })).toBe(false);
    expect(isStillProbe(null)).toBe(false);
  });

  test('sortInputs: the photo is a picture of the edit and named a still; photos alone are a montage; a 0 s photo is readable', () => {
    expect(sortInputs([P({}), JPG, P({ hasVideo: false })])).toEqual({ ok: true, clips: [0, 1], stills: [1], audios: [2] });
    expect(sortInputs([P({ hasVideo: false }), P({}), P({}), P({}), P({}), { ...JPG, durationSec: 0 }]))
      .toEqual({ ok: true, clips: [1, 2, 3, 4, 5], stills: [5], audios: [0] });
    // Photos alone are a montage too (GG 2026-10-11 17:38Z: „სურათის მონტაჟსაც არ აკეთებს"); sound alone is not.
    expect(sortInputs([JPG, JPG, P({ hasVideo: false })])).toEqual({ ok: true, clips: [0, 1], stills: [0, 1], audios: [2] });
    expect(sortInputs([P({ hasVideo: false })])).toEqual({ ok: false, error: 'no_clip' });
  });

  test('the body shows the photo as an image shot, the run check accepts it, and every file of the manifest has its shot', () => {
    const manifest: MontageManifestItem[] = [
      { index: 0, path: 'u/a.mov', name: 'a.mov', kind: 'video', durationSec: 14 },
      { index: 1, path: 'u/p.jpg', name: 'p.jpg', kind: 'image', durationSec: 0 },
      { index: 2, path: 'u/b.mov', name: 'b.mov', kind: 'video', durationSec: 9 },
      { index: 3, path: 'u/s.mp3', name: 's.mp3', kind: 'audio', durationSec: 95 },
    ];
    const plan = planBeatCuts({
      clipDurationsSec: [14, 0, 9], stills: [false, true, false], musicSec: 95, grid: null, targetSec: 20,
      maxShots: MAX_SHOTS, maxTotalSec: MAX_TOTAL_SEC, minShotSec: MIN_SHOT_SEC, maxShotSec: MAX_SHOT_SEC,
    });
    expect(plan.ok).toBe(true);
    const clips = [
      { url: 'https://x.supabase.co/a.mov', source: 0 },
      { url: 'https://x.supabase.co/p.jpg', source: 1, still: true },
      { url: 'https://x.supabase.co/b.mov', source: 2 },
    ];
    const body = montageBody(plan, clips, { mode: 'music', musicUrl: 'https://x.supabase.co/s.mp3' }, '9:16', manifest) as { shots: Array<{ kind: string; source: number }> };
    expect(body.shots.filter((s) => s.source === 1).map((s) => s.kind)).toEqual(['image']);
    expect(body.shots.filter((s) => s.source !== 1).every((s) => s.kind === 'video')).toBe(true);
    const parsed = parseAgentRequest(body);
    expect(parsed.ok).toBe(true);
    expect(checkCoverage(body.shots, manifest)).toEqual({ ok: true });
    // A photo's shot sent as a video shot (or the other way round) is refused, not repaired.
    const swapped = body.shots.map((s) => (s.source === 1 ? { ...s, kind: 'video' } : s));
    expect(checkCoverage(swapped, manifest)).toMatchObject({ ok: false });
  });

  test('the per-clip check looks for the photo just after its shot starts, at the photo itself (t = 0)', () => {
    const shot = (source: number, kind: 'video' | 'image', startSec: number, endSec: number) => ({ url: `https://x.supabase.co/c${source}`, source, kind, startSec, endSec, transition: 'cut' as const });
    const req = {
      shots: [shot(0, 'video', 1, 3), shot(1, 'image', 0, 2), shot(2, 'video', 0, 4)],
      aspect: '9:16', musicUrl: 'https://x.supabase.co/s.mp3', musicStartSec: 0, musicDuckDb: 0, musicOnly: true,
      manifest: [
        { index: 0, path: 'p0', name: 'a.mp4', kind: 'video', durationSec: 9 },
        { index: 1, path: 'p1', name: 'p.jpg', kind: 'image', durationSec: 0 },
        { index: 2, path: 'p2', name: 'c.mp4', kind: 'video', durationSec: 6 },
        { index: 3, path: 'p3', name: 's.mp3', kind: 'audio', durationSec: 30 },
      ],
    } as unknown as AgentMontageRequest;
    expect(clipCheckPoints(req).map((p) => [p.index, p.outT, p.srcT])).toEqual([[0, 1, 2], [1, 2 + STILL_QC_OFFSET_SEC, 0], [2, 6, 2]]);
  });
});

describe('transitions between the shots (GG 2026-10-11 17:38Z: „ქაფქათს და სხვა ფუნქციებს")', () => {
  test.each<[string, ReturnType<typeof transitionAsk>]>([
    ['დაამონტაჟე მუსიკაზე, კადრებს შორის გადასვლები გაუკეთე', { styles: ['crossfade'] }],
    ['cut these to the music with crossfades', { styles: ['crossfade'] }],
    ['cut to the music and fade between the clips', { styles: ['crossfade'] }],
    ['cut to the music, fade to black between the clips', { styles: ['fade'] }],
    ['смонтируй под музыку с переходами', { styles: ['crossfade'] }],
    ['ზუმით გადასვლები გაუკეთე', { styles: ['zoom'] }],
    ['zoom and slide transitions', { styles: ['zoom', 'slide'] }],
    ['transitions with a white flash', { styles: ['flash'] }],
    ['переходы: зум, шторка и вспышка', { styles: ['zoom', 'wipe', 'flash'] }],
    ['სხვადასხვა გადასვლები ჩასვი', { styles: [...MIXED_STYLES], mixed: true }],
    ['use different transitions every time', { styles: [...MIXED_STYLES], mixed: true }],
    ['წრიული და პიქსელის გადასვლები', { styles: ['circle', 'pixelize'] }],
    ['blur transitions, 0.8 s', { styles: ['blur'], sec: 0.8 }],
    ['0.5 წამიანი მდოვრე გადასვლები', { styles: ['crossfade'], sec: 0.5 }],
    ['переходы по 0,3 с', { styles: ['crossfade'], sec: 0.3 }],
    ['quick transitions', { styles: ['crossfade'], sec: 0.3 }],
    ['ნელი, მდოვრე გადასვლები', { styles: ['crossfade'], sec: 1 }],
  ])('%s → %j', (text, want) => {
    expect(transitionAsk(text)).toEqual(want);
  });

  test('no transition asked, or none wanted: null', () => {
    for (const t of ['დაამონტაჟე მუსიკაზე', 'cut these to the beat', 'no transitions, hard cuts', 'გადასვლების გარეშე დაამონტაჟე', 'без переходов', '', undefined]) {
      expect(transitionAsk(t)).toBeNull();
    }
  });

  test('a zoom EFFECT beside the transitions, a white TEXT, a black-and-white grade and the edit\'s length are not the transitions\' own', () => {
    expect(transitionAsk('cut these to the music with crossfade transitions and a zoom')).toEqual({ styles: ['crossfade'] });
    expect(transitionAsk('ზუმ ეფექტი და გადასვლები')).toEqual({ styles: ['crossfade'] });
    expect(transitionAsk('შავ-თეთრი გახადე და გადასვლები დაამატე')).toEqual({ styles: ['crossfade'] });
    expect(transitionAsk('transitions, white text "Summer"')).toEqual({ styles: ['crossfade'] });
    expect(transitionAsk('20 წამიანი მონტაჟი გადასვლებით')).toEqual({ styles: ['crossfade'] });
    expect(transitionAsk('მუსიკა 1 წამიდან, გადასვლებით')).toEqual({ styles: ['crossfade'] });
  });

  test('the body carries each shot\'s window and transition; the lane, the timeline and the QC agree on the length', () => {
    const manifest: MontageManifestItem[] = [
      { index: 0, path: 'u/a.mov', name: 'a.mov', kind: 'video', durationSec: 14 },
      { index: 1, path: 'u/p.jpg', name: 'p.jpg', kind: 'image', durationSec: 0 },
      { index: 2, path: 'u/b.mov', name: 'b.mov', kind: 'video', durationSec: 9 },
      { index: 3, path: 'u/s.mp3', name: 's.mp3', kind: 'audio', durationSec: 95 },
    ];
    const plan = planBeatCuts({
      clipDurationsSec: [14, 0, 9], stills: [false, true, false], musicSec: 95, grid: null, targetSec: 20,
      maxShots: MAX_SHOTS, maxTotalSec: MAX_TOTAL_SEC, minShotSec: MIN_SHOT_SEC, maxShotSec: MAX_SHOT_SEC,
    });
    const tr = planTransitions({ cuts: plan.cuts, clipDurationsSec: [14, 0, 9], stills: [false, true, false], ask: { styles: ['zoom'] }, keepLength: true, maxShotSec: MAX_SHOT_SEC });
    expect(tr.summary.applied).toBeGreaterThan(0);
    const clips = [
      { url: 'https://x.supabase.co/a.mov', source: 0 },
      { url: 'https://x.supabase.co/p.jpg', source: 1, still: true },
      { url: 'https://x.supabase.co/b.mov', source: 2 },
    ];
    const body = montageBody(plan, clips, { mode: 'music', musicUrl: 'https://x.supabase.co/s.mp3' }, '9:16', manifest, tr.shots);
    const parsed = parseAgentRequest(body);
    expect(parsed.ok).toBe(true);
    const req = (parsed as { request: AgentMontageRequest }).request;
    expect(req.shots[0]!.transition).toBe('cut');
    expect(req.shots.filter((s) => s.transition === 'zoom').length).toBe(tr.summary.applied);
    // Held to the beat: the length with the transitions is the plan's, to the millisecond.
    expect(timelineDuration(req.shots)).toBe(plan.totalSec);
    expect(timelineDuration(req.shots)).toBe(tr.totalSec);
    const tl = outputTimeline(req.shots);
    expect(tl[tl.length - 1]!.outEndSec).toBe(plan.totalSec);
    // The photo is looked for after the transition into it; a video in the middle of its shot.
    const photo = clipCheckPoints(req).find((p) => p.index === 1)!;
    const at = tl.find((x) => x.source === 1)!;
    const into = tl[at.shot - 1] ? tl[at.shot - 1]!.outEndSec - at.outStartSec : 0;
    expect(photo.outT).toBeCloseTo(at.outStartSec + into + STILL_QC_OFFSET_SEC, 3);
  });
});

describe('provenance from the render graph (Media Studio v2.0 §6)', () => {
  const manifest = [
    { index: 0, path: 'a', name: 'a.mp4', kind: 'video' as const, durationSec: 10 },
    { index: 1, path: 's', name: 'song.mp3', kind: 'audio' as const, durationSec: 200 },
    { index: 2, path: 'b', name: 'b.jpg', kind: 'image' as const, durationSec: 0 },
  ];
  const shot = (source: number, startSec: number, endSec: number, kind: 'video' | 'image' = 'video') =>
    ({ url: `u${source}`, source, kind, startSec, endSec, muted: true, transition: 'cut' as const });
  const request = {
    shots: [shot(0, 1, 3), shot(2, 0, 2, 'image'), shot(0, 5, 7.5)],
    aspect: '9:16' as const, musicUrl: 'u1', musicStartSec: 58, musicDuckDb: 0, musicOnly: true, manifest,
  };

  test('each used picture: its shots, its windows in the master and the source, its seconds of the master', () => {
    expect(sourceContribution(request)).toEqual([
      { index: 0, name: 'a.mp4', kind: 'video', shots: 2, outputSec: 4.5, windows: [
        { outStartSec: 0, outEndSec: 2, srcStartSec: 1, srcEndSec: 3 },
        { outStartSec: 4, outEndSec: 6.5, srcStartSec: 5, srcEndSec: 7.5 },
      ] },
      { index: 2, name: 'b.jpg', kind: 'image', shots: 1, outputSec: 2, windows: [{ outStartSec: 2, outEndSec: 4, srcStartSec: 0, srcEndSec: 2 }] },
    ]);
  });

  test('the two audio clocks stay apart: the track from 0:58, laid from the first frame, for the master length', () => {
    expect(audioTiming(request)).toEqual({ sourceStartSec: 58, timelineStartSec: 0, targetSec: 6.5, endPolicy: 'stop', sourceAudio: 'remove', replacementAudio: 'replace' });
  });
});

describe('rampOf: the speed changes a montage message asks for', () => {
  test.each([
    ['დაამონტაჟე, სადაც საჭიროა ააჩქარე კადრი და სადაც საჭიროა შეანელე რომ ეფექტი გამოვიდეს', 'mixed'],
    ['cut these to the music with speed ramps', 'mixed'],
    ['speed up and slow down where it fits', 'mixed'],
    ['дай замедление и ускорение по музыке', 'mixed'],
    ['დაამონტაჟე და ზოგი კადრი შეანელე', 'slow'],
    ['slow-mo on the calm parts', 'slow'],
    ['make some shots faster', 'fast'],
    ['ускорь кадры на припеве', 'fast'],
  ])('%s → %s', (text, mode) => {
    expect(rampOf(text)).toBe(mode);
  });

  test('no speed words, or a word that only contains the letters („პანელი"), asks for nothing', () => {
    expect(rampOf('დაამონტაჟე ეს კლიპები მუსიკაზე 9:16')).toBeNull();
    expect(rampOf('ქვედა პანელი გამიკეთე')).toBeNull();
    expect(rampOf(undefined)).toBeNull();
  });
});


// GG 2026-10-11 17:38Z: „ვიდეოში რომ იყოს თავისი ხმაც და ზემოდან მუსიკა დაედოს ან ნარაცია".
describe('the sound of a montage, in the user\'s words', () => {
  test.each([
    ['cut these to the music', true, 'music'],
    ['დაამონტაჟე, თავისი ხმაც დარჩეს და ზემოდან მუსიკა დაადე', true, 'own+music'],
    ['keep the original sound and put the song under it', true, 'own+music'],
    ['смонтируй, оставь оригинальный звук и добавь музыку', true, 'own+music'],
    ['დაამონტაჟე ეს ვიდეოები', false, 'own'],
    ['join these clips', false, 'own'],
    ['გააერთიანე უხმოდ', false, 'silent'],
    ['join them without sound', false, 'silent'],
    ['склей без звука', false, 'silent'],
    // „უხმოდ" said of the music only, with a track: the track stays
    ['cut these to the music', false, 'own'],
  ] as const)('%s (music sent: %s) → %s', (text, hasMusic, mode) => expect(soundOf(text, hasMusic)).toBe(mode));

  test('pickTracks: the recording named as one is the narration; else the one with a beat is the music', () => {
    const song = { index: 2, name: 'song.mp3', durationSec: 180, grid: { bpm: 120, periodSec: 0.5, phaseSec: 0, confidence: 0.6 } };
    const voice = { index: 3, name: 'voice memo.m4a', durationSec: 20, grid: null };
    const plain = { index: 3, name: 'audio2.m4a', durationSec: 20, grid: null };
    expect(pickTracks('cut to the music', [song, voice])).toEqual({ music: 2, voice: 3 });
    expect(pickTracks('cut to the music', [voice, song])).toEqual({ music: 2, voice: 3 });
    expect(pickTracks('cut to the music', [song, plain])).toEqual({ music: 2, voice: 3 });
    // One file: the music, unless the words ask a narration and no music, or its name says it is a recording.
    expect(pickTracks('cut to the music', [song])).toEqual({ music: 2, voice: null });
    expect(pickTracks('დაამონტაჟე და ჩემი ნარაცია დაადე', [plain])).toEqual({ music: null, voice: 3 });
    expect(pickTracks('დაამონტაჟე, ნარაციაც და მუსიკაც', [song])).toEqual({ music: 2, voice: null });
    expect(pickTracks('join these', [voice])).toEqual({ music: null, voice: 3 });
    expect(pickTracks('join these', [])).toEqual({ music: null, voice: null });
  });

  test('wantsBeatCuts: the beat named in any language', () => {
    expect(wantsBeatCuts('დაამონტაჟე ბითზე')).toBe(true);
    expect(wantsBeatCuts('cut on the beat')).toBe(true);
    expect(wantsBeatCuts('нарежь в ритм')).toBe(true);
    expect(wantsBeatCuts('join these clips')).toBe(false);
  });

  const M2: MontageManifestItem[] = [
    { index: 0, path: 'u/a.mov', name: 'a.mov', kind: 'video', durationSec: 14 },
    { index: 1, path: 'u/b.mov', name: 'b.mov', kind: 'video', durationSec: 9 },
  ];
  const PLAN = { ok: true, cuts: [{ clip: 0, startSec: 0, endSec: 6, beats: 0 }, { clip: 1, startSec: 0, endSec: 4, beats: 0 }], musicStartSec: 0, leadInSec: 0, totalSec: 10, beatSynced: false, bpm: null, unitSec: 1 / 30, beatsPerShot: 0, unusedClips: [] };
  const CLIPS = [{ url: 'https://x.supabase.co/a.mov', source: 0 }, { url: 'https://x.supabase.co/b.mov', source: 1 }];

  test('montageBody: the clips\' own sound kept unless the music alone or silence was asked; the request carries only the sound sent', () => {
    const own = montageBody(PLAN, CLIPS, { mode: 'own' }, '16:9', M2) as Record<string, unknown> & { shots: Array<{ muted: boolean }> };
    expect(own.shots.every((x) => !x.muted)).toBe(true);
    expect(own).toMatchObject({ musicOnly: false });
    expect(own).not.toHaveProperty('musicUrl');
    expect(own).not.toHaveProperty('musicGainDb');
    const silent = montageBody(PLAN, CLIPS, { mode: 'silent' }, '16:9', M2) as { shots: Array<{ muted: boolean }> };
    expect(silent.shots.every((x) => x.muted)).toBe(true);
    const under = montageBody(PLAN, CLIPS, { mode: 'own+music', musicUrl: 'https://x.supabase.co/s.mp3' }, '16:9', [...M2, { index: 2, path: 'u/s.mp3', name: 's.mp3', kind: 'audio', durationSec: 60 }]);
    expect(under).toMatchObject({ musicOnly: false, musicGainDb: -10, musicUrl: 'https://x.supabase.co/s.mp3', musicStartSec: 0 });
    const voiced = montageBody(PLAN, CLIPS, { mode: 'own', voiceUrl: 'https://x.supabase.co/v.m4a', voiceStartSec: 1.5 }, '16:9', [...M2, { index: 2, path: 'u/v.m4a', name: 'v.m4a', kind: 'voice', durationSec: 8 }]);
    expect(voiced).toMatchObject({ voiceUrl: 'https://x.supabase.co/v.m4a', voiceStartSec: 1.5 });
    expect(voiced).not.toHaveProperty('musicUrl');
  });

  test('the run check takes each sound mode, and audioTiming says what each does', () => {
    const vm = [...M2, { index: 2, path: 'u/v.m4a', name: 'v.m4a', kind: 'voice' as const, durationSec: 8 }];
    const own = parseAgentRequest(montageBody(PLAN, CLIPS, { mode: 'own', voiceUrl: 'https://x.supabase.co/v.m4a' }, '16:9', vm));
    if (!own.ok) throw new Error(own.error);
    expect(audioTiming(own.request)).toMatchObject({ sourceAudio: 'preserve', replacementAudio: 'none', voice: { timelineStartSec: 0 } });
    const silent = parseAgentRequest(montageBody(PLAN, CLIPS, { mode: 'silent' }, '16:9', M2));
    if (!silent.ok) throw new Error(silent.error);
    expect(audioTiming(silent.request)).toMatchObject({ sourceAudio: 'remove', replacementAudio: 'none' });
    expect(audioTiming(silent.request)).not.toHaveProperty('voice');
    // A narration in the manifest the request does not lay, or one laid that the manifest does not list: refused.
    expect(parseAgentRequest(montageBody(PLAN, CLIPS, { mode: 'own' }, '16:9', vm))).toMatchObject({ ok: false, code: 'manifest_invalid' });
    expect(parseAgentRequest(montageBody(PLAN, CLIPS, { mode: 'own', voiceUrl: 'https://x.supabase.co/v.m4a' }, '16:9', M2))).toMatchObject({ ok: false, code: 'manifest_invalid' });
    // The same for the music.
    const am = [...M2, { index: 2, path: 'u/s.mp3', name: 's.mp3', kind: 'audio' as const, durationSec: 60 }];
    expect(parseAgentRequest(montageBody(PLAN, CLIPS, { mode: 'own' }, '16:9', am))).toMatchObject({ ok: false, code: 'manifest_invalid' });
    const mix = parseAgentRequest(montageBody(PLAN, CLIPS, { mode: 'own+music', musicUrl: 'https://x.supabase.co/s.mp3' }, '16:9', am));
    if (!mix.ok) throw new Error(mix.error);
    expect(audioTiming(mix.request)).toMatchObject({ sourceAudio: 'preserve', replacementAudio: 'mix' });
  });
});
