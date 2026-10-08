/** @jest-environment node */
/**
 * lib/udio/client — Udio is retired by the MyAvatar v32 provider policy (lib/providers/policy: music is Google-only).
 * The client stays only so old call sites compile; every entry point must refuse with the typed `provider_deprecated`
 * error BEFORE a key is read or a request leaves the process — whatever the MUSIC_SUNO_PARAMS flag, the panel's
 * controls, or a provisioned Udio key say. `fetch` is spied: any call fails the test.
 */
import { getUdioGenerationStatus, startUdioGeneration } from './client';
import { udioParams } from '@/lib/ai/musicControls';

const ENV = { ...process.env };
const DEPRECATED = { name: 'ProviderPolicyError', code: 'provider_deprecated' };
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  // A legacy key in every place the old client looked: the policy, not a missing key, is what stops it.
  process.env = { ...ENV, UDIO_API_KEY: 'test-key' };
  delete process.env.MUSIC_SUNO_PARAMS;
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ data: { task_id: 'w1' } }), { status: 200 }));
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  jest.restoreAllMocks();
  process.env = { ...ENV };
});

const CONTROLS = { vocalGender: 'female', styleWeight: 0.8, weirdnessConstraint: 0.25 } as const;

test('flag OFF (the default): a start is refused as provider_deprecated, with or without controls — nothing is sent', async () => {
  await expect(startUdioGeneration({ prompt: 'a ballad', style: 'pop', controls: CONTROLS })).rejects.toMatchObject(DEPRECATED);
  await expect(startUdioGeneration({ prompt: 'a ballad', style: 'pop' })).rejects.toMatchObject(DEPRECATED);
});

test.each(['0', '1', 'on'])('MUSIC_SUNO_PARAMS=%s cannot re-open Udio', async (flag) => {
  process.env.MUSIC_SUNO_PARAMS = flag;
  await expect(startUdioGeneration({ prompt: 'a ballad', controls: CONTROLS })).rejects.toMatchObject(DEPRECATED);
});

test('the panel\'s own values (a male song at Weirdness 90) and an instrumental are refused the same way', async () => {
  process.env.MUSIC_SUNO_PARAMS = '1';
  const controls = udioParams({ styles: ['rock'], vocalGender: 'male', weirdness: 90, styleInfluence: 50 }, { instrumental: false });
  await expect(startUdioGeneration({ prompt: 'a road song', style: 'rock', controls })).rejects.toMatchObject(DEPRECATED);
  await expect(startUdioGeneration({ prompt: 'rain', makeInstrumental: true, controls: { vocalGender: 'male', styleWeight: 7, weirdnessConstraint: Number.NaN } }))
    .rejects.toMatchObject(DEPRECATED);
});

test('a status poll for an old Udio work id is refused too — no feed request', async () => {
  await expect(getUdioGenerationStatus('work-123')).rejects.toMatchObject(DEPRECATED);
});
