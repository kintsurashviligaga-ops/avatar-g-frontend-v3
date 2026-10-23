/** @jest-environment node */
/**
 * The words come first: when the lyric writer misses, the Georgian song is not built at all — no cloned-voice reading and
 * no instrumental are paid for, and no canned lyrics stand in (the old fixed funk template sang the same song for every
 * brief). The caller then has the film's own song composed from the brief.
 */
jest.mock('server-only', () => ({}));
jest.mock('ffmpeg-static', () => '/usr/bin/ffmpeg');
jest.mock('../observability/report-error', () => ({ reportError: jest.fn() }));
const textToHostedSpeech = jest.fn();
jest.mock('../chat/filmVoiceover', () => ({ textToHostedSpeech: (...a: unknown[]) => textToHostedSpeech(...a) }));
const generateLyriaTrack = jest.fn();
const hasLyriaProvider = jest.fn(() => true);
jest.mock('../ai/lyriaMusic', () => ({
  generateLyriaTrack: (...a: unknown[]) => generateLyriaTrack(...a),
  hasLyriaProvider: () => hasLyriaProvider(),
}));
jest.mock('../orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn() }));
const generateWithGemini = jest.fn();
jest.mock('../gemini/client', () => ({ generateWithGemini: (...a: unknown[]) => generateWithGemini(...a) }));
jest.mock('../ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));

import { generateGeorgianSong } from './georgianSong';

beforeEach(() => jest.clearAllMocks());

it('a lyric-writer miss returns null before any voice or music is composed', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  generateWithGemini.mockRejectedValue(new Error('Gemini 503'));
  await expect(generateGeorgianSong('სიმღერა ზღვაზე', 'female', 32)).resolves.toBeNull();
  expect(textToHostedSpeech).not.toHaveBeenCalled();
  expect(generateLyriaTrack).not.toHaveBeenCalled();
});

it('with lyrics in hand, the cloned voice reads THOSE lyrics, and the bed is Lyria\'s clip until Pro is verified', async () => {
  generateWithGemini.mockResolvedValue({ text: 'ზღვა ანათებს დილით ადრე\nტალღა მღერის ჩემთან ერთად\nქარი მოდის შორი გზიდან\nზღვა ანათებს, გული ფრინავს' });
  textToHostedSpeech.mockResolvedValue(null); // stop at the mix: the legs are what this test checks
  generateLyriaTrack.mockResolvedValue({ base64: 'AQ==', mime: 'audio/mpeg' });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  await generateGeorgianSong('სიმღერა ზღვაზე', 'female', 48, undefined, { sceneSec: 8 });
  expect(textToHostedSpeech.mock.calls[0][0]).toContain('ზღვა ანათებს დილით ადრე');
  expect(generateLyriaTrack).toHaveBeenCalledWith(expect.objectContaining({ instrumental: true, model: 'lyria-3-clip-preview' }));
  const { prompt } = generateLyriaTrack.mock.calls[0][0] as { prompt: string };
  expect(prompt).toContain('90 BPM');
  expect(prompt).toContain('A 30-second'); // the clip's own length, not the song's 48 s (lib/audio/lyriaBed)
});
