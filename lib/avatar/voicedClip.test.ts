/** @jest-environment node */
/**
 * deliverVoicedAvatar — a talking avatar is shown WITH its ElevenLabs line (GG 2026-10-17 07:54Z), its mouth redrawn by
 * sync.so at the line's natural speed and length (GG 12:29Z). One poll moves one step: a finished file is re-signed; a
 * first poll starts ONE lip sync on the line with a short silent tail; a later poll collects it, lays our line under
 * the picture, hosts it at the fixed path and books what it cost once. A refusal is `failed` (refunded by the status
 * route); anything transient is `pending`.
 */
jest.mock('server-only', () => ({}));
jest.mock('../orchestrator/storage-adapter', () => ({ createSignedAssetUrl: jest.fn() }));
jest.mock('../video/remixOps', () => ({ padVoiceTail: jest.fn(), laySyncedVoice: jest.fn() }));
jest.mock('../audio/mp3Duration', () => ({ mp3DurationSec: jest.fn() }));
jest.mock('../services/billing/BillingGuard', () => ({ recordUsage: jest.fn(async () => undefined) }));
jest.mock('../providers/syncso', () => ({
  ...jest.requireActual('../providers/syncso'),
  startLipsync: jest.fn(),
  pollLipsync: jest.fn(),
}));
const mockStore = new Map<string, string>();
jest.mock('../platform/redis', () => ({
  redisGetString: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  redisSetString: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  redisSetIfNotExists: jest.fn(async (k: string, v: string) => { if (mockStore.has(k)) return false; mockStore.set(k, v); return true; }),
  redisDelete: jest.fn(async (k: string) => { mockStore.delete(k); }),
}));

import { createSignedAssetUrl } from '../orchestrator/storage-adapter';
import { laySyncedVoice, padVoiceTail } from '../video/remixOps';
import { mp3DurationSec } from '../audio/mp3Duration';
import { recordUsage } from '../services/billing/BillingGuard';
import { pollLipsync, startLipsync } from '../providers/syncso';
import { TAIL_SEC, avatarSyncLinePath, deliverVoicedAvatar, syncCostUsd, tailPadSec } from './voicedClip';

const UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CLIP = 'https://s/clip.mp4';
const VOICE = `avatar-veo/${UUID}/voice.mp3`;
const VOICED = `avatar-veo/${UUID}/voiced.mp4`;
const TAILED = avatarSyncLinePath(UUID);
const signed = (map: Record<string, string>) => (createSignedAssetUrl as jest.Mock).mockImplementation(async (_b: string, path: string) => map[path] ?? null);
const ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.clear();
  process.env = { ...ENV };
  delete process.env.SYNC_LIPSYNC_MODEL;
  global.fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as unknown as typeof fetch;
  (mp3DurationSec as jest.Mock).mockReturnValue(2.69);
  (padVoiceTail as jest.Mock).mockResolvedValue('https://s/line-tail.wav');
  (startLipsync as jest.Mock).mockResolvedValue({ ok: true, id: 'gen-1' });
  (pollLipsync as jest.Mock).mockResolvedValue({ state: 'pending' });
  (laySyncedVoice as jest.Mock).mockResolvedValue('https://s/voiced.mp4');
});
afterAll(() => { process.env = ENV; });

describe('the tail and the cost', () => {
  it('the line gets 0.6 s of silence, less when it nearly fills the 8 s clip, none past it or when unmeasured', () => {
    expect(tailPadSec(2.69)).toBe(TAIL_SEC);
    expect(tailPadSec(7.7)).toBe(0.3);
    expect(tailPadSec(8.1)).toBe(0);
    expect(tailPadSec(null)).toBe(0);
    expect(tailPadSec(Number.NaN)).toBe(0);
  });
  it('cost is the model\'s per-second price for the seconds delivered', () => {
    expect(syncCostUsd('lipsync-2-pro', 3.29)).toBeCloseTo(0.27389, 5);
    expect(syncCostUsd('lipsync-2', 4)).toBe(0.2);
  });
});

test('a finished file is re-signed and nothing is asked of sync.so again', async () => {
  signed({ [VOICED]: 'https://s/voiced-again.mp4' });
  expect(await deliverVoicedAvatar(CLIP, UUID)).toEqual({ state: 'ready', url: 'https://s/voiced-again.mp4' });
  expect(startLipsync).not.toHaveBeenCalled();
  expect(pollLipsync).not.toHaveBeenCalled();
});

test('first poll: the line gets its tail, ONE lip sync starts on Veo\'s clip with it, and the job waits', async () => {
  signed({ [VOICE]: 'https://s/voice.mp3' });
  expect(await deliverVoicedAvatar(CLIP, UUID)).toEqual({ state: 'pending' });
  expect(padVoiceTail).toHaveBeenCalledWith('https://s/voice.mp3', TAIL_SEC, { bucket: 'renders', path: TAILED });
  expect(startLipsync).toHaveBeenCalledWith({ videoUrl: CLIP, audioUrl: 'https://s/line-tail.wav', idempotencyKey: `myavatar-avatar-${UUID}`, model: 'lipsync-2-pro' });
  expect(JSON.parse(mockStore.get(`avatar:lipsync:${UUID}`)!)).toEqual({ id: 'gen-1', model: 'lipsync-2-pro', lineSec: 3.29 });
  // The next poll asks how it is doing; it never starts a second one.
  expect(await deliverVoicedAvatar(CLIP, UUID)).toEqual({ state: 'pending' });
  expect(startLipsync).toHaveBeenCalledTimes(1);
  expect(pollLipsync).toHaveBeenCalledWith('gen-1');
});

test('a poll that finds another one starting waits; a tail that failed sends the line as it is', async () => {
  signed({ [VOICE]: 'https://s/voice.mp3' });
  mockStore.set(`avatar:lipsync:${UUID}`, 'starting');
  expect(await deliverVoicedAvatar(CLIP, UUID)).toEqual({ state: 'pending' });
  expect(startLipsync).not.toHaveBeenCalled();
  mockStore.clear();
  (padVoiceTail as jest.Mock).mockResolvedValue(null);
  await deliverVoicedAvatar(CLIP, UUID);
  expect((startLipsync as jest.Mock).mock.calls[0][0].audioUrl).toBe('https://s/voice.mp3');
});

test('done: OUR line under sync.so\'s picture at the fixed path, ready, and its cost booked once', async () => {
  signed({ [VOICE]: 'https://s/voice.mp3', [TAILED]: 'https://s/line-tail.wav' });
  mockStore.set(`avatar:lipsync:${UUID}`, JSON.stringify({ id: 'gen-1', model: 'lipsync-2-pro', lineSec: 3.29 }));
  (pollLipsync as jest.Mock).mockResolvedValue({ state: 'done', url: 'https://cdn.sync.so/out.mp4', seconds: 3.29 });
  expect(await deliverVoicedAvatar(CLIP, UUID)).toEqual({ state: 'ready', url: 'https://s/voiced.mp4' });
  expect(laySyncedVoice).toHaveBeenCalledWith('https://cdn.sync.so/out.mp4', 'https://s/line-tail.wav', { bucket: 'renders', path: VOICED });
  expect((recordUsage as jest.Mock).mock.calls[0][0]).toMatchObject({ service: 'avatar', model: 'sync.so lipsync-2-pro', estimatedCost: syncCostUsd('lipsync-2-pro', 3.29) });
  // A second poll racing the first lays the file again (same path) but books nothing more.
  await deliverVoicedAvatar(CLIP, UUID);
  expect(recordUsage).toHaveBeenCalledTimes(1);
});

test('done but our side missed (no line to lay, the mux failed) → pending, nothing booked', async () => {
  mockStore.set(`avatar:lipsync:${UUID}`, JSON.stringify({ id: 'gen-1', model: 'lipsync-2-pro', lineSec: 3.29 }));
  (pollLipsync as jest.Mock).mockResolvedValue({ state: 'done', url: 'https://cdn.sync.so/out.mp4', seconds: 3.29 });
  signed({});
  expect(await deliverVoicedAvatar(CLIP, UUID)).toEqual({ state: 'pending' });
  signed({ [VOICE]: 'https://s/voice.mp3' });
  (laySyncedVoice as jest.Mock).mockResolvedValue(null);
  expect(await deliverVoicedAvatar(CLIP, UUID)).toEqual({ state: 'pending' });
  expect(recordUsage).not.toHaveBeenCalled();
});

test('a refusal a retry cannot change, at the start or later, is failed; an outage or a busy plan is pending and frees the claim', async () => {
  signed({ [VOICE]: 'https://s/voice.mp3' });
  (startLipsync as jest.Mock).mockResolvedValue({ ok: false, reason: 'refused', code: 'insufficient_credits' });
  expect(await deliverVoicedAvatar(CLIP, UUID)).toEqual({ state: 'failed', reason: 'sync.so insufficient_credits' });
  expect(mockStore.has(`avatar:lipsync:${UUID}`)).toBe(false);
  (startLipsync as jest.Mock).mockResolvedValue({ ok: false, reason: 'busy', code: 'concurrency_limit_reached' });
  expect(await deliverVoicedAvatar(CLIP, UUID)).toEqual({ state: 'pending' });
  expect(mockStore.has(`avatar:lipsync:${UUID}`)).toBe(false);
  mockStore.set(`avatar:lipsync:${UUID}`, JSON.stringify({ id: 'gen-1', model: 'lipsync-2-pro', lineSec: 3.29 }));
  (pollLipsync as jest.Mock).mockResolvedValue({ state: 'failed', code: 'generation_failed' });
  expect(await deliverVoicedAvatar(CLIP, UUID)).toEqual({ state: 'failed', reason: 'sync.so generation_failed' });
});

test('no line in storage → pending (the status route refunds at its cap), and the claim is freed', async () => {
  signed({});
  expect(await deliverVoicedAvatar(CLIP, UUID)).toEqual({ state: 'pending' });
  expect(startLipsync).not.toHaveBeenCalled();
  expect(mockStore.has(`avatar:lipsync:${UUID}`)).toBe(false);
});
