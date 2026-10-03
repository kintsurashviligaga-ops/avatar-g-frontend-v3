/** @jest-environment node */
/**
 * runMontage — leg 5 (music) hands the request's `musicStartSec` to the mux as the song's start, in both lanes
 * ('under' with the clips' sound, 'bed' for music only), and 0 when the edit has none. The legs before it are stubbed:
 * their encode is covered elsewhere (surgicalOps / remixOps tests).
 */
jest.mock('server-only', () => ({}));
jest.mock('../../video/surgicalOps', () => ({ renderConcat: jest.fn(async () => 'https://cdn.test/master.mp4') }));
jest.mock('../../video/remixOps', () => ({
  fitAspect: jest.fn(async (url: string) => `${url}#fitted`),
  kenBurnsClip: jest.fn(async () => 'https://cdn.test/still.mp4'),
  muxAudioOntoVideo: jest.fn(async () => 'https://cdn.test/with-music.mp4'),
}));
jest.mock('../../orchestrator/storage-adapter', () => ({
  uploadBufferAndSign: jest.fn(),
  reSignIfInternal: jest.fn(async (url: string) => url),
}));
jest.mock('../../orchestrator/jobs', () => ({ updateJobStage: jest.fn(async () => undefined) }));
jest.mock('../../observability/report-error', () => ({ reportError: jest.fn() }));

// eslint-disable-next-line import/first
import { runMontage } from './montagePipeline';
// eslint-disable-next-line import/first
import { muxAudioOntoVideo } from '../../video/remixOps';
// eslint-disable-next-line import/first
import { validateMontageRequest, type MontageRequest } from './montagePlan';

const request = (over: Record<string, unknown> = {}): MontageRequest => {
  const r = validateMontageRequest({
    shots: [{ url: 'https://cdn.test/a.mp4', startSec: 0, endSec: 6 }],
    aspect: '9:16',
    musicUrl: 'https://cdn.test/song.mp3',
    ...over,
  });
  if (!r.ok || !r.request) throw new Error(r.error);
  return r.request;
};

beforeEach(() => jest.clearAllMocks());

describe('runMontage · the music start', () => {
  it('under the clips’ sound: the mux gets the start as the song’s offset', async () => {
    const out = await runMontage(request({ musicStartSec: 42.5 }));
    expect(out.ok && out.result.hasMusic).toBe(true);
    expect(muxAudioOntoVideo).toHaveBeenCalledWith('https://cdn.test/master.mp4', 'https://cdn.test/song.mp3', 'under', 12, 42.5);
  });

  it('music only: the same offset on the bed lane', async () => {
    await runMontage(request({ musicStartSec: 7, musicOnly: true }));
    expect(muxAudioOntoVideo).toHaveBeenCalledWith('https://cdn.test/master.mp4', 'https://cdn.test/song.mp3', 'bed', 12, 7);
  });

  it('no start: the top of the song (0), as before', async () => {
    await runMontage(request());
    expect(muxAudioOntoVideo).toHaveBeenCalledWith('https://cdn.test/master.mp4', 'https://cdn.test/song.mp3', 'under', 12, 0);
  });

  it('no bed: no mux at all', async () => {
    await runMontage(request({ musicUrl: undefined, musicStartSec: 30 }));
    expect(muxAudioOntoVideo).not.toHaveBeenCalled();
  });
});
