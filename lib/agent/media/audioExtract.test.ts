/**
 * Agent G's audio extraction, the request side (./audioExtract), every effect faked (./testing/fakeAudioDeps): the
 * source rule before anything is fetched, the live check and the rights it finds, a signed free quote, one queued row
 * per quote however often Start is pressed, the owner's status and cancel, and the QC an MP3 must pass.
 */
import { bodyFingerprint } from '@/lib/orchestrator/idemRef';
import {
  AUDIO_KIND, AUDIO_KICK_AFTER_MS, MAX_SOURCE_SEC, MP3_BITRATE_KBPS, audioCodeOfRow, audioJobStatus, cancelAudioJob,
  enqueueAudioJob, qcMp3, quoteAudioExtract, validateAudioRequest, type AudioRequest,
} from './audioExtract';
import { signQuote } from './quoteToken';
import { AUDIO_URL, LINK, MP3, SOURCE, UPLOAD, USER, fakeAudio, type FakeAudio } from './testing/fakeAudioDeps';

async function quoted(f: FakeAudio, input: { url?: string; file?: string; name?: string } = { url: LINK }) {
  const q = await quoteAudioExtract(f.deps, { userId: USER, ...input });
  if (!q.ok) throw new Error(q.error);
  return q;
}

describe('quote: the source, its rights, a free signed plan', () => {
  test('a direct link: checked live, named after the file, rights unverified, free, nothing queued', async () => {
    const f = fakeAudio();
    const q = await quoted(f);
    expect(f.inspected).toEqual(['https://media.example.com/clips/Concert%20Night.mp4']);
    expect(q.quote).toMatchObject({
      jobId: 'job-1', credits: 0, source: 'link', host: 'media.example.com', name: 'Concert Night.mp3', bytes: 48_000_000,
      contentType: 'video/mp4', rights: { status: 'unverified' }, bitrateKbps: MP3_BITRATE_KBPS, maxSec: MAX_SOURCE_SEC,
    });
    expect(q.request).toEqual({
      v: 1, source: { kind: 'link', url: LINK }, name: 'Concert Night.mp3', bitrateKbps: 192, maxSec: 3600, rights: { status: 'unverified' },
    });
    expect(q.token).toEqual(expect.any(String));
    expect(f.store.rows.size).toBe(0);
    expect(f.audits.map((a) => `${a.op}:${a.phase}:${a.outcome}`)).toEqual(['audio_extract:quote:ok']);
  });

  test('a licence the source publishes is named on the plan, with its author and where it was read', async () => {
    const f = fakeAudio({
      inspect: async (url) => ({
        ok: true, fetchUrl: url, contentType: 'video/webm', bytes: 1000, disposition: null,
        license: { license: 'CC BY 3.0', author: 'Blender Foundation', evidence: 'https://commons.wikimedia.org/wiki/File:A.webm' },
      }),
    });
    const q = await quoted(f, { url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/A.webm' });
    expect(q.quote.rights).toEqual({ status: 'licensed', license: 'CC BY 3.0', author: 'Blender Foundation', evidence: 'https://commons.wikimedia.org/wiki/File:A.webm' });
    expect(q.quote.name).toBe('A.mp3');
  });

  test('a page that names its file (a Commons file page): the plan takes the file, under the same rule', async () => {
    const file = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Song_of_a_bird.ogg';
    const f = fakeAudio({ inspect: async () => ({ ok: true, fetchUrl: file, contentType: 'application/ogg', bytes: 900, disposition: null, license: { license: 'CC0', evidence: 'p' } }) });
    const q = await quoted(f, { url: 'https://commons.wikimedia.org/wiki/File:Song_of_a_bird.ogg' });
    expect(q.request.source).toEqual({ kind: 'link', url: file });
    expect(q.quote.name).toBe('Song_of_a_bird.mp3');
  });

  test('a platform link is refused before any fetch, by name, and audited', async () => {
    const f = fakeAudio();
    const r = await quoteAudioExtract(f.deps, { userId: USER, url: 'https://youtu.be/dQw4w9WgXcQ' });
    expect(r).toMatchObject({ ok: false, error: 'platform', platform: 'YouTube' });
    expect(f.inspected).toEqual([]);
    expect(f.audits).toEqual([expect.objectContaining({ phase: 'quote', outcome: 'refused', detail: 'platform: YouTube' })]);
  });

  test('a redirect that lands on a platform, a stream, a web page, a dead link, an internal host and an oversized file are refused', async () => {
    const cases = [
      [{ ok: false, error: 'platform', platform: 'TikTok' }, { error: 'platform', platform: 'TikTok' }],
      [{ ok: false, error: 'stream' }, { error: 'stream' }],
      [{ ok: false, error: 'not_media' }, { error: 'not_media' }],
      [{ ok: false, error: 'unavailable', status: 404 }, { error: 'unavailable', status: 404 }],
      [{ ok: false, error: 'blocked_host' }, { error: 'blocked_host' }],
      [{ ok: false, error: 'too_large' }, { error: 'too_large' }],
    ] as const;
    for (const [seen, want] of cases) {
      const f = fakeAudio({ inspect: async () => seen as never });
      expect(await quoteAudioExtract(f.deps, { userId: USER, url: LINK })).toMatchObject({ ok: false, ...want });
    }
  });

  test('a page whose file turns out to sit on a platform is refused', async () => {
    const f = fakeAudio({ inspect: async () => ({ ok: true, fetchUrl: 'https://video.twimg.com/x.mp4', contentType: 'video/mp4', bytes: 1, disposition: null, license: null }) });
    expect(await quoteAudioExtract(f.deps, { userId: USER, url: LINK })).toMatchObject({ ok: false, error: 'platform', platform: 'X' });
  });

  test('the caller’s own upload: theirs, named after the file they uploaded; someone else’s is refused', async () => {
    const f = fakeAudio({ foreign: [`omni-uploads/other/x.mp4`] });
    const q = await quoted(f, { file: UPLOAD, name: 'Birthday clip.mov' });
    expect(q.request.source).toEqual({ kind: 'file', ref: UPLOAD });
    expect(q.quote).toMatchObject({ source: 'file', host: null, name: 'Birthday clip.mp3', rights: { status: 'own' } });
    expect(f.inspected).toEqual([`https://x.supabase.co/signed/${UPLOAD}`]);
    expect(await quoteAudioExtract(f.deps, { userId: USER, file: 'omni-uploads/other/x.mp4' })).toMatchObject({ ok: false, error: 'media_not_yours' });
    expect(await quoteAudioExtract(f.deps, { userId: USER, file: 'omni-uploads/user-a/missing.mp4' })).toMatchObject({ ok: false, error: 'unreadable' });
  });

  test('exactly one source; no signing key, no quote', async () => {
    const f = fakeAudio();
    expect(await quoteAudioExtract(f.deps, { userId: USER })).toMatchObject({ ok: false, error: 'bad_input' });
    expect(await quoteAudioExtract(f.deps, { userId: USER, url: LINK, file: UPLOAD })).toMatchObject({ ok: false, error: 'bad_input' });
    expect(await quoteAudioExtract(f.deps, { userId: USER, url: 42 })).toMatchObject({ ok: false, error: 'bad_input' });
    expect(await quoteAudioExtract(fakeAudio({ key: '' }).deps, { userId: USER, url: LINK })).toMatchObject({ ok: false, error: 'not_configured' });
  });
});

describe('run: only the quoted plan, queued once', () => {
  test('queues one row under the quote’s job id, with the request stored for the worker', async () => {
    const f = fakeAudio();
    const q = await quoted(f);
    const r = await enqueueAudioJob(f.deps, { userId: USER, request: q.request, token: q.token });
    expect(r).toEqual({ ok: true, jobId: 'job-1', status: 'queued', stage: 'queued', pct: 0, attempt: 0, replay: false });
    const row = f.store.rows.get('job-1')!;
    expect(row).toMatchObject({ userId: USER, status: 'pending', exec: { kind: AUDIO_KIND, attempt: 0 } });
    expect(row.params).toMatchObject({ subtype: 'audio-extract', via: 'agent-g', source: 'link', rights: 'unverified', _job: { request: q.request } });
  });

  test('a voice yes is kept on the row and in the audit with its words', async () => {
    const f = fakeAudio();
    const q = await quoted(f);
    await enqueueAudioJob(f.deps, { userId: USER, request: q.request, token: q.token, approval: { channel: 'voice-transcript', said: 'да, давай' } });
    expect(f.store.rows.get('job-1')!.params._approval).toEqual({ channel: 'voice-transcript', said: 'да, давай' });
    expect(f.audits.at(-1)).toMatchObject({ phase: 'run', outcome: 'ok', approval: 'voice-transcript', detail: expect.stringContaining('approved by voice "да, давай"') });
  });

  test('pressing Start again reports the same job and queues nothing new; a finished one comes back re-signed', async () => {
    const f = fakeAudio();
    const q = await quoted(f);
    await enqueueAudioJob(f.deps, { userId: USER, request: q.request, token: q.token });
    const again = await enqueueAudioJob(f.deps, { userId: USER, request: q.request, token: q.token });
    expect(again).toMatchObject({ ok: true, jobId: 'job-1', status: 'queued', replay: true });
    expect(f.store.rows.size).toBe(1);
    const row = f.store.rows.get('job-1')!;
    f.store.rows.set('job-1', { ...row, status: 'completed', result: { audioUrl: AUDIO_URL, name: 'Concert Night.mp3', durationSec: 189.5, bytes: 4_546_000, bitrateKbps: 192, rights: { status: 'unverified' } } });
    expect(await enqueueAudioJob(f.deps, { userId: USER, request: q.request, token: q.token })).toMatchObject({
      status: 'completed', audioUrl: `${AUDIO_URL}&fresh=1`, name: 'Concert Night.mp3', replay: true,
    });
    f.store.rows.set('job-1', { ...row, status: 'failed', error: 'no_audio: x' });
    expect(await enqueueAudioJob(f.deps, { userId: USER, request: q.request, token: q.token })).toMatchObject({ ok: false, error: 'already_failed' });
  });

  test('a changed plan, another user, an expired or forged token, or a plan the rule refuses are not queued', async () => {
    const f = fakeAudio();
    const q = await quoted(f);
    const changed = { ...q.request, source: { kind: 'link', url: 'https://media.example.com/other.mp4' } };
    expect(await enqueueAudioJob(f.deps, { userId: USER, request: changed, token: q.token })).toMatchObject({ ok: false, error: 'quote_changed' });
    expect(await enqueueAudioJob(f.deps, { userId: 'user-b', request: q.request, token: q.token })).toMatchObject({ ok: false, error: 'quote_invalid' });
    expect(await enqueueAudioJob(f.deps, { userId: USER, request: q.request, token: 'x.y' })).toMatchObject({ ok: false, error: 'quote_invalid' });
    f.clock.now += 31 * 60_000;
    expect(await enqueueAudioJob(f.deps, { userId: USER, request: q.request, token: q.token })).toMatchObject({ ok: false, error: 'quote_expired' });
    // A plan pointing at a platform cannot be signed into a run, even with a valid signature over it.
    const yt: AudioRequest = { ...q.request, source: { kind: 'link', url: 'https://www.youtube.com/watch?v=1' } };
    const token = signQuote({ u: USER, j: 'job-9', f: bodyFingerprint(yt), c: 0, x: f.clock.now + 60_000 }, 'k')!;
    expect(await enqueueAudioJob(f.deps, { userId: USER, request: yt, token })).toMatchObject({ ok: false, error: 'invalid_request' });
    expect(f.store.rows.size).toBe(0);
  });

  test('a queue that cannot record the row starts nothing', async () => {
    const f = fakeAudio();
    const q = await quoted(f);
    f.store.down = true;
    expect(await enqueueAudioJob(f.deps, { userId: USER, request: q.request, token: q.token })).toMatchObject({ ok: false, error: 'jobs_unavailable' });
  });
});

describe('status and cancel: the owner’s only', () => {
  test('a fresh row waits for its worker; one nobody took is handed to one; another user sees nothing', async () => {
    const f = fakeAudio();
    const q = await quoted(f);
    await enqueueAudioJob(f.deps, { userId: USER, request: q.request, token: q.token });
    expect(await audioJobStatus(f.deps, { userId: USER, jobId: 'job-1' })).toMatchObject({ view: { status: 'queued' }, needsWorker: false });
    f.clock.now += AUDIO_KICK_AFTER_MS;
    expect(await audioJobStatus(f.deps, { userId: USER, jobId: 'job-1' })).toMatchObject({ needsWorker: true });
    expect(await audioJobStatus(f.deps, { userId: 'user-b', jobId: 'job-1' })).toMatchObject({ ok: false, error: 'not_found' });
    expect(await audioJobStatus(f.deps, { userId: USER, jobId: 7 })).toMatchObject({ ok: false, error: 'not_found' });
  });

  test('cancel fails the row for its worker to see; a second cancel, another user’s, or a finished job is refused', async () => {
    const f = fakeAudio();
    const q = await quoted(f);
    await enqueueAudioJob(f.deps, { userId: USER, request: q.request, token: q.token });
    expect(await cancelAudioJob(f.deps, { userId: 'user-b', jobId: 'job-1' })).toMatchObject({ ok: false, error: 'not_found' });
    expect(await cancelAudioJob(f.deps, { userId: USER, jobId: 'job-1' })).toEqual({ ok: true });
    expect(f.store.rows.get('job-1')).toMatchObject({ status: 'failed', error: 'cancelled by the user' });
    expect(f.store.rows.get('job-1')!.exec!.owe).toBeUndefined();
    expect(await cancelAudioJob(f.deps, { userId: USER, jobId: 'job-1' })).toMatchObject({ ok: false, error: 'not_running' });
    expect(await audioJobStatus(f.deps, { userId: USER, jobId: 'job-1' })).toMatchObject({ view: { status: 'failed', error: 'cancelled' } });
  });
});

describe('validateAudioRequest and the row’s error', () => {
  const ok: AudioRequest = { v: 1, source: { kind: 'link', url: LINK }, name: 'a.mp3', bitrateKbps: 192, maxSec: 3600, rights: { status: 'unverified' } };
  test.each([
    ['another version', { ...ok, v: 2 }],
    ['another bitrate', { ...ok, bitrateKbps: 320 }],
    ['a longer cap', { ...ok, maxSec: 99_999 }],
    ['a name with a folder', { ...ok, name: '../a.mp3' }],
    ['not an mp3 name', { ...ok, name: 'a.wav' }],
    ['unknown rights', { ...ok, rights: { status: 'mine' } }],
    ['a platform link', { ...ok, source: { kind: 'link', url: 'https://vimeo.com/1' } }],
    ['an empty file ref', { ...ok, source: { kind: 'file', ref: ' ' } }],
    ['another source kind', { ...ok, source: { kind: 'shell', cmd: 'rm' } }],
  ])('refuses %s', (_why, r) => expect(validateAudioRequest(r)).toBeNull());

  test('rows are written "<code>: detail"; anything unknown reads as extract_failed', () => {
    expect(audioCodeOfRow('no_audio: the source has no sound stream')).toBe('no_audio');
    expect(audioCodeOfRow('platform: YouTube')).toBe('platform');
    expect(audioCodeOfRow('cancelled by the user')).toBe('cancelled');
    expect(audioCodeOfRow('rm -rf: x')).toBe('extract_failed');
    expect(audioCodeOfRow(null)).toBe('extract_failed');
  });
});

describe('qcMp3: what an MP3 must be before it is delivered', () => {
  test('MP3 sound only, more than a header, as long as the source', () => {
    expect(qcMp3(MP3, SOURCE, 4_546_000, 3600)).toEqual({ ok: true, problems: [], durationSec: 189.5 });
  });

  test.each([
    ['unreadable', null, SOURCE, 4000, ['the MP3 could not be read back']],
    ['no sound', { ...MP3, hasAudio: false, audioCodec: null }, SOURCE, 4000, ['no sound']],
    ['a picture stream', { ...MP3, hasVideo: true, videoCodec: 'h264' }, SOURCE, 4000, ['a picture stream']],
    ['not mp3', { ...MP3, audioCodec: 'aac' }, SOURCE, 4000, ['sound codec aac']],
    ['a header only', MP3, SOURCE, 400, ['only 400 bytes']],
    ['too short', { ...MP3, durationSec: 0.1 }, { ...SOURCE, durationSec: 0 }, 4000, ['shorter than a fifth of a second']],
    ['cut short', { ...MP3, durationSec: 120 }, SOURCE, 4000, ['length 120.0s, source 189.4s']],
  ] as const)('%s', (_why, out, input, bytes, problems) => {
    expect(qcMp3(out as never, input as never, bytes, 3600)).toMatchObject({ ok: false, problems });
  });

  test('a source over the cap is held to the cap, not its full length', () => {
    expect(qcMp3({ ...MP3, durationSec: 3600 }, { ...SOURCE, durationSec: 3600.4 }, 9e7, 3600).ok).toBe(true);
  });
});
