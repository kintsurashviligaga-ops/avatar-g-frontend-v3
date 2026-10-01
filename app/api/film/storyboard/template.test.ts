/** @jest-environment node */
/**
 * POST /api/film/storyboard — a template card's film look and director note, resolved SERVER-SIDE from its id
 * (lib/studio/templateContext), reach the board the user approves.
 *
 * Pinned through the paths that spend nothing real here: planOnly (the deterministic plan the board opens on, whose
 * `framePrompt` the browser later sends back for each frame), scriptsOnly (the director call, mocked) and the
 * per-scene frame call (the Gemini image call, mocked, returns nothing). Every provider module is mocked; any fetch
 * fails the test.
 *
 * ⚠️ THE FRAME CUT. The board returns each scene's full prompt as `framePrompt`, the studio returns it as
 * `scenePrompt` on the frame call, and the route cuts that to 600 characters. The look sits in the style guide near
 * character 500, so the cut used to drop it: the frames lost the look the clips kept.
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { STORYBOARD: { windowMs: 60_000, max: 30 }, AI: { windowMs: 60_000, max: 30 }, EXPENSIVE: { windowMs: 60_000, max: 5 } },
}));
jest.mock('../../../../lib/veo/policy', () => ({ isGoogleOnly: jest.fn(() => true) }));
jest.mock('../../../../lib/ai/llmText', () => ({ llmText: jest.fn(async () => null) }));
jest.mock('../../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));
jest.mock('../../../../lib/ai/geminiImage', () => ({ generateGeminiImage: jest.fn(async () => null) }));
jest.mock('../../../../lib/gemini/image-analysis', () => ({ describeCharacterFromImage: jest.fn(async () => null) }));
jest.mock('../../../../lib/chat/promptAgent', () => ({ runPromptAgent: jest.fn(async () => null) }));
jest.mock('../../../../lib/chat/ServiceManager', () => ({
  ServiceManager: jest.fn().mockImplementation(() => ({ execute: jest.fn(), poll: jest.fn() })),
}));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => 'https://x.supabase.co/signed/ref.jpg') }));
jest.mock('../../../../lib/replicate/client', () => ({ createPrediction: jest.fn(), pollPrediction: jest.fn() }));
jest.mock('../../../../lib/services/billing/guardedCall', () => ({
  BudgetExceededError: class BudgetExceededError extends Error {},
  guardedCall: jest.fn(async (_o: unknown, fn: () => Promise<unknown>) => fn()),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { runPromptAgent } from '../../../../lib/chat/promptAgent';
import { generateGeminiImage } from '../../../../lib/ai/geminiImage';
import { resolveFilmTemplate } from '../../../../lib/studio/templateContext';

const post = (body: Record<string, unknown>): NextRequest =>
  new NextRequest('https://myavatar.ge/api/film/storyboard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const BRIEF = 'A detective waits for an informant on a rain-soaked pier at midnight';
const NOIR = resolveFilmTemplate({ templateId: 'noir', style: 'Noir', musicVideoMode: false })!;
const REEL = resolveFilmTemplate({ templateId: 'reel', style: 'Cinematic', musicVideoMode: false })!;
const TEASER = resolveFilmTemplate({ templateId: 'teaser', style: 'Cinematic', musicVideoMode: false })!;

let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
});
afterEach(() => fetchSpy.mockRestore());

/** The board's scenes, as the planOnly call returns them to the studio. */
async function plan(extra: Record<string, unknown>): Promise<Array<{ framePrompt: string }>> {
  const res = await POST(post({ prompt: BRIEF, planOnly: true, locale: 'en', ...extra }));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { scenes: Array<{ framePrompt: string }> };
  expect(body.scenes.length).toBeGreaterThan(0);
  return body.scenes;
}

/** The prompt the frame provider was handed for one per-scene frame call. */
async function frame(extra: Record<string, unknown>): Promise<string> {
  const res = await POST(post({ prompt: BRIEF, locale: 'en', sceneOrdinal: 1, ...extra }));
  expect(res.status).toBe(200);
  expect(generateGeminiImage).toHaveBeenCalledTimes(1);
  return (generateGeminiImage as jest.Mock).mock.calls[0][0].prompt as string;
}

describe('planOnly — the board is planned with the picked card\'s look', () => {
  test('the Noir card puts its look in every scene\'s frame prompt, in place of "Noir aesthetic"', async () => {
    const scenes = await plan({ style: 'Noir', templateId: 'noir', sceneCount: 3 });
    for (const s of scenes) {
      expect(s.framePrompt).toContain(NOIR.look);
      expect(s.framePrompt).not.toContain('Noir aesthetic');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('a mismatched id (Noir sent with style Cinematic) adds nothing', async () => {
    for (const s of await plan({ style: 'Cinematic', templateId: 'noir', sceneCount: 3 })) {
      expect(s.framePrompt).not.toContain(NOIR.look);
      expect(s.framePrompt).toContain('Cinematic aesthetic');
    }
  });

  test('no templateId: the board is exactly what the style alone gives', async () => {
    const withNone = await plan({ style: 'Noir', sceneCount: 3 });
    for (const s of withNone) expect(s.framePrompt).toContain('Noir aesthetic');
  });

  test('the length decides between the Reel and the Teaser: a borrowed id adds nothing', async () => {
    // A 24 s board (3 scenes) is the Reel; the Teaser's id on it is borrowed.
    for (const s of await plan({ style: 'Cinematic', templateId: 'teaser', sceneCount: 3 })) expect(s.framePrompt).not.toContain(TEASER.look);
    for (const s of await plan({ style: 'Cinematic', templateId: 'reel', sceneCount: 3 })) expect(s.framePrompt).toContain(REEL.look);
    // An 8 s board (1 scene) is the Teaser.
    for (const s of await plan({ style: 'Cinematic', templateId: 'teaser', sceneCount: 1 })) expect(s.framePrompt).toContain(TEASER.look);
    for (const s of await plan({ style: 'Cinematic', templateId: 'reel', sceneCount: 1 })) expect(s.framePrompt).not.toContain(REEL.look);
  });
});

describe('scriptsOnly — the director gets the card\'s note', () => {
  test('a matching card passes its director note as templateNote', async () => {
    await POST(post({ prompt: BRIEF, scriptsOnly: true, locale: 'en', style: 'Noir', templateId: 'noir', sceneCount: 3 }));
    expect((runPromptAgent as jest.Mock).mock.calls[0][0].templateNote).toBe(NOIR.directorNote);
  });

  test('a stale card (the style changed) passes none', async () => {
    await POST(post({ prompt: BRIEF, scriptsOnly: true, locale: 'en', style: 'Vintage', templateId: 'noir', sceneCount: 3 }));
    expect((runPromptAgent as jest.Mock).mock.calls[0][0]).not.toHaveProperty('templateNote');
  });
});

describe('per-scene frames keep the look although the studio\'s scene prompt is cut to 600 characters', () => {
  test('the board\'s own frame prompt, sent back as the studio sends it, would lose the look to the cut', async () => {
    const [scene] = await plan({ style: 'Noir', templateId: 'noir', sceneCount: 3 });
    const at = scene!.framePrompt.indexOf(NOIR.look);
    expect(at).toBeGreaterThan(0);
    expect(at + NOIR.look.length).toBeGreaterThan(600); // so the look cannot survive `.slice(0, 600)` whole
  });

  test('…so the frame call puts the resolved look at the head of the frame prompt', async () => {
    const [scene] = await plan({ style: 'Noir', templateId: 'noir', sceneCount: 3 });
    jest.clearAllMocks();
    // The studio's frame call: no sceneCount, the board's framePrompt as scenePrompt, the picked card's id.
    const prompt = await frame({ style: 'Noir', templateId: 'noir', scenePrompt: scene!.framePrompt });
    expect(prompt.indexOf(NOIR.look)).toBeGreaterThanOrEqual(0);
    expect(prompt.indexOf(NOIR.look)).toBeLessThan(80);
  });

  test('a user-edited scene prompt gets the look too', async () => {
    const prompt = await frame({ style: 'Noir', templateId: 'noir', scenePrompt: 'The informant steps out of the fog' });
    expect(prompt).toContain(NOIR.look);
    expect(prompt).toContain('The informant steps out of the fog');
  });

  test('without a card, or with a mismatched one, the frame prompt carries no look', async () => {
    expect(await frame({ style: 'Noir', scenePrompt: 'The informant steps out of the fog' })).not.toContain(NOIR.look);
    jest.clearAllMocks();
    expect(await frame({ style: 'Cinematic', templateId: 'noir', scenePrompt: 'The informant steps out of the fog' })).not.toContain(NOIR.look);
  });

  test('the planned scene prompt (no client text) already holds the look once, and is not given a second copy', async () => {
    const prompt = await frame({ style: 'Noir', templateId: 'noir' });
    expect(prompt.split(NOIR.look).length - 1).toBe(1);
  });
});
