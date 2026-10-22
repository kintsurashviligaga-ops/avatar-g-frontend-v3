/** @jest-environment node */
/**
 * lib/audio/lyriaBed — a film / ad / Georgian-song bed asks Lyria only for what is verified on this project: an
 * instrumental on the clip model, a longer bed only on a verified Pro (and only to its verified length), a sung song only
 * once vocals are verified. A miss is null and nothing runs behind it.
 */
jest.mock('server-only', () => ({}));
const generateLyriaTrack = jest.fn();
const hasLyriaProvider = jest.fn(() => true);
jest.mock('../ai/lyriaMusic', () => ({
  generateLyriaTrack: (...a: unknown[]) => generateLyriaTrack(...a),
  hasLyriaProvider: () => hasLyriaProvider(),
}));
const uploadAndSign = jest.fn();
jest.mock('../orchestrator/storage-adapter', () => ({ uploadAndSign: (...a: unknown[]) => uploadAndSign(...a) }));

import { composeLyriaBed, lyriaBedPlan } from './lyriaBed';

const CLIP = { model: 'lyria-3-clip-preview', sec: 30 };

beforeEach(() => {
  jest.clearAllMocks();
  hasLyriaProvider.mockReturnValue(true);
  generateLyriaTrack.mockResolvedValue({ base64: 'AQID', mime: 'audio/mpeg' });
  uploadAndSign.mockResolvedValue('https://storage.example/bed.mp3');
});

describe('lyriaBedPlan', () => {
  test('an instrumental is the clip model, at most its own 30 s, while Pro is not verified', () => {
    expect(lyriaBedPlan(8, true, {})).toEqual({ model: 'lyria-3-clip-preview', sec: 8 });
    expect(lyriaBedPlan(48, true, {})).toEqual(CLIP);
    expect(lyriaBedPlan(48, true, { MUSIC_LYRIA_PRO_SECONDS: '120' })).toEqual(CLIP); // a length without the verification
  });

  test('a verified Pro makes a longer bed, up to the length it was verified at', () => {
    const env = { MUSIC_LYRIA_PRO_VERIFIED: '1', MUSIC_LYRIA_PRO_SECONDS: '120' };
    expect(lyriaBedPlan(48, true, env)).toEqual({ model: 'lyria-3-pro-preview', sec: 48 });
    expect(lyriaBedPlan(240, true, env)).toEqual({ model: 'lyria-3-pro-preview', sec: 120 });
    expect(lyriaBedPlan(24, true, env)).toEqual({ model: 'lyria-3-clip-preview', sec: 24 });
  });

  test('a sung song only once vocals are verified; before that there is no plan (no instrumental stands in)', () => {
    expect(lyriaBedPlan(30, false, {})).toBeNull();
    expect(lyriaBedPlan(30, false, { MUSIC_LYRIA_VOCALS_VERIFIED: '1' })).toEqual(CLIP);
  });
});

describe('composeLyriaBed', () => {
  test('one Lyria request on the planned model, hosted for a week in the folder asked for', async () => {
    const url = await composeLyriaBed({ prompt: 'A 30-second film score.', plan: CLIP, instrumental: true, folder: 'films' });
    expect(url).toBe('https://storage.example/bed.mp3');
    expect(generateLyriaTrack).toHaveBeenCalledTimes(1);
    expect(generateLyriaTrack).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'A 30-second film score.', instrumental: true, model: 'lyria-3-clip-preview' }));
    const [bucket, path, base64, mime, ttl] = uploadAndSign.mock.calls[0];
    expect([bucket, base64, mime, ttl]).toEqual(['uploads', 'AQID', 'audio/mpeg', 604_800]);
    expect(path).toMatch(/^films\/lyria-\d+-[a-z0-9]+\.mp3$/);
  });

  test('Pro is steered to the length by the prompt; the bucket can be chosen', async () => {
    await composeLyriaBed({ prompt: 'Score.', plan: { model: 'lyria-3-pro-preview', sec: 60 }, instrumental: true, bucket: 'ads', folder: 'productad-music' });
    expect(generateLyriaTrack.mock.calls[0][0].prompt).toBe('Score. About 60 seconds long, with a complete structure and a real ending.');
    expect(uploadAndSign.mock.calls[0][0]).toBe('ads');
  });

  test('a miss is null: Lyria not configured, no track, a failed upload, or an aborted caller', async () => {
    hasLyriaProvider.mockReturnValue(false);
    expect(await composeLyriaBed({ prompt: 'x', plan: CLIP, instrumental: true, folder: 'films' })).toBeNull();
    expect(generateLyriaTrack).not.toHaveBeenCalled();
    hasLyriaProvider.mockReturnValue(true);
    generateLyriaTrack.mockResolvedValueOnce(null);
    expect(await composeLyriaBed({ prompt: 'x', plan: CLIP, instrumental: true, folder: 'films' })).toBeNull();
    expect(uploadAndSign).not.toHaveBeenCalled();
    uploadAndSign.mockResolvedValueOnce(null);
    expect(await composeLyriaBed({ prompt: 'x', plan: CLIP, instrumental: true, folder: 'films' })).toBeNull();
    const ctl = new AbortController();
    ctl.abort();
    generateLyriaTrack.mockClear();
    expect(await composeLyriaBed({ prompt: 'x', plan: CLIP, instrumental: true, folder: 'films', signal: ctl.signal })).toBeNull();
    expect(generateLyriaTrack).not.toHaveBeenCalled();
  });

  test('a WAV answer is stored as .wav', async () => {
    generateLyriaTrack.mockResolvedValueOnce({ base64: 'AQID', mime: 'audio/wav' });
    await composeLyriaBed({ prompt: 'x', plan: CLIP, instrumental: true, folder: 'films' });
    expect(uploadAndSign.mock.calls[0][1]).toMatch(/\.wav$/);
  });
});
