/** @jest-environment node */
/**
 * The live agent binding: Gemini-only brain + Google-grounded web_search under AI_GOOGLE_ONLY (the default),
 * the old chain + Tavily with the kill switch off, and no render tool (orchestrate_media queued orphaned, unbilled
 * generation_jobs rows). The one media tool, quote_montage_to_music, exists only for a request with files when media
 * execution is open to the user, and it only quotes. Every provider is mocked — no network, no spend.
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

const mockQuote = jest.fn();
jest.mock('../media/montageExec', () => ({ quoteMontage: (...a: unknown[]) => mockQuote(...a) }));
jest.mock('../media/montageLive', () => ({ liveMontageDeps: () => ({ live: true }) }));
const mockAudioQuote = jest.fn();
jest.mock('../media/audioExtract', () => ({ quoteAudioExtract: (...a: unknown[]) => mockAudioQuote(...a) }));
jest.mock('../media/audioLive', () => ({ liveAudioDeps: () => ({ liveAudio: true }) }));

import { buildLiveToolRegistry, runLiveAgent, AGENT_AUDIO_NOTE, AGENT_MEDIA_NOTE, AGENT_MONTAGE_NOTE, type AgentContext } from './bindLiveAgent';

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

test('without files the registry has no media tool, and no render tool ever', () => {
  const names = buildLiveToolRegistry(CTX).map((t) => t.name);
  expect(names).toEqual(['web_search', 'scrape_webpage', 'prepare_instagram_post']);
  expect(names).not.toContain('orchestrate_media');
  // Files alone are not enough: media execution must be open to this user (the route decides from the session).
  expect(buildLiveToolRegistry({ ...CTX, files: ['u/a.mp4'], media: false }).map((t) => t.name)).not.toContain('quote_montage_to_music');
  expect(buildLiveToolRegistry({ ...CTX, files: [], media: true }).map((t) => t.name)).not.toContain('quote_montage_to_music');
});

describe('quote_audio_from_link (Agent G audio extraction, quote only)', () => {
  const QUOTE = {
    ok: true,
    quote: { jobId: 'a-1', credits: 0, source: 'link', host: 'media.example.com', name: 'talk.mp3', bytes: 2_000_000, contentType: 'video/mp4', rights: { status: 'unverified' }, bitrateKbps: 192, maxSec: 3600, expiresAt: 9 },
    request: { source: { kind: 'link', url: 'https://media.example.com/talk.mp4' } },
    token: 'secret-token',
  };
  const on = (onAudioQuote = jest.fn()): AgentContext => ({ ...CTX, media: true, onAudioQuote });

  test('offered only when media execution is open to this user; no file needed', () => {
    expect(buildLiveToolRegistry(CTX).map((t) => t.name)).not.toContain('quote_audio_from_link');
    expect(buildLiveToolRegistry({ ...CTX, media: false }).map((t) => t.name)).not.toContain('quote_audio_from_link');
    expect(buildLiveToolRegistry(on()).map((t) => t.name)).toContain('quote_audio_from_link');
  });

  test('plans from the link; the model sees the plan and the rights, never the token; the card gets the signed plan', async () => {
    mockAudioQuote.mockResolvedValueOnce(QUOTE);
    const onAudioQuote = jest.fn();
    const t = buildLiveToolRegistry(on(onAudioQuote)).find((x) => x.name === 'quote_audio_from_link')!;
    const obs = await t.run({ url: ' https://media.example.com/talk.mp4 ', file: 'someone-else/x.mp4' });
    expect(mockAudioQuote).toHaveBeenCalledWith({ liveAudio: true }, { userId: CTX.userId, url: 'https://media.example.com/talk.mp4' });
    expect(obs).toMatchObject({ planned: true, extracted: false, credits: 0, host: 'media.example.com', name: 'talk.mp3', rights: 'unverified', format: 'MP3 192 kbps', maxMinutes: 60 });
    expect((obs as { next: string }).next).toMatch(/theirs or licensed/);
    expect(JSON.stringify(obs)).not.toMatch(/secret-token/);
    expect(onAudioQuote).toHaveBeenCalledWith(QUOTE);
  });

  test('a video platform comes back by name with the upload offer, and nothing reaches the card', async () => {
    mockAudioQuote.mockResolvedValueOnce({ ok: false, error: 'platform', message: 'Not from a video platform.', platform: 'YouTube' });
    const onAudioQuote = jest.fn();
    const t = buildLiveToolRegistry(on(onAudioQuote)).find((x) => x.name === 'quote_audio_from_link')!;
    await expect(t.run({ url: 'https://youtu.be/abc' })).resolves.toEqual({
      error: 'platform', message: 'Not from a video platform.', platform: 'YouTube', offer: expect.stringMatching(/upload their own or a licensed/),
    });
    expect(onAudioQuote).not.toHaveBeenCalled();
  });

  test('two plans per request, and a missing link is an observation', async () => {
    const t = buildLiveToolRegistry(on()).find((x) => x.name === 'quote_audio_from_link')!;
    await expect(t.run({})).resolves.toMatchObject({ error: 'invalid_input' });
    mockAudioQuote.mockResolvedValue(QUOTE);
    await t.run({ url: 'https://media.example.com/a.mp4' });
    await t.run({ url: 'https://media.example.com/b.mp4' });
    await expect(t.run({ url: 'https://media.example.com/c.mp4' })).resolves.toMatchObject({ error: 'call_limit' });
    expect(mockAudioQuote).toHaveBeenCalledTimes(2);
    mockAudioQuote.mockReset();
  });

  test('the system prompt carries the audio rule only when the tool is on', async () => {
    mockLlm.mockResolvedValueOnce('{"final":"ok"}').mockResolvedValueOnce('{"final":"ok"}');
    await runLiveAgent('take the mp3 out of this', on());
    await runLiveAgent('hello', CTX);
    expect(mockLlm.mock.calls[0][0].system).toContain(AGENT_AUDIO_NOTE);
    expect(mockLlm.mock.calls[1][0].system).not.toContain(AGENT_AUDIO_NOTE);
  });
});

describe('quote_montage_to_music (Agent G media execution, quote only)', () => {
  const QUOTE = {
    ok: true,
    quote: { jobId: 'j-1', credits: 0, totalSec: 30, shots: 10, clips: 3, aspect: '9:16', beatSynced: true, bpm: 120, musicStartSec: 0.2, unusedFiles: [2], expiresAt: 9 },
    request: { shots: [{ url: 'https://signed/a' }] },
    token: 'secret-token',
  };
  const media = (onMediaQuote = jest.fn()): AgentContext => ({ ...CTX, files: ['u/a.mp4', 'u/b.mp4', 'u/c.mp4', 'u/song.mp3'], media: true, onMediaQuote });

  test('quotes from the request files and the goal; the model sees the plan, never the token or the signed links', async () => {
    mockQuote.mockResolvedValueOnce(QUOTE);
    const onMediaQuote = jest.fn();
    const t = buildLiveToolRegistry(media(onMediaQuote), { goal: 'make a reel to this song' }).find((x) => x.name === 'quote_montage_to_music')!;
    const obs = await t.run({ aspect: '9:16', files: ['someone-else/x.mp4'] });
    expect(mockQuote).toHaveBeenCalledWith({ live: true }, {
      userId: CTX.userId, files: ['u/a.mp4', 'u/b.mp4', 'u/c.mp4', 'u/song.mp3'], prompt: 'make a reel to this song', aspect: '9:16', targetSec: undefined,
    });
    expect(obs).toEqual({
      planned: true, rendered: false, credits: 0, shots: 10, clips: 3, lengthSec: 30, aspect: '9:16', beatSynced: true, bpm: 120,
      unusedFiles: [3], next: 'The user confirms the plan on its card; nothing starts before that.',
    });
    expect(JSON.stringify(obs)).not.toMatch(/secret-token|signed/);
    expect(onMediaQuote).toHaveBeenCalledWith(QUOTE);
  });

  test('a refusal is an observation naming the files 1-based; nothing reaches the card', async () => {
    mockQuote.mockResolvedValueOnce({ ok: false, error: 'media_not_yours', message: 'File 2 is not yours.', files: [1] });
    const onMediaQuote = jest.fn();
    const t = buildLiveToolRegistry(media(onMediaQuote)).find((x) => x.name === 'quote_montage_to_music')!;
    await expect(t.run({})).resolves.toEqual({ error: 'media_not_yours', message: 'File 2 is not yours.', files: [2] });
    expect(onMediaQuote).not.toHaveBeenCalled();
  });

  test('at most two plans per request: each one decodes every file', async () => {
    mockQuote.mockResolvedValue(QUOTE);
    const t = buildLiveToolRegistry(media()).find((x) => x.name === 'quote_montage_to_music')!;
    await t.run({});
    await t.run({ aspect: '16:9' });
    await expect(t.run({})).resolves.toMatchObject({ error: 'call_limit' });
    expect(mockQuote).toHaveBeenCalledTimes(2);
    mockQuote.mockReset();
  });

  test('the model shapes the plan, never the files: a bad aspect or length is an observation and quotes nothing', async () => {
    const t = buildLiveToolRegistry(media()).find((x) => x.name === 'quote_montage_to_music')!;
    await expect(t.run({ aspect: '4:5' })).resolves.toMatchObject({ error: 'invalid_input' });
    await expect(t.run({ targetSec: 9_999 })).resolves.toMatchObject({ error: 'invalid_input' });
    expect(mockQuote).not.toHaveBeenCalled();
    mockQuote.mockResolvedValueOnce(QUOTE);
    await t.run({ targetSec: '30' }); // a number sent as text is read as the number
    expect(mockQuote.mock.calls[0][1]).toMatchObject({ targetSec: 30, files: ['u/a.mp4', 'u/b.mp4', 'u/c.mp4', 'u/song.mp3'] });
  });

  test('the system prompt says the plan starts only on Confirm when the tool is on', async () => {
    mockLlm.mockResolvedValueOnce('{"final":"ok"}');
    await runLiveAgent('cut these to the song', media());
    const system = mockLlm.mock.calls[0][0].system as string;
    expect(system).toContain(AGENT_MONTAGE_NOTE);
    expect(system).not.toContain(AGENT_MEDIA_NOTE);
  });
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
  await expect(tool('web_search').run({})).resolves.toMatchObject({ error: 'invalid_input' });
  await expect(tool('web_search').run({ query: '   ' })).resolves.toMatchObject({ error: 'invalid_input' });
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
