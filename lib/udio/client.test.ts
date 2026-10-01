/** @jest-environment node */
/**
 * lib/udio/client — the music panel's native controls reach the Udio gateway ONLY behind MUSIC_SUNO_PARAMS, which is
 * off by default (the field names are unconfirmed against the gateway; an unknown field could 4xx Udio out of the
 * failover chain). `fetch` is mocked: nothing leaves the process.
 */
import { startUdioGeneration } from './client';
import { udioParams } from '@/lib/ai/musicControls';

const ENV = { ...process.env };
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  process.env = { ...ENV, UDIO_API_KEY: 'test-key' };
  delete process.env.MUSIC_SUNO_PARAMS;
  // A fresh Response per call — a body can be read once.
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ data: { task_id: 'w1' } }), { status: 200 }));
});

afterEach(() => {
  jest.restoreAllMocks();
  process.env = { ...ENV };
});

const sentBody = (): Record<string, unknown> => JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
const CONTROLS = { vocalGender: 'female', styleWeight: 0.8, weirdnessConstraint: 0.25 } as const;

test('flag OFF (the default): the controls are not sent — the body is exactly what it always was', async () => {
  await startUdioGeneration({ prompt: 'a ballad', style: 'pop', controls: CONTROLS });
  const body = sentBody();
  expect(body).not.toHaveProperty('gender');
  expect(body).not.toHaveProperty('style_weight');
  expect(body).not.toHaveProperty('weirdness_constraint');
  fetchSpy.mockClear();
  await startUdioGeneration({ prompt: 'a ballad', style: 'pop' });
  expect(sentBody()).toEqual(body);
});

test('a falsy flag is still off', async () => {
  process.env.MUSIC_SUNO_PARAMS = '0';
  await startUdioGeneration({ prompt: 'a ballad', controls: CONTROLS });
  expect(sentBody()).not.toHaveProperty('style_weight');
});

test('flag ON: the singer as f / m and both sliders on 0–1', async () => {
  process.env.MUSIC_SUNO_PARAMS = '1';
  await startUdioGeneration({ prompt: 'a ballad', style: 'pop', controls: CONTROLS });
  expect(sentBody()).toMatchObject({ gender: 'f', style_weight: 0.8, weirdness_constraint: 0.25 });
});

test('flag ON, from the panel\'s own values: a male song at Weirdness 90, Style influence untouched', async () => {
  process.env.MUSIC_SUNO_PARAMS = '1';
  const controls = udioParams({ styles: ['rock'], vocalGender: 'male', weirdness: 90, styleInfluence: 50 }, { instrumental: false });
  await startUdioGeneration({ prompt: 'a road song', style: 'rock', controls });
  const body = sentBody();
  expect(body).toMatchObject({ gender: 'm', weirdness_constraint: 0.9 });
  expect(body).not.toHaveProperty('style_weight'); // 50 sends nothing: the gateway keeps its default
});

test('flag ON: an instrumental never carries a singer; junk values are clamped or dropped', async () => {
  process.env.MUSIC_SUNO_PARAMS = 'on';
  await startUdioGeneration({ prompt: 'rain', makeInstrumental: true, controls: { vocalGender: 'male', styleWeight: 7, weirdnessConstraint: Number.NaN } });
  const body = sentBody();
  expect(body).not.toHaveProperty('gender');
  expect(body.style_weight).toBe(1);
  expect(body).not.toHaveProperty('weirdness_constraint');
});
