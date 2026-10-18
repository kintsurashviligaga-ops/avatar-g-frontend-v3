/** @jest-environment node */
/**
 * deliverVoicedAvatar — a talking avatar's clip is shown WITH its ElevenLabs line (GG 2026-10-17 07:54Z): a finished
 * voiced file is re-signed, never muxed again; a missing line or a failed mux is "not yet" (null), never a silent clip.
 */
jest.mock('server-only', () => ({}));
jest.mock('../orchestrator/storage-adapter', () => ({ createSignedAssetUrl: jest.fn() }));
jest.mock('../video/remixOps', () => ({ muxVoiceOntoClip: jest.fn() }));

import { createSignedAssetUrl } from '../orchestrator/storage-adapter';
import { muxVoiceOntoClip } from '../video/remixOps';
import { deliverVoicedAvatar } from './voicedClip';

const UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const signed = (map: Record<string, string | null>) => (createSignedAssetUrl as jest.Mock).mockImplementation(async (_b: string, path: string) => map[path] ?? null);

beforeEach(() => jest.clearAllMocks());

test('the line is laid over the clip for 8 s at the fixed voiced path', async () => {
  signed({ [`avatar-veo/${UUID}/voice.mp3`]: 'https://s/voice.mp3' });
  (muxVoiceOntoClip as jest.Mock).mockResolvedValue('https://s/voiced.mp4');
  expect(await deliverVoicedAvatar('https://s/clip.mp4', UUID)).toBe('https://s/voiced.mp4');
  expect(muxVoiceOntoClip).toHaveBeenCalledWith('https://s/clip.mp4', 'https://s/voice.mp3', 8, { bucket: 'renders', path: `avatar-veo/${UUID}/voiced.mp4` });
});

test('a repeat poll re-signs the voiced file and never muxes again', async () => {
  signed({ [`avatar-veo/${UUID}/voiced.mp4`]: 'https://s/voiced-again.mp4' });
  expect(await deliverVoicedAvatar('https://s/clip.mp4', UUID)).toBe('https://s/voiced-again.mp4');
  expect(muxVoiceOntoClip).not.toHaveBeenCalled();
});

test('no line found, or the mux failed → null (the status route keeps it "delivering")', async () => {
  signed({});
  expect(await deliverVoicedAvatar('https://s/clip.mp4', UUID)).toBeNull();
  expect(muxVoiceOntoClip).not.toHaveBeenCalled();
  signed({ [`avatar-veo/${UUID}/voice.mp3`]: 'https://s/voice.mp3' });
  (muxVoiceOntoClip as jest.Mock).mockResolvedValue(null);
  expect(await deliverVoicedAvatar('https://s/clip.mp4', UUID)).toBeNull();
});
