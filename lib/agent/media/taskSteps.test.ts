import type { AudioQuote } from './audioExtract';
import type { MontageQuote } from './montageExec';
import type { EditQuote } from './editExec';
import { audioTask, cardOwnsJob, clockText, countText, editTask, jobCreditsText, montageTask, type StepState } from './taskSteps';

const NAMES = ['clip-1.mp4', 'clip-2.mp4', 'clip-3.mp4', 'track.mp3'];
const MQ: MontageQuote = { jobId: 'job-m', credits: 0, totalSec: 10.57, shots: 6, clips: 3, aspect: '16:9', beatSynced: true, bpm: 119.2, musicStartSec: 0, unusedFiles: [], expiresAt: 1 };
const AQ: AudioQuote = {
  jobId: 'job-a', credits: 0, source: 'link', host: 'upload.wikimedia.org', name: 'flower.mp3', bytes: 4_509_000, contentType: 'video/mp4',
  rights: { status: 'licensed', license: 'CC BY-SA 4.0', author: 'MDN' }, bitrateKbps: 192, maxSec: 3600, expiresAt: 1,
};
const EQ: EditQuote = {
  jobId: 'job-e', credits: 0, name: 'trip-edit.mp4', expiresAt: 1,
  edits: [{ op: 'trim', fromSec: 5, toSec: 12 }, { op: 'aspect', to: '9:16', fit: 'crop' }],
  plan: { sourceSec: 30, output: 'mp4', durationSec: 7, hasAudio: true, width: 1080, height: 1920, copyVideo: false },
};
const states = (m: { steps: Array<{ state: StepState }> }) => m.steps.map((s) => s.state).join(' ');

describe('the montage card is every step, from the upload to the saved result', () => {
  test('from the moment it is sent: the upload counts the files, then the analysis spins', () => {
    const first = montageTask({ phase: 'reading', names: NAMES, uploaded: 1, t0: 1000 }, 'en');
    expect(first.steps).toHaveLength(8);
    expect(states(first)).toBe('active pending pending pending pending pending pending pending');
    expect(first.steps[0]).toMatchObject({ label: 'Upload the files', note: '1/4' });
    expect(first).toMatchObject({ status: 'working', statusText: 'Working', countText: '0/8 steps', clock: { from: 1000 } });

    const reading = montageTask({ phase: 'reading', names: NAMES, uploaded: 4 }, 'en');
    expect(states(reading)).toBe('done active pending pending pending pending pending pending');
    expect(reading.steps[0]!.detail).toBe('3 clips · 1 track');
  });

  test('the plan waits for Start, with what was found and what it will make', () => {
    const m = montageTask({ phase: 'quoted', names: NAMES, quote: MQ }, 'ka');
    expect(states(m)).toBe('done done waiting pending pending pending pending pending');
    expect(m.steps[1]!.detail).toBe('119 BPM · ყოველი ჭრა ბითზე');
    expect(m.steps[2]).toMatchObject({ detail: '6 კადრი 3 კლიპიდან · 10.6 წმ · 16:9 · უფასო', note: 'ველოდები „დაწყებას“' });
    expect(m).toMatchObject({ status: 'waiting', countText: '2/8 ნაბიჯი', clock: null });
  });

  test('a run marks every step before its stage done, even one a poll skipped', () => {
    const m = montageTask({ phase: 'running', names: NAMES, quote: MQ, stage: 'stitch', pct: 71.6, t0: 5000 }, 'en');
    expect(states(m)).toBe('done done done done done active pending pending');
    expect(m.steps[5]!.label).toBe('Join the shots');
    expect(m).toMatchObject({ pct: 72, countText: '5/8 steps', clock: { from: 5000 } });
    expect(states(montageTask({ phase: 'running', names: NAMES, quote: MQ, stage: null }, 'en'))).toBe('done done done active pending pending pending pending');
    expect(montageTask({ phase: 'running', names: NAMES, quote: MQ, stage: 'music', stopping: true }, 'ru').steps[6]!.note).toBe('Останавливаю…');
  });

  test('done keeps the whole list, all ticked, with the clock frozen', () => {
    const m = montageTask({ phase: 'done', names: NAMES, quote: MQ, stage: 'completed', t0: 5000, t1: 77_000 }, 'ka');
    expect(states(m)).toBe('done done done done done done done done');
    expect(m).toMatchObject({ status: 'done', statusText: 'მზადაა', countText: '8/8 ნაბიჯი', pct: null, clock: { from: 5000, to: 77_000 } });
    expect(m.steps[7]!.detail).toBe('ბიბლიოთეკაშიც შევინახე');
  });

  test('Stop marks the step it stopped on; the rest were never reached', () => {
    const m = montageTask({ phase: 'cancelled', names: NAMES, quote: MQ, stage: 'normalize', t0: 1, t1: 2 }, 'en');
    expect(states(m)).toBe('done done done done stopped skipped skipped skipped');
    expect(m).toMatchObject({ status: 'stopped', statusText: 'Stopped' });
  });

  test('Cancel on the plan stops at the plan', () => {
    const m = montageTask({ phase: 'dismissed', names: NAMES, quote: MQ }, 'en');
    expect(states(m)).toBe('done done stopped skipped skipped skipped skipped skipped');
    expect(m.steps[2]!.note).toBe('Cancelled');
  });

  test('a failure marks where it broke: an upload, the reading, or the stage of the run', () => {
    expect(states(montageTask({ phase: 'failed', names: NAMES, error: 'upload_failed' }, 'en'))).toBe('failed skipped skipped skipped skipped skipped skipped skipped');
    expect(states(montageTask({ phase: 'failed', names: NAMES, error: 'plan_failed' }, 'en'))).toBe('done failed skipped skipped skipped skipped skipped skipped');
    expect(states(montageTask({ phase: 'failed', names: NAMES, quote: MQ, stage: 'music', error: 'render_failed' }, 'en'))).toBe('done done done done done done failed skipped');
  });

  test('no steady beat says so on the analysis step', () => {
    expect(montageTask({ phase: 'quoted', names: NAMES, quote: { ...MQ, beatSynced: false, bpm: null } }, 'en').steps[1]!.detail).toBe('No steady beat · an even half-second grid');
  });
});

describe('the MP3 card: source, rights, plan, extraction, check, save', () => {
  test('a link is checked first; the plan names the host, the size, the licence and the file', () => {
    expect(states(audioTask({ phase: 'checking', source: 'link', t0: 9 }, 'en'))).toBe('active pending pending pending pending pending');
    expect(audioTask({ phase: 'checking', source: 'file' }, 'en').steps[0]!.label).toBe('Upload and read the file');
    const m = audioTask({ phase: 'quoted', quote: AQ }, 'en');
    expect(states(m)).toBe('done done waiting pending pending pending');
    expect(m.steps[0]!.detail).toBe('upload.wikimedia.org · 4.3 MB');
    expect(m.steps[1]).toMatchObject({ detail: 'CC BY-SA 4.0, by MDN', warn: false, attrs: { 'data-testid': 'agent-audio-rights', 'data-rights': 'licensed' } });
    expect(m.steps[2]!.detail).toBe('„flower.mp3“ · MP3 192 kbps · free');
  });

  test('rights nobody could show are a caution on the card', () => {
    const m = audioTask({ phase: 'quoted', quote: { ...AQ, rights: { status: 'unverified' } } }, 'en');
    expect(m.steps[1]).toMatchObject({ warn: true, attrs: { 'data-rights': 'unverified' } });
    expect(audioTask({ phase: 'quoted', quote: { ...AQ, source: 'file', host: null, rights: { status: 'own' } } }, 'en').steps[1]!.detail).toBe('yours');
  });

  test('the run, the end and the refusals', () => {
    expect(states(audioTask({ phase: 'running', quote: AQ, stage: 'qc', pct: 80 }, 'en'))).toBe('done done done done active pending');
    expect(states(audioTask({ phase: 'done', quote: AQ, stage: 'completed' }, 'en'))).toBe('done done done done done done');
    expect(states(audioTask({ phase: 'cancelled', quote: AQ, stage: 'extract' }, 'en'))).toBe('done done done stopped skipped skipped');
    expect(states(audioTask({ phase: 'failed', source: 'link', error: 'platform' }, 'en'))).toBe('failed skipped skipped skipped skipped skipped');
  });
});

describe('the edit card: the video, the plan, the edit, the check, the save', () => {
  test('the plan says exactly what it keeps and makes, before Start', () => {
    expect(states(editTask({ phase: 'reading', source: 'file', t0: 9 }, 'en'))).toBe('active pending pending pending pending');
    expect(editTask({ phase: 'reading', source: 'previous' }, 'en').steps[0]!.label).toBe('Open my last result');
    const m = editTask({ phase: 'quoted', source: 'file', quote: EQ }, 'en');
    expect(m.title).toBe('Video edit');
    expect(states(m)).toBe('done waiting pending pending pending');
    expect(m.steps[1]!.detail).toBe('keeps 0:05–0:12 · frame 9:16, cropped to fill · MP4 · 0:07 · 1080×1920 · free');
    expect(m.steps[1]!.note).toBe('Waiting for Start');
    const ka = editTask({ phase: 'quoted', source: 'file', quote: EQ }, 'ka');
    expect(ka.steps[1]!.detail).toBe('ვტოვებ 0:05–0:12 · კადრი 9:16, კიდეების ჩამოჭრით · MP4 · 0:07 · 1080×1920 · უფასო');
  });

  test('a still is named as one', () => {
    const still: EditQuote = { ...EQ, edits: [{ op: 'thumbnail', atSec: 3 }], plan: { ...EQ.plan, output: 'jpg', durationSec: 0, hasAudio: false } };
    const m = editTask({ phase: 'running', source: 'previous', quote: still, stage: 'render' }, 'en');
    expect(m.title).toBe('A still from the video');
    expect(m.steps[2]!.label).toBe('Take the still');
    expect(m.steps[1]!.detail).toBe('a still from 0:03 · JPEG · 1080×1920 · free');
  });

  test('the run, the end and the refusals', () => {
    expect(states(editTask({ phase: 'running', quote: EQ, stage: 'qc', pct: 80 }, 'en'))).toBe('done done done active pending');
    expect(editTask({ phase: 'running', quote: EQ, stage: 'render', pct: 10 }, 'en').pct).toBe(10);
    expect(states(editTask({ phase: 'done', quote: EQ, stage: 'completed' }, 'en'))).toBe('done done done done done');
    expect(editTask({ phase: 'done', quote: EQ }, 'en').steps[4]!.detail).toBe('Also saved to your Library');
    expect(states(editTask({ phase: 'cancelled', quote: EQ, stage: 'render' }, 'en'))).toBe('done done stopped skipped skipped');
    expect(states(editTask({ phase: 'dismissed', quote: EQ }, 'en'))).toBe('done stopped skipped skipped skipped');
    expect(states(editTask({ phase: 'failed', source: 'file', error: 'out_of_range' }, 'en'))).toBe('failed skipped skipped skipped skipped');
  });
});

test('counts and clocks read in each language', () => {
  expect([countText(3, 8, 'ka'), countText(3, 8, 'en'), countText(3, 8, 'ru')]).toEqual(['3/8 ნაბიჯი', '3/8 steps', 'Шаги: 3/8']);
  expect([clockText(7_400), clockText(83_000), clockText(-5)]).toEqual(['0:07', '1:23', '0:00']);
});

test('the card keeps its job from the tray while it runs and after the server ended it; a lost follow hands it back', () => {
  const quote = { jobId: 'job-1' };
  expect(cardOwnsJob({ phase: 'running', quote })).toBe('job-1');
  expect(cardOwnsJob({ phase: 'done', quote })).toBe('job-1');
  expect(cardOwnsJob({ phase: 'cancelled', quote })).toBe('job-1');
  expect(cardOwnsJob({ phase: 'failed', error: 'render_failed', quote })).toBe('job-1');
  expect(cardOwnsJob({ phase: 'failed', error: 'network', quote })).toBeNull();
  expect(cardOwnsJob({ phase: 'failed', error: 'not_found', quote })).toBeNull();
  expect(cardOwnsJob({ phase: 'quoted', quote })).toBeNull();
  expect(cardOwnsJob({ phase: 'running' })).toBeNull();
  expect(cardOwnsJob(undefined)).toBeNull();
});

describe('each card says why it broke, and what it spent', () => {
  test('the step the work broke on carries the reason as a caution', () => {
    const m = montageTask({ phase: 'failed', names: NAMES, quote: MQ, stage: 'stitch', error: 'render_failed', t0: 1, t1: 2 }, 'en');
    const broke = m.steps.find((x) => x.state === 'failed')!;
    expect(broke.key).toBe('stitch');
    expect(broke.warn).toBe(true);
    expect(broke.detail && broke.detail.length).toBeGreaterThan(5);
    const a = audioTask({ phase: 'failed', source: 'link', error: 'platform_blocked', t0: 1, t1: 2 }, 'ka');
    expect(a.steps.find((x) => x.state === 'failed')).toMatchObject({ key: 'source', warn: true });
    const e = editTask({ phase: 'failed', source: 'file', quote: EQ, stage: 'render', error: 'render_failed', t0: 1, t1: 2 }, 'ru');
    expect(e.steps.find((x) => x.state === 'failed')).toMatchObject({ key: 'render', warn: true });
    // A stop is not a failure: no reason line.
    const stopped = montageTask({ phase: 'cancelled', names: NAMES, quote: MQ, stage: 'stitch', error: 'cancelled', t0: 1, t1: 2 }, 'en');
    expect(stopped.steps.some((x) => x.warn)).toBe(false);
  });

  test('the credits line: held while it runs, spent when delivered, paid back when not; none before or on a plan', () => {
    expect(jobCreditsText('running', 4, 'en')).toBe('✦ 4 held, charged only for the result');
    expect(jobCreditsText('done', 4, 'en')).toBe('✦ 4 spent');
    expect(jobCreditsText('failed', 4, 'en')).toBe('Nothing spent: ✦ 4 paid back');
    expect(jobCreditsText('cancelled', 4, 'ru')).toBe('Ничего не потрачено: ✦ 4 возвращено');
    expect(jobCreditsText('done', 0, 'ka')).toBe('უფასოა, არაფერი ჩამოიჭრება');
    expect(jobCreditsText('quoted', 4, 'en')).toBeNull();
    expect(jobCreditsText('dismissed', 4, 'en')).toBeNull();
    expect(jobCreditsText('failed', undefined, 'en')).toBeNull();
  });
});
