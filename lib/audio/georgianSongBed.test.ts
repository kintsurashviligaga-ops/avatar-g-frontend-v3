/** @jest-environment node */
/**
 * The Georgian song's instrumental bed runs ONE engine (the owner, 2026-10-09: no silent fallback to another outside
 * provider): ElevenLabs Music when its key is present, and its miss is a miss, never a MusicGen (Replicate) render.
 */
jest.mock('server-only', () => ({}));
jest.mock('ffmpeg-static', () => null);
jest.mock('../observability/report-error', () => ({ reportError: jest.fn() }));
jest.mock('../chat/filmVoiceover', () => ({ textToHostedSpeech: jest.fn() }));
const composeElevenLabsMusic = jest.fn();
const hasElevenLabsMusicKey = jest.fn();
jest.mock('../elevenlabs/music', () => ({
  composeElevenLabsMusic: (...a: unknown[]) => composeElevenLabsMusic(...a),
  hasElevenLabsMusicKey: () => hasElevenLabsMusicKey(),
}));
const generateMusic = jest.fn();
jest.mock('../ai/replicate', () => ({ generateMusic: (...a: unknown[]) => generateMusic(...a) }));
jest.mock('../orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => 'https://x.supabase.co/bed.mp3') }));

import { instrumentalBed } from './georgianSong';

beforeEach(() => jest.clearAllMocks());

it('ElevenLabs configured and it misses → null, and MusicGen is never called', async () => {
  hasElevenLabsMusicKey.mockReturnValue(true);
  composeElevenLabsMusic.mockRejectedValue(new Error('EL 500'));
  await expect(instrumentalBed('funk', 30)).resolves.toBeNull();
  expect(generateMusic).not.toHaveBeenCalled();
});

it('ElevenLabs configured and it lands → its hosted bed', async () => {
  hasElevenLabsMusicKey.mockReturnValue(true);
  composeElevenLabsMusic.mockResolvedValue({ audio: Buffer.from([1]), contentType: 'audio/mpeg' });
  await expect(instrumentalBed('funk', 30)).resolves.toBe('https://x.supabase.co/bed.mp3');
  expect(generateMusic).not.toHaveBeenCalled();
});

it('no ElevenLabs key → MusicGen is the configured engine', async () => {
  hasElevenLabsMusicKey.mockReturnValue(false);
  generateMusic.mockResolvedValue({ audioUrl: 'https://replicate.delivery/x.mp3' });
  await expect(instrumentalBed('funk', 30)).resolves.toBe('https://replicate.delivery/x.mp3');
});
