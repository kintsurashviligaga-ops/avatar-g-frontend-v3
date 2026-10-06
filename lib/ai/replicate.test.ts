/** @jest-environment node */
const mockRun = jest.fn();
jest.mock('replicate', () => jest.fn().mockImplementation(() => ({ run: (...a: unknown[]) => mockRun(...a) })));
import { generateMusic, generateVoiceSong, generateMusicCover, upscaleImage } from './replicate';

test('all retired Replicate SDK operations reject before using the SDK', async () => {
  await expect(generateMusic('music', 30)).rejects.toMatchObject({ code: 'provider_deprecated' });
  await expect(generateVoiceSong('song', 'https://example.com/voice.wav')).rejects.toMatchObject({ code: 'provider_deprecated' });
  await expect(generateMusicCover('song', 'https://example.com/song.mp3')).rejects.toMatchObject({ code: 'provider_deprecated' });
  await expect(upscaleImage('https://example.com/photo.png')).rejects.toMatchObject({ code: 'provider_deprecated' });
  expect(mockRun).not.toHaveBeenCalled();
});
