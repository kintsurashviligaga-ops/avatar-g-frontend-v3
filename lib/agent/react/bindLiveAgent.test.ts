/** @jest-environment node */
/**
 * The live agent binding: Gemini-only brain + Google-grounded web_search under AI_GOOGLE_ONLY (the default),
 * the old chain + Tavily with the kill switch off, and NO media tool (orchestrate_media queued orphaned,
 * unbilled generation_jobs rows). Every provider is mocked — no network, no spend.
 */
jest.mock('server-only', () => ({}));

const mockLlm = jest.fn();
jest.mock('../../ai/llmText', () => ({ llmText: (...a: unknown[]) => mockLlm(...a) }));
const mockGrounded = jest.fn();
jest.mock('../tools/googleSearch', () => ({ groundedWebSearch: (...a: unknown[]) => mockGrounded(...a) }));
const mockTavily = jest.fn();
jest.mock('../../ai/webSearch', () => ({ webSearch: (...a: unknown[]) => mockTavily(...a) }));
jest.mock('../tools/scrapeWebpage', () => ({ scrapeWebpage: jest.fn(async () => ({ text: 'page' })) }));
const mockStartJob = jest.fn(async () => 'job-1');
jest.mock('../../ads/adRenderJob', () => ({ startAdRenderJob: (...a: unknown[]) => (mockStartJob as (...x: unknown[]) => Promise<string>)(...a) }));

import { buildLiveToolRegistry, runLiveAgent, AGENT_MEDIA_NOTE } from './bindLiveAgent';

const CTX = { userId: '11111111-2222-4333-8444-555555555555' };
const ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.AI_GOOGLE_ONLY;
});
afterEach(() => {
  process.env = { ...ENV };
});

const tool = (name: string) => {
  const t = buildLiveToolRegistry(CTX).find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t;
};

test('the registry has no media/render tool', () => {
  const names = buildLiveToolRegistry(CTX).map((t) => t.name);
  expect(names).toEqual(['web_search', 'scrape_webpage', 'prepare_instagram_post']);
  expect(names).not.toContain('orchestrate_media');
});

test('Google-only (default): the brain is llmText with googleOnly, and the system prompt says renders happen in the Studio', async () => {
  mockLlm.mockResolvedValueOnce('{"thought":"done","final":"ok"}');
  const r = await runLiveAgent('hello', CTX, { systemExtra: 'PERSONA X' });
  expect(r).toMatchObject({ answer: 'ok', stopReason: 'final' });
  const opts = mockLlm.mock.calls[0][0];
  expect(opts.googleOnly).toBe(true);
  expect(opts.system).toContain(AGENT_MEDIA_NOTE);
  expect(opts.system).toContain('PERSONA X');
  expect(opts.system).not.toContain('orchestrate_media');
});

test('kill switch AI_GOOGLE_ONLY=0: the old multi-vendor chain (googleOnly false)', async () => {
  process.env.AI_GOOGLE_ONLY = '0';
  mockLlm.mockResolvedValueOnce('{"final":"ok"}');
  await runLiveAgent('hello', CTX);
  expect(mockLlm.mock.calls[0][0].googleOnly).toBe(false);
});

test('Google-only web_search is Gemini grounding, attributed to the user; Tavily is never called', async () => {
  mockGrounded.mockResolvedValueOnce({ ok: true, answer: 'A', results: [{ title: 't', url: 'https://x.test/', content: '' }], model: 'gemini-3.8-flash' });
  await expect(tool('web_search').run({ query: ' latest news ' })).resolves.toEqual({
    answer: 'A',
    results: [{ title: 't', url: 'https://x.test/', content: '' }],
  });
  expect(mockGrounded).toHaveBeenCalledWith('latest news', { userId: CTX.userId, maxResults: 5 });
  expect(mockTavily).not.toHaveBeenCalled();
});

test('a grounding failure becomes an error observation that names the cause', async () => {
  mockGrounded.mockResolvedValueOnce({ ok: false, code: 'quota' });
  await expect(tool('web_search').run({ query: 'q' })).resolves.toEqual({ error: 'search unavailable (quota)' });
});

test('kill switch off: web_search stays on Tavily', async () => {
  process.env.AI_GOOGLE_ONLY = 'off';
  mockTavily.mockResolvedValueOnce({ answer: 'T', results: [] });
  await expect(tool('web_search').run({ query: 'q' })).resolves.toEqual({ answer: 'T', results: [] });
  expect(mockGrounded).not.toHaveBeenCalled();
});

test('an empty query never reaches a provider', async () => {
  await expect(tool('web_search').run({})).resolves.toEqual({ error: 'query required' });
  expect(mockGrounded).not.toHaveBeenCalled();
  expect(mockTavily).not.toHaveBeenCalled();
});

test('a model that still asks for orchestrate_media gets an unknown-tool observation, and no job is queued', async () => {
  mockLlm
    .mockResolvedValueOnce('{"thought":"render it","action":{"tool":"orchestrate_media","input":{"hook":"x"}}}')
    .mockResolvedValueOnce('{"final":"Use the Studio."}');
  const r = await runLiveAgent('make an ad video', CTX);
  expect(r.stopReason).toBe('final');
  expect(r.steps[0]?.observation).toMatchObject({ error: 'unknown tool: orchestrate_media' });
  expect(mockStartJob).not.toHaveBeenCalled();
});
