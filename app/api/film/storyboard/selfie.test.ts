/** @jest-environment node */
/**
 * POST /api/film/storyboard with ONE uploaded photo — how the photo is used.
 *
 * ⚠️ The advert brief of 2026-10-15 16:49Z: a selfie taken in a T-shirt on a street at night, for a film whose brief puts
 * the actor in a black T-shirt and a black jacket on a black background. Three things used to carry the photo's own scene
 * into the film: scene 1 WAS the raw photo (every clip starts from its scene's frame), the other frames were drawn with
 * "identical … wardrobe as the reference", and the vision description of the person (the film's character lock) also
 * described the photo's setting. What must hold:
 *   • a brief that restages the person → scene 1 is drawn like the others (no raw photo), the face still locked;
 *   • a brief that only animates the person, or an unknown answer → the photo stays scene 1, as before;
 *   • every frame locks the face, and takes the clothing and the background from the shot, never from the photo;
 *   • the vision description is asked with the brief (its clothing wins over the photo's).
 */
jest.mock('server-only', () => ({}));

jest.mock('../../../../lib/supabase/server', () => ({ authedClientFromRequest: jest.fn(async () => ({ user: { id: 'user-1' } })) }));
jest.mock('../../../../lib/api/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => null),
  RATE_LIMITS: { STORYBOARD: { windowMs: 60_000, max: 30 }, AI: { windowMs: 60_000, max: 30 }, EXPENSIVE: { windowMs: 60_000, max: 5 } },
}));
jest.mock('../../../../lib/ai/llmText', () => ({ llmText: jest.fn(async () => null) }));
jest.mock('../../../../lib/ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));
jest.mock('../../../../lib/ai/geminiImage', () => ({
  generateGeminiImage: jest.fn(async () => ({ base64: Buffer.alloc(8, 1).toString('base64'), mimeType: 'image/jpeg' })),
}));
jest.mock('../../../../lib/gemini/image-analysis', () => ({ describeCharacterFromImage: jest.fn(async () => null) }));
jest.mock('../../../../lib/chat/promptAgent', () => ({ runPromptAgent: jest.fn(async () => null), promptAgentModel: () => 'gemini-test-flash' }));
jest.mock('../../../../lib/chat/ServiceManager', () => ({
  ServiceManager: jest.fn().mockImplementation(() => ({ execute: jest.fn(), poll: jest.fn() })),
}));
jest.mock('../../../../lib/orchestrator/storage-adapter', () => ({
  uploadAndSign: jest.fn(async (_bucket: string, path: string) => `https://x.supabase.co/signed/${path}`),
}));
jest.mock('../../../../lib/replicate/client', () => ({ createPrediction: jest.fn(), pollPrediction: jest.fn() }));
jest.mock('../../../../lib/services/billing/guardedCall', () => ({
  BudgetExceededError: class BudgetExceededError extends Error {},
  guardedCall: jest.fn(async (_o: unknown, fn: () => Promise<unknown>) => fn()),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';
import { llmText } from '../../../../lib/ai/llmText';
import { generateGeminiImage } from '../../../../lib/ai/geminiImage';
import { describeCharacterFromImage } from '../../../../lib/gemini/image-analysis';
import { MUSIC_VIDEO_PERSON_CLAUSE, REFERENCE_PERSON_CLAUSE } from '../../../../lib/chat/storyPerson';

const AD_BRIEF = 'შექმენი 9:16 ფორმატის სარეკლამო ვიდეო სადაც მსახიობი შავ ფონზე შავ მაისურში და შავ პიჯაკში ლაპარაკობს, პრეზენტაციას აკეთებს';
const ANIMATE_ONLY = 'He smiles at the camera and waves.';
const photo = (n: number) => `data:image/jpeg;base64,${Buffer.alloc(64, n).toString('base64')}`;

function post(body: Record<string, unknown>): NextRequest {
  return new NextRequest('https://myavatar.ge/api/film/storyboard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orientation: 'vertical', locale: 'ka', sceneCount: 2, ...body }),
  });
}

const llm = llmText as jest.MockedFunction<typeof llmText>;
const restageAsks = () => llm.mock.calls.filter((c) => /"restage"/.test(String(c[0].system)));
let fetchSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.VIDEO_GOOGLE_ONLY; // default on → the Gemini image path, the one Production uses
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  fetchSpy.mockRestore();
  logSpy.mockRestore();
});

type PlanScene = { ordinal: number; frameUrl: string | null; anchored: boolean };

describe('planOnly with one photo: is the photo itself scene 1?', () => {
  it('the advert brief restages the actor → scene 1 is drawn, not the raw selfie', async () => {
    llm.mockResolvedValueOnce('{"restage": true}');
    const body = await (await POST(post({ prompt: AD_BRIEF, planOnly: true, referenceImages: [photo(7)] }))).json();
    expect(body.success).toBe(true);
    const scenes = body.scenes as PlanScene[];
    expect(scenes).toHaveLength(2);
    expect(scenes.every((s) => s.frameUrl === null && s.anchored === false)).toBe(true);
    // The photo still travels as the identity reference for every frame call.
    expect(body.hostedRefs).toEqual([expect.stringMatching(/^https:\/\/x\.supabase\.co\/signed\/storyboard-ref\//)]);
    expect(restageAsks()).toHaveLength(1);
    expect(restageAsks()[0]![0]).toMatchObject({ json: true, temperature: 0 });
    expect(restageAsks()[0]![0].user).toContain('შავ ფონზე');
  });

  it.each([
    ['a brief that only animates the person', '{"restage": false}'],
    ['Gemini missed (null)', null],
    ['an unreadable answer', 'it depends'],
  ])('%s → the photo stays scene 1, locked (a flaky classifier never drops the user\'s photo)', async (_label, answer) => {
    llm.mockResolvedValueOnce(answer as string | null);
    const body = await (await POST(post({ prompt: ANIMATE_ONLY, planOnly: true, referenceImages: [photo(7)] }))).json();
    const scenes = body.scenes as PlanScene[];
    expect(scenes[0]).toMatchObject({ frameUrl: body.hostedRefs[0], anchored: true });
    expect(scenes[1]).toMatchObject({ frameUrl: null, anchored: false });
  });

  it('two photos are per-scene anchors and no photo has nothing to lock: neither asks the classifier', async () => {
    const two = await (await POST(post({ prompt: AD_BRIEF, planOnly: true, referenceImages: [photo(7), photo(8)] }))).json();
    expect((two.scenes as PlanScene[]).every((s) => s.anchored && s.frameUrl)).toBe(true);
    const none = await (await POST(post({ prompt: AD_BRIEF, planOnly: true }))).json();
    expect((none.scenes as PlanScene[]).every((s) => s.frameUrl === null)).toBe(true);
    expect(restageAsks()).toHaveLength(0);
  });
});

describe('a frame with the photo locks the face, not the photo\'s clothes or place', () => {
  it('the frame prompt carries the person-only clause and the photo as the reference', async () => {
    const res = await POST(post({ prompt: AD_BRIEF, sceneOrdinal: 1, scenePrompt: 'The actor in a black T-shirt and a black jacket on a plain black background, presenting to camera.', referenceImages: [photo(7)] }));
    const body = await res.json();
    expect(body).toMatchObject({ success: true, ordinal: 1 });
    expect(generateGeminiImage).toHaveBeenCalledTimes(1);
    const call = (generateGeminiImage as jest.Mock).mock.calls[0][0] as { prompt: string; referenceImages: string[] };
    expect(call.prompt).toContain(REFERENCE_PERSON_CLAUSE);
    expect(call.prompt).toContain('black jacket on a plain black background');
    expect(call.prompt).not.toMatch(/wardrobe as the reference/);
    expect(call.referenceImages).toEqual([expect.stringMatching(/^https:\/\/x\.supabase\.co\/signed\/storyboard-ref\//)]);
  });

  it('a MUSIC VIDEO frame keeps the reference\'s outfit in every shot (Production 2026-10-16: a new outfit per scene)', async () => {
    const res = await POST(post({ prompt: 'a rapper on a neon street', musicVideoMode: true, sceneOrdinal: 1, scenePrompt: 'The rapper on a rainy neon street, singing into a microphone.', referenceImages: [photo(8)] }));
    expect(await res.json()).toMatchObject({ success: true, ordinal: 1 });
    const call = (generateGeminiImage as jest.Mock).mock.calls[0][0] as { prompt: string };
    expect(call.prompt).toContain(MUSIC_VIDEO_PERSON_CLAUSE);
    expect(call.prompt).not.toContain(REFERENCE_PERSON_CLAUSE);
    expect(MUSIC_VIDEO_PERSON_CLAUSE).toMatch(/SAME outfit and accessories as in the reference image/);
  });

  it('the clause itself: face locked; clothing, background and light from the shot', () => {
    expect(REFERENCE_PERSON_CLAUSE).toMatch(/identical face, hair, skin tone and facial features/);
    expect(REFERENCE_PERSON_CLAUSE).toMatch(/wears the clothing this shot describes/);
    expect(REFERENCE_PERSON_CLAUSE).toMatch(/background, location and lighting are the ones this shot describes, not the reference photo's/);
  });
});

describe('scriptsOnly with one photo: the vision description is asked with the brief', () => {
  it('describeCharacterFromImage gets the brief, so its clothing wins over the photo\'s', async () => {
    await POST(post({ prompt: AD_BRIEF, scriptsOnly: true, referenceImages: [photo(7)] }));
    expect(describeCharacterFromImage).toHaveBeenCalledTimes(1);
    const [url, locale, brief] = (describeCharacterFromImage as jest.Mock).mock.calls[0];
    expect(url).toMatch(/^https:\/\/x\.supabase\.co\/signed\/storyboard-ref\//);
    expect(locale).toBe('ka');
    expect(brief).toBe(AD_BRIEF);
  });
});
