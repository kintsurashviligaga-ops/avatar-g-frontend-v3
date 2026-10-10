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
const mockEditQuote = jest.fn();
jest.mock('../media/editExec', () => ({ quoteEdit: (...a: unknown[]) => mockEditQuote(...a) }));
jest.mock('../media/editLive', () => ({ liveEditDeps: () => ({ liveEdit: true }) }));
const mockAnalyze = jest.fn();
jest.mock('../media/analyzeExec', () => ({ analyzeMedia: (...a: unknown[]) => mockAnalyze(...a) }));
jest.mock('../media/analyzeLive', () => ({ liveAnalyzeDeps: () => ({ liveAnalyze: true }) }));

import { buildLiveToolRegistry, runLiveAgent, AGENT_ANALYZE_NOTE, AGENT_AUDIO_NOTE, AGENT_EDIT_NOTE, AGENT_MEDIA_NOTE, AGENT_MONTAGE_NOTE, MAX_ANALYSES_PER_RUN, type AgentContext } from './bindLiveAgent';

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

describe('quote_media_edit (Agent G edit of an attached video, quote only)', () => {
  const FILES = ['omni-uploads/u/a.mp4', 'omni-uploads/u/b.mp4'];
  const QUOTE = {
    ok: true,
    quote: { jobId: 'e-1', credits: 0, name: 'b-edit.mp4', edits: [{ op: 'aspect', to: '9:16', fit: 'crop' }], plan: { sourceSec: 30, output: 'mp4', durationSec: 30, hasAudio: true, width: 1080, height: 1920, copyVideo: false }, expiresAt: 9 },
    request: { v: 1 },
    token: 'secret-token',
  };
  const on = (onEditQuote?: AgentContext['onEditQuote']) => ({ ...CTX, media: true, files: FILES, ...(onEditQuote ? { onEditQuote } : {}) });
  const editTool = (ctx: AgentContext) => buildLiveToolRegistry(ctx).find((x) => x.name === 'quote_media_edit');

  test('offered only with an attached file and media execution open', () => {
    expect(editTool(CTX)).toBeUndefined();
    expect(editTool({ ...CTX, media: true })).toBeUndefined();
    expect(editTool({ ...CTX, media: false, files: FILES })).toBeUndefined();
    expect(editTool(on())).toBeDefined();
  });

  test('the model names the file by number and the edits by typed fields; the plan goes to the card, never the token', async () => {
    mockEditQuote.mockResolvedValueOnce(QUOTE);
    const onEditQuote = jest.fn();
    const out = JSON.stringify(await editTool(on(onEditQuote))!.run({ file: 2, edits: [{ op: 'aspect', to: '9:16' }] }));
    expect(mockEditQuote).toHaveBeenCalledWith({ liveEdit: true }, { userId: CTX.userId, file: FILES[1], edits: [{ op: 'aspect', to: '9:16' }] });
    expect(onEditQuote).toHaveBeenCalledWith(QUOTE);
    expect(out).toContain('"planned":true');
    expect(out).toContain('"edited":false');
    expect(out).not.toContain('secret-token');
    expect(out).not.toContain('omni-uploads');
  });

  test('a path, an unknown op or an out-of-range number from the model is refused before anything is read', async () => {
    const t = editTool(on())!;
    for (const input of [
      { file: 'omni-uploads/other/x.mp4', edits: [{ op: 'mute' }] },
      { edits: [{ op: 'exec', cmd: 'ls' }] },
      { edits: [{ op: 'speed', factor: 50 }] },
      { edits: [{ op: 'aspect', to: '4:3' }] },
      { edits: [{ op: 'trim', toSec: 5, factor: 2 }] },
      { edits: [] },
      { file: 3, edits: [{ op: 'mute' }] },
    ]) {
      const out = JSON.stringify(await t.run(input));
      expect(out).toMatch(/error/i);
    }
    expect(mockEditQuote).not.toHaveBeenCalled();
  });

  test('the system note tells the agent the edit starts only on Start', async () => {
    mockLlm.mockResolvedValueOnce('{"final":"ok"}');
    await runLiveAgent('make it 9:16', on());
    expect(mockLlm.mock.calls[0]![0].system).toContain(AGENT_EDIT_NOTE);
  });
});

describe('analyze_media (Agent G reads one file with Gemini; it starts nothing)', () => {
  const FILES = ['omni-uploads/u/a.mp4', 'omni-uploads/u/talk.mp3'];
  const ANALYSIS = {
    summary: 'A talk about the sea.', language: 'en', scenes: [], moments: [{ atSec: 12, why: 'laugh' }],
    transcript: [{ startSec: 1, speaker: 'A', text: 'Hello' }], speakers: [{ id: 'A', description: 'a man' }], objects: ['sea'], answer: null, dropped: 0,
  };
  const OK = { ok: true, analysis: ANALYSIS, source: { kind: 'file', type: 'audio', durationSec: 42 }, model: 'gemini-3.8-flash', usage: { inputTokens: 1, outputTokens: 2 } };
  const on = (over: Partial<AgentContext> = {}) => ({ ...CTX, analyze: true, files: FILES, ...over });
  const analyzeTool = (ctx: AgentContext, goal?: string) => buildLiveToolRegistry(ctx, goal ? { goal } : undefined).find((x) => x.name === 'analyze_media');

  test('offered only when file analysis is open to this user (its own flag, not media execution)', () => {
    expect(analyzeTool(CTX)).toBeUndefined();
    expect(analyzeTool({ ...CTX, media: true, files: FILES })).toBeUndefined();
    expect(analyzeTool(on())).toBeDefined();
    expect(analyzeTool({ ...CTX, analyze: true })).toBeDefined(); // a YouTube link needs no attached file
  });

  test('the model names the file by number; the answer is the analysis, never the file\'s path', async () => {
    mockAnalyze.mockResolvedValueOnce(OK);
    const out = await analyzeTool(on(), 'რას ამბობს ამ ჩანაწერში?')!.run({ file: 2, focus: 'transcript' });
    expect(mockAnalyze).toHaveBeenCalledWith({ liveAnalyze: true }, { userId: CTX.userId, source: { kind: 'file', ref: FILES[1] }, focus: 'transcript', lang: 'ka' });
    expect(out).toEqual({ ...ANALYSIS, lengthSec: 42, type: 'audio' });
    expect(JSON.stringify(out)).not.toContain('omni-uploads');
  });

  test('a public YouTube video goes as a link; the words\' language follows the user\'s goal', async () => {
    mockAnalyze.mockResolvedValueOnce(OK);
    await analyzeTool(on(), 'Что происходит в этом видео?')!.run({ youtube: 'https://youtu.be/dQw4w9WgXcQ', focus: 'question', question: 'Who sings?' });
    expect(mockAnalyze).toHaveBeenCalledWith({ liveAnalyze: true }, { userId: CTX.userId, source: { kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' }, focus: 'question', question: 'Who sings?', lang: 'ru' });
  });

  test('both a file and a link, a path, a missing file or a bad focus is refused before anything is read', async () => {
    const t = analyzeTool(on())!;
    for (const input of [
      { file: 1, youtube: 'https://youtu.be/dQw4w9WgXcQ' },
      { file: 'omni-uploads/other/x.mp4' },
      { file: 3 },
      { file: 0 },
      { focus: 'execute' },
      { youtube: 'not a url' },
      { question: 'x'.repeat(501) },
    ]) {
      expect(JSON.stringify(await t.run(input))).toMatch(/error/i);
    }
    expect(mockAnalyze).not.toHaveBeenCalled();
    // With no files at all, „the first file" is not there either.
    expect(JSON.stringify(await analyzeTool({ ...CTX, analyze: true })!.run({}))).toMatch(/no attached file 1/);
    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  test('a refusal comes back as an observation with its code; the run is bounded', async () => {
    mockAnalyze.mockResolvedValue({ ok: false, error: 'reference_refused', message: 'The model could not open the file by its link.' });
    const t = analyzeTool(on())!;
    expect(await t.run({ file: 1 })).toEqual({ error: 'reference_refused', message: 'The model could not open the file by its link.' });
    for (let i = 1; i < MAX_ANALYSES_PER_RUN; i++) await t.run({ file: 1 });
    expect(await t.run({ file: 1 })).toMatchObject({ error: 'call_limit' });
    expect(mockAnalyze).toHaveBeenCalledTimes(MAX_ANALYSES_PER_RUN);
    mockAnalyze.mockReset();
  });

  test('the system note is there only when the tool is', async () => {
    mockLlm.mockResolvedValueOnce('{"final":"ok"}');
    await runLiveAgent('what happens in this video?', on());
    expect(mockLlm.mock.calls[0]![0].system).toContain(AGENT_ANALYZE_NOTE);
    mockLlm.mockResolvedValueOnce('{"final":"ok"}');
    await runLiveAgent('what happens in this video?', { ...CTX, files: FILES });
    expect(mockLlm.mock.calls[1]![0].system).not.toContain(AGENT_ANALYZE_NOTE);
  });
});
