/** @jest-environment node */
/**
 * handleFilmComposite — a render's `metadata.templateId` becomes the film look (→ planFilmScenes) and the director
 * note (→ the Prompt Agent), resolved SERVER-SIDE (lib/studio/templateContext) against THIS render's style, mode and
 * length — the same resolver the storyboard route runs, so the approved board and the paid film share one look.
 *
 * Driven for real up to the scene plan: the plan call is captured and then stopped with a sentinel, so no clip is
 * dispatched, nothing is debited and no provider runs. The Prompt Agent (the director) is mocked and returns nothing,
 * which is its fail-open path.
 */
jest.mock('server-only', () => ({}));

jest.mock('../supabase/server', () => ({ createServiceRoleClient: jest.fn(() => null), authedClientFromRequest: jest.fn() }));
jest.mock('../veo/policy', () => ({ isGoogleOnly: jest.fn(() => true) }));
jest.mock('../veo/engine', () => ({ veoTransport: jest.fn(() => 'gemini') }));
jest.mock('../ai/promptToEnglish', () => ({ promptToEnglish: jest.fn(async (p: string) => p) }));
jest.mock('../orchestrator/storage-adapter', () => ({ uploadAndSign: jest.fn(async () => null) }));
jest.mock('./ServiceManager', () => ({ ServiceManager: jest.fn().mockImplementation(() => ({ execute: jest.fn(), poll: jest.fn() })) }));
jest.mock('./promptAgent', () => ({ runPromptAgent: jest.fn(async () => null) }));
jest.mock('./filmPipeline', () => {
  const actual = jest.requireActual('./filmPipeline');
  return {
    ...actual,
    // Record what the composite planned with, then stop the render before anything is dispatched.
    planFilmScenes: jest.fn(() => { throw new Error('plan captured by the test'); }),
  };
});

import { handleFilmComposite } from './filmComposite';
import { planFilmScenes, type FilmPlanOptions } from './filmPipeline';
import { runPromptAgent } from './promptAgent';
import type { OrchestratorInput } from './providerRouter';
import { resolveFilmTemplate } from '../studio/templateContext';

const NOIR = resolveFilmTemplate({ templateId: 'noir', style: 'Noir', musicVideoMode: false })!;
const TEASER = resolveFilmTemplate({ templateId: 'teaser', style: 'Cinematic', musicVideoMode: false })!;

const input = (metadata: Record<string, unknown>): OrchestratorInput => ({
  message: 'A detective waits for an informant on a rain-soaked pier at midnight',
  serviceContext: 'video', agentId: '', userId: 'user-1', sessionId: 's-1', locale: 'en', history: [],
  metadata: { orientation: 'landscape', ...metadata },
});

let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network is not allowed in this test'));
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

/** Run the composite to its plan call; return the plan options and what the director was asked (if it ran). */
async function plannedWith(metadata: Record<string, unknown>): Promise<{ plan: FilmPlanOptions; director: Record<string, unknown> | null }> {
  await expect(handleFilmComposite(input(metadata))).rejects.toThrow('plan captured by the test');
  expect(planFilmScenes).toHaveBeenCalledTimes(1);
  expect(fetchSpy).not.toHaveBeenCalled();
  const director = (runPromptAgent as jest.Mock).mock.calls[0]?.[0] ?? null;
  return { plan: (planFilmScenes as jest.Mock).mock.calls[0][1] as FilmPlanOptions, director };
}

test('the Noir card: its look goes to the plan and its director note to the Prompt Agent', async () => {
  const { plan, director } = await plannedWith({ templateId: 'noir', style: 'Noir', sceneCount: 3, clipSec: 8 });
  expect(plan.look).toBe(NOIR.look);
  expect(plan.style).toBe('Noir');
  expect(director?.templateNote).toBe(NOIR.directorNote);
});

test('no templateId → no look and no note: the film is planned exactly as before templates', async () => {
  const { plan, director } = await plannedWith({ style: 'Noir', sceneCount: 3, clipSec: 8 });
  expect(plan).not.toHaveProperty('look');
  expect(director).not.toHaveProperty('templateNote');
});

test('a stale id (the style changed after the board) adds nothing', async () => {
  const { plan, director } = await plannedWith({ templateId: 'noir', style: 'Cinematic', sceneCount: 3, clipSec: 8 });
  expect(plan).not.toHaveProperty('look');
  expect(director).not.toHaveProperty('templateNote');
});

test('the length is checked: the Teaser\'s id on a 24 s render is borrowed, on an 8 s render it is the Teaser', async () => {
  const borrowed = await plannedWith({ templateId: 'teaser', style: 'Cinematic', sceneCount: 3, clipSec: 8 });
  expect(borrowed.plan).not.toHaveProperty('look');
  jest.clearAllMocks();
  const own = await plannedWith({ templateId: 'teaser', style: 'Cinematic', sceneCount: 1, clipSec: 8 });
  expect(own.plan.look).toBe(TEASER.look);
});

test('a script\'s own cadence keeps the card: 4 scenes × 6 s is still a 24 s (Noir) film', async () => {
  const { plan } = await plannedWith({ templateId: 'noir', style: 'Noir', sceneCount: 4, clipSec: 6 });
  expect(plan.look).toBe(NOIR.look);
});

test('approved scenes skip the director, and the look still reaches every clip prompt\'s plan', async () => {
  const { plan, director } = await plannedWith({
    templateId: 'noir', style: 'Noir', sceneCount: 3, clipSec: 8,
    sceneScripts: ['The detective lights a cigarette', 'A car pulls up in the rain', 'The informant hands over an envelope'],
    characterLock: 'a man in his forties in a grey trench coat and fedora',
  });
  expect(director).toBeNull();
  expect(plan.look).toBe(NOIR.look);
});
