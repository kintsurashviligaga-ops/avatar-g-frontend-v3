/** @jest-environment node */
/**
 * lib/voice-v2v/geminiStt — the container fix, the model chain and the error taxonomy. fetch is mocked; no network.
 */
jest.mock('server-only', () => ({}));

import {
  classifySttStatus,
  containerFromMime,
  geminiAudioInput,
  geminiSttModelChain,
  GeminiSttError,
  hasGeminiSttKey,
  sniffAudioContainer,
  sttPrompt,
  transcribeWithGemini,
  transcribeWithGeminiDetailed,
} from './geminiStt';

const bytes = (...parts: Array<string | number[]>): Uint8Array => {
  const out: number[] = [];
  for (const p of parts) {
    if (typeof p === 'string') for (const ch of p) out.push(ch.charCodeAt(0));
    else out.push(...p);
  }
  while (out.length < 16) out.push(0);
  return new Uint8Array(out);
};

const WAV = bytes('RIFF', [0, 0, 0, 0], 'WAVE');
const WEBM = bytes([0x1a, 0x45, 0xdf, 0xa3]);
const MP4 = bytes([0, 0, 0, 0x20], 'ftypM4A ');
const GP3 = bytes([0, 0, 0, 0x20], 'ftyp3gp4');

describe('sniffAudioContainer', () => {
  it('recognises every documented container and the two browser-recorder ones by magic bytes', () => {
    expect(sniffAudioContainer(WAV)).toBe('wav');
    expect(sniffAudioContainer(bytes('FORM', [0, 0, 0, 0], 'AIFF'))).toBe('aiff');
    expect(sniffAudioContainer(bytes('OggS'))).toBe('ogg');
    expect(sniffAudioContainer(bytes('fLaC'))).toBe('flac');
    expect(sniffAudioContainer(bytes('ID3'))).toBe('mp3');
    expect(sniffAudioContainer(bytes([0xff, 0xfb, 0x90]))).toBe('mp3'); // MPEG-1 layer III frame
    expect(sniffAudioContainer(bytes([0xff, 0xf1, 0x50]))).toBe('aac'); // ADTS
    expect(sniffAudioContainer(WEBM)).toBe('webm');
    expect(sniffAudioContainer(MP4)).toBe('mp4');
    expect(sniffAudioContainer(GP3)).toBe('3gpp');
  });

  it('is total: junk, short and empty input → null', () => {
    expect(sniffAudioContainer(null)).toBeNull();
    expect(sniffAudioContainer(new Uint8Array(2))).toBeNull();
    expect(sniffAudioContainer(bytes('hello world'))).toBeNull();
    expect(sniffAudioContainer(new ArrayBuffer(0))).toBeNull();
  });
});

describe('containerFromMime', () => {
  it('drops codec parameters and aliases', () => {
    expect(containerFromMime('audio/webm;codecs=opus')).toBe('webm');
    expect(containerFromMime('audio/ogg; codecs=opus')).toBe('ogg');
    expect(containerFromMime('AUDIO/X-WAV')).toBe('wav');
    expect(containerFromMime('audio/mpeg')).toBe('mp3');
    expect(containerFromMime('audio/x-m4a')).toBe('mp4');
    expect(containerFromMime('text/plain')).toBeNull();
    expect(containerFromMime(undefined)).toBeNull();
  });
});

describe('geminiAudioInput', () => {
  it('sends documented audio containers under their documented MIME type', () => {
    expect(geminiAudioInput('audio/wav', WAV)).toEqual({ container: 'wav', mimeType: 'audio/wav', native: true });
    expect(geminiAudioInput('audio/flac')).toEqual({ container: 'flac', mimeType: 'audio/flac', native: true });
    expect(geminiAudioInput('audio/mpeg')).toEqual({ container: 'mp3', mimeType: 'audio/mp3', native: true });
  });

  it('the BYTES win over a wrong or empty declared type', () => {
    expect(geminiAudioInput('audio/webm', WAV)).toMatchObject({ container: 'wav', mimeType: 'audio/wav' });
    expect(geminiAudioInput('', MP4)).toMatchObject({ container: 'mp4', mimeType: 'video/mp4', native: false });
  });

  it('browser-recorder WebM / MP4 go as their documented VIDEO type, flagged non-native', () => {
    expect(geminiAudioInput('audio/webm;codecs=opus', WEBM)).toEqual({ container: 'webm', mimeType: 'video/webm', native: false });
    expect(geminiAudioInput('audio/mp4')).toEqual({ container: 'mp4', mimeType: 'video/mp4', native: false });
  });

  it('unknown → no MIME (the caller must not call Gemini)', () => {
    expect(geminiAudioInput('application/octet-stream', bytes('garbage!'))).toEqual({ container: null, mimeType: null, native: false });
  });
});

describe('geminiSttModelChain', () => {
  const ENV = { ...process.env };
  afterEach(() => { process.env = { ...ENV }; });

  it('defaults to gemini-3.8-flash, then 3.7-flash and flash-latest; never a retired 2.0 model or a 2.5 one (404 on a new project)', () => {
    delete process.env.GEMINI_STT_MODEL;
    delete process.env.VOICE_V2V_GEMINI_MODEL;
    expect(geminiSttModelChain()).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-flash-latest']);
    expect(geminiSttModelChain().some((m) => m.startsWith('gemini-2.'))).toBe(false);
  });

  it('an allowlisted override leads and the default stays behind it; a retired / unknown one is ignored', () => {
    process.env.GEMINI_STT_MODEL = 'gemini-3.6-flash';
    expect(geminiSttModelChain()).toEqual(['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-flash-latest']);
    process.env.GEMINI_STT_MODEL = 'gemini-2.0-flash-lite';
    delete process.env.VOICE_V2V_GEMINI_MODEL;
    expect(geminiSttModelChain()).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-flash-latest']);
    expect(geminiSttModelChain().some((m) => m.startsWith('gemini-2.0'))).toBe(false);
    // The legacy 2.5 default is no longer allowlisted, so an old env value cannot put a 404 first.
    process.env.GEMINI_STT_MODEL = 'gemini-2.5-flash';
    expect(geminiSttModelChain()).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-flash-latest']);
  });
});

describe('classifySttStatus', () => {
  it('maps the statuses that matter; 402 is quota (our outage), never retried as a model problem', () => {
    expect(classifySttStatus(402)).toBe('quota');
    expect(classifySttStatus(429, 'Your prepayment credits are depleted')).toBe('quota');
    expect(classifySttStatus(429, 'Resource exhausted')).toBe('rate_limited');
    expect(classifySttStatus(403)).toBe('auth');
    expect(classifySttStatus(400, 'API key not valid. Please pass a valid API key.')).toBe('auth');
    expect(classifySttStatus(404)).toBe('model_missing');
    expect(classifySttStatus(400, 'models/gemini-x is not found')).toBe('model_missing');
    expect(classifySttStatus(400, 'Unsupported MIME type: audio/webm')).toBe('bad_request');
    expect(classifySttStatus(503)).toBe('unavailable');
  });
});

describe('sttPrompt', () => {
  it('pins Georgian to the Mkhedruli script (sttAccept rejects Latin output)', () => {
    expect(sttPrompt('ka-GE')).toMatch(/Georgian/);
    expect(sttPrompt('ka-GE')).toMatch(/Mkhedruli/);
    expect(sttPrompt('en-US')).not.toMatch(/Mkhedruli/);
  });
});

describe('transcribeWithGeminiDetailed', () => {
  const ENV = { ...process.env };
  let fetchSpy: jest.SpyInstance;

  const ok = (text: string, usage?: Record<string, number>) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }], ...(usage ? { usageMetadata: usage } : {}) }), { status: 200 });

  beforeEach(() => {
    delete process.env.GEMINI_API_KEYS;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GEMINI_STT_MODEL;
    delete process.env.VOICE_V2V_GEMINI_MODEL;
    process.env.GEMINI_API_KEY = 'test-key';
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => ok('გამარჯობა'));
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    process.env = { ...ENV };
  });

  const sentBody = (i = 0) => JSON.parse(String((fetchSpy.mock.calls[i]![1] as RequestInit).body)) as {
    contents: Array<{ parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> }>;
    generationConfig: { temperature: number; thinkingConfig?: { thinkingBudget: number } };
  };

  it('the key rides in x-goog-api-key, never the URL; audio goes inline with the given MIME', async () => {
    const r = await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'ka-GE');
    expect(r).toEqual({ text: 'გამარჯობა', model: 'gemini-3.8-flash' });
    const [url, init] = fetchSpy.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    expect(url).not.toMatch(/key=/);
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    const b = sentBody();
    expect(b.contents[0]!.parts[1]!.inline_data).toEqual({ mime_type: 'audio/wav', data: 'QUJD' });
    expect(b.generationConfig.temperature).toBe(0);
    // gemini-3.8-flash takes `thinkingLevel` (its documented floor is 'low'; 'minimal' is a 400 on it) — never the 2.5
    // `thinkingBudget`, and never both (sending both is a 400 too).
    expect(b.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
  });

  it('turns thinking down with the field each verified family takes — and sends nothing for the rest', async () => {
    process.env.GEMINI_STT_MODEL = 'gemini-3.7-flash';
    await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'en-US');
    expect(sentBody(0).generationConfig.thinkingConfig).toBeUndefined();
  });

  it('returns Google-reported usage', async () => {
    fetchSpy.mockImplementationOnce(async () => ok('hello', { promptTokenCount: 50, candidatesTokenCount: 3, totalTokenCount: 53 }));
    const r = await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'en-US');
    expect(r.usage).toEqual({ inputTokens: 50, outputTokens: 3, totalTokens: 53 });
  });

  it('a lone stage note is "heard nothing"; thought parts are skipped', async () => {
    fetchSpy.mockImplementationOnce(async () => ok('[silence]'));
    expect((await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'en-US')).text).toBe('');
    fetchSpy.mockImplementationOnce(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text: ' hello   world ' }] } }],
    }), { status: 200 }));
    expect((await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'en-US')).text).toBe('hello world');
  });

  it('rotates on a missing model, then succeeds on the next', async () => {
    fetchSpy.mockImplementationOnce(async () => new Response('model is no longer available', { status: 404 }));
    const r = await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'en-US');
    expect(r.model).toBe('gemini-3.7-flash');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(sentBody(1).generationConfig.thinkingConfig).toBeUndefined();
  });

  it('rotates all the way to the flash-latest alias when the two named models are gone', async () => {
    fetchSpy.mockImplementationOnce(async () => new Response('model is no longer available', { status: 404 }));
    fetchSpy.mockImplementationOnce(async () => new Response('model is no longer available', { status: 404 }));
    const r = await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'en-US');
    expect(r.model).toBe('gemini-flash-latest');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    // flash-latest is an alias whose family can change → no thinking field.
    expect(sentBody(2).generationConfig.thinkingConfig).toBeUndefined();
  });

  it('does NOT rotate on quota / auth / bad request — throws a typed error after one call', async () => {
    fetchSpy.mockImplementation(async () => new Response('prepay depleted', { status: 402 }));
    await expect(transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'en-US')).rejects.toMatchObject({ code: 'quota', status: 402 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockClear();
    fetchSpy.mockImplementation(async () => new Response('Unsupported MIME type', { status: 400 }));
    const err = await transcribeWithGeminiDetailed('QUJD', 'video/webm', 'en-US').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GeminiSttError);
    expect((err as GeminiSttError).code).toBe('bad_request');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('a network failure is typed and never includes the key', async () => {
    fetchSpy.mockImplementation(async () => { throw new TypeError('fetch failed'); });
    const err = (await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'en-US').catch((e: unknown) => e)) as GeminiSttError;
    expect(err.code).toBe('network');
    expect(err.message).not.toContain('test-key');
  });

  it('no key → auth error and no call; hasGeminiSttKey reads the shared pool', async () => {
    delete process.env.GEMINI_API_KEY;
    expect(hasGeminiSttKey()).toBe(false);
    await expect(transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'en-US')).rejects.toMatchObject({ code: 'auth' });
    expect(fetchSpy).not.toHaveBeenCalled();
    process.env.GEMINI_API_KEYS = 'pool-a, pool-b';
    expect(hasGeminiSttKey()).toBe(true);
  });

  it('the legacy text-only wrapper still works', async () => {
    fetchSpy.mockImplementationOnce(async () => ok(' hi '));
    await expect(transcribeWithGemini('QUJD', 'audio/ogg', 'en-US')).resolves.toBe('hi');
  });
});
