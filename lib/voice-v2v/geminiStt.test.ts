/** @jest-environment node */
/**
 * lib/voice-v2v/geminiStt — the container fix, the model chain and the error taxonomy. fetch is mocked; no network.
 */
jest.mock('server-only', () => ({}));
jest.mock('../veo/vertexAuth', () => ({
  ...jest.requireActual('../veo/vertexAuth'),
  getVertexAccessToken: jest.fn(async () => 'vertex-token'),
}));

import {
  classifySttStatus,
  containerFromMime,
  geminiAudioInput,
  geminiSttBlocker,
  geminiSttModelChain,
  GeminiSttError,
  hasGeminiSttKey,
  isTranslated,
  splitSpokenTag,
  isTranscribeModel,
  STT_FALLBACK_RESERVE_MS,
  sniffAudioContainer,
  sttPrompt,
  transcribeWithGemini,
  transcribeWithGeminiDetailed,
} from './geminiStt';
import { DEFAULT_CHAT_MODELS, TRANSCRIBE_MODEL } from '../ai/google/models';

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

/** A complete keyless (WIF) Vertex AI config; the token is mocked above, so nothing leaves the process. */
const VERTEX_ENV = {
  GCP_PROJECT_ID: 'gen-lang-client-0671348730',
  GCP_PROJECT_NUMBER: '467145118875',
  GCP_SERVICE_ACCOUNT_EMAIL: 'myavatar-veo@gen-lang-client-0671348730.iam.gserviceaccount.com',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
};

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

  it('defaults to gemini-3.6-flash, then 3.5 and 3.8 Flash (fastest first); never a retired 2.0 model or a 2.5 one', () => {
    delete process.env.GEMINI_STT_MODEL;
    delete process.env.VOICE_V2V_GEMINI_MODEL;
    expect(geminiSttModelChain()).toEqual(['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.8-flash']);
    expect(geminiSttModelChain().some((m) => m.startsWith('gemini-2.'))).toBe(false);
    // The transcribe model is the owner's trial only, never a step-down.
    expect(geminiSttModelChain()).not.toContain(TRANSCRIBE_MODEL);
  });

  it('an allowlisted override leads and the default stays behind it; a retired / unknown one is ignored', () => {
    process.env.GEMINI_STT_MODEL = 'gemini-3.8-flash';
    expect(geminiSttModelChain()).toEqual(['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash']);
    process.env.GEMINI_STT_MODEL = 'gemini-3.1-flash-lite';
    expect(geminiSttModelChain()).toEqual(['gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.8-flash']);
    process.env.GEMINI_STT_MODEL = 'gemini-2.0-flash-lite';
    delete process.env.VOICE_V2V_GEMINI_MODEL;
    expect(geminiSttModelChain()).toEqual(['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.8-flash']);
    expect(geminiSttModelChain().some((m) => m.startsWith('gemini-2.0'))).toBe(false);
    // The legacy 2.5 default is no longer allowlisted, so an old env value cannot put a 404 first.
    process.env.GEMINI_STT_MODEL = 'gemini-2.5-flash';
    expect(geminiSttModelChain()).toEqual(['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.8-flash']);
  });

  it("steps down through the chat's Flash models, so the mic is served wherever the chat is (GG, 2026-10-24)", () => {
    delete process.env.GEMINI_STT_MODEL;
    delete process.env.VOICE_V2V_GEMINI_MODEL;
    expect([...geminiSttModelChain()].sort()).toEqual([...DEFAULT_CHAT_MODELS.standard].sort());
  });

  it('3.8 Flash is the LAST step: it timed out on the owner\'s dictation (GG, 2026-10-25)', () => {
    delete process.env.GEMINI_STT_MODEL;
    delete process.env.VOICE_V2V_GEMINI_MODEL;
    expect(geminiSttModelChain().at(-1)).toBe('gemini-3.8-flash');
  });

  it('a Gemini-API-only alias never enters the chain (it answers 404 on Vertex AI), even as an override', () => {
    delete process.env.VOICE_V2V_GEMINI_MODEL;
    for (const transport of [undefined, 'vertex']) {
      if (transport) process.env.GEMINI_TRANSPORT = transport;
      else delete process.env.GEMINI_TRANSPORT;
      delete process.env.GEMINI_STT_MODEL;
      expect(geminiSttModelChain()).toEqual(['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.8-flash']);
      process.env.GEMINI_STT_MODEL = 'gemini-pro-latest';
      expect(geminiSttModelChain()).toEqual(['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.8-flash']);
    }
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
    expect(sttPrompt('ka-GE')).toMatch(/most likely speaks Georgian/);
    expect(sttPrompt('ka-GE')).toMatch(/Mkhedruli/);
  });

  it('the language is a HINT, never a target: whatever is spoken is written as spoken, never translated', () => {
    for (const l of ['ka-GE', 'en-US', 'ru-RU', 'auto']) {
      expect(sttPrompt(l)).toMatch(/NEVER translate/);
      expect(sttPrompt(l)).toMatch(/language the speaker actually uses/);
      expect(sttPrompt(l)).toMatch(/Georgian speech is written in the Georgian \(Mkhedruli\) alphabet/);
      expect(sttPrompt(l)).not.toMatch(/Transcribe this audio in (English|Georgian|Russian)\b/);
    }
    expect(sttPrompt('en-US')).toMatch(/most likely speaks English; if they speak another language, write that language/);
    expect(sttPrompt('ru-RU')).toMatch(/most likely speaks Russian/);
    expect(sttPrompt('auto')).not.toMatch(/most likely/);
    expect(sttPrompt('auto')).toMatch(/Georgian, English, Russian or any other language/);
  });

  it('asks for the language code first, and never a translation into the language of the instructions', () => {
    for (const l of ['ka-GE', 'en-US', 'ru-RU', 'auto']) {
      expect(sttPrompt(l)).toMatch(/First write the ISO 639-1 code of the language actually spoken in square brackets/);
      expect(sttPrompt(l)).toMatch(/not even into the language of these instructions/);
    }
  });

  it('drops hesitation sounds in every language, and names only sounds that are never words', () => {
    for (const p of [sttPrompt('ka-GE'), sttPrompt('en-US'), sttPrompt('ru-RU'), sttPrompt('auto'), sttPrompt('en-US', 'ru')]) {
      expect(p).toMatch(/Leave out hesitation sounds that are not words \(uh, um, er, hmm, э-э, мм, ე-ე, მმ\); keep every real word\./);
    }
  });

  it("after a translated answer the retry states the language outright, whatever the mic's hint was", () => {
    const p = sttPrompt('en-US', 'ru');
    expect(p).toMatch(/The speaker speaks Russian\. Write their Russian words in Cyrillic, exactly as spoken; do NOT translate/);
    expect(p).not.toMatch(/most likely speaks English/);
    expect(sttPrompt('ka-GE', 'ka')).toMatch(/The speaker speaks Georgian\. Write their Georgian words in the Georgian \(Mkhedruli\) alphabet/);
  });
});

describe('splitSpokenTag / isTranslated', () => {
  it('reads the leading language code and strips it; brackets only, so speech keeps its own first word', () => {
    expect(splitSpokenTag('[ru] Привет, как дела')).toEqual({ spoken: 'ru', text: 'Привет, как дела' });
    expect(splitSpokenTag(' [KA-GE] გამარჯობა')).toEqual({ spoken: 'ka', text: 'გამარჯობა' });
    expect(splitSpokenTag('(en) hello')).toEqual({ spoken: 'en', text: 'hello' });
    expect(splitSpokenTag('So: I think')).toEqual({ spoken: null, text: 'So: I think' });
    expect(splitSpokenTag('[silence]')).toEqual({ spoken: null, text: '[silence]' });
    expect(splitSpokenTag('გამარჯობა')).toEqual({ spoken: null, text: 'გამარჯობა' });
  });

  it('a one-script language written only in Latin letters is a translation; English and native script never are', () => {
    // GG, Production 2026-10-25: Russian speech, this sentence in the box.
    expect(isTranslated('ru', 'can you make a prompt for VEO 3 and make it the podcast 9:16 format video for cinema')).toBe(true);
    expect(isTranslated('ka', 'How do I get to Batumi?')).toBe(true);
    expect(isTranslated('ru', 'сделай промпт для VEO 3')).toBe(false);
    expect(isTranslated('ka', 'გახსენი Instagram')).toBe(false);
    expect(isTranslated('en', 'hello there')).toBe(false);
    expect(isTranslated('de', 'guten Tag')).toBe(false);
    expect(isTranslated(null, 'hello there')).toBe(false);
    expect(isTranslated('ru', '123')).toBe(false);
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
    delete process.env.GEMINI_TRANSPORT;
    delete process.env.GCP_GEMINI_LOCATION;
    delete process.env.GCP_VEO_LOCATION;
    Object.assign(process.env, VERTEX_ENV);
    // A leftover AI Studio key changes nothing: it is never read, sent or echoed.
    process.env.GEMINI_API_KEY = 'test-key';
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => ok('გამარჯობა'));
  });
  afterEach(() => {
    for (const [url] of fetchSpy.mock.calls) expect(String(url)).not.toContain('generativelanguage.googleapis.com');
    fetchSpy.mockRestore();
    process.env = { ...ENV };
  });

  const sentBody = (i = 0) => JSON.parse(String((fetchSpy.mock.calls[i]![1] as RequestInit).body)) as {
    contents: Array<{ parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string }; inline_data?: unknown }> }>;
    generationConfig: { temperature: number; thinkingConfig?: Record<string, unknown> };
  };

  it('goes to Vertex AI with a bearer token and no key; audio goes inline with the given MIME', async () => {
    const r = await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'ka-GE');
    expect(r).toEqual({ text: 'გამარჯობა', model: 'gemini-3.6-flash' });
    const [url, init] = fetchSpy.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(
      'https://aiplatform.googleapis.com/v1/projects/gen-lang-client-0671348730/locations/global/publishers/google/models/gemini-3.6-flash:generateContent',
    );
    expect(url).not.toMatch(/key=/);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer vertex-token');
    expect(headers['x-goog-api-key']).toBeUndefined();
    const b = sentBody();
    // camelCase, as the chat SDK and the image studio send it on Vertex AI.
    expect(b.contents[0]!.parts[1]!.inlineData).toEqual({ mimeType: 'audio/wav', data: 'QUJD' });
    expect(b.contents[0]!.parts[1]!.inline_data).toBeUndefined();
    expect(b.generationConfig.temperature).toBe(0);
    // gemini-3.6-flash takes `thinkingLevel: 'minimal'` (a transcript needs no reasoning) — never the 2.5
    // `thinkingBudget`, and never both (sending both is a 400).
    expect(b.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'minimal' });
  });

  it("thinks as little as each model accepts: 'minimal' up to 3.6 Flash and on Flash-Lite, 'low' on 3.7 / 3.8 Flash and Pro", async () => {
    const want: Array<[string, Record<string, unknown> | undefined]> = [
      ['gemini-3.6-flash', { thinkingLevel: 'minimal' }],
      ['gemini-3.5-flash', { thinkingLevel: 'minimal' }],
      ['gemini-3.1-flash-lite', { thinkingLevel: 'minimal' }],
      ['gemini-3.5-flash-lite', { thinkingLevel: 'minimal' }],
      // 'minimal' is a 400 on these (verified live on 3.8 Flash 2026-10-02).
      ['gemini-3.7-flash', { thinkingLevel: 'low' }],
      ['gemini-3.8-flash', { thinkingLevel: 'low' }],
      ['gemini-3.1-pro-preview', { thinkingLevel: 'low' }],
      ['gemini-2.5-flash', { thinkingBudget: 0 }],
      // `-latest` aliases can change family under us: the model's own default.
      ['gemini-flash-latest', undefined],
    ];
    for (const [model, config] of want) {
      fetchSpy.mockClear();
      await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'en-US', { models: [model] });
      expect([model, sentBody(0).generationConfig.thinkingConfig]).toEqual([model, config]);
    }
  });

  it('strips the language code and returns it; an answer without one is taken as before', async () => {
    fetchSpy.mockImplementationOnce(async () => ok('[ka] გამარჯობა'));
    expect(await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'ka-GE')).toEqual({ text: 'გამარჯობა', model: 'gemini-3.6-flash', spoken: 'ka' });
    fetchSpy.mockImplementationOnce(async () => ok('[ru]'));
    expect((await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'auto')).text).toBe('');
  });

  it('Russian speech answered in English is asked once more, the language stated: the Cyrillic answer wins (GG, 2026-10-25)', async () => {
    fetchSpy
      .mockImplementationOnce(async () => ok('[ru] can you make a prompt for VEO 3', { promptTokenCount: 50, candidatesTokenCount: 10, totalTokenCount: 60 }))
      .mockImplementationOnce(async () => ok('[ru] можешь сделать промпт для VEO 3', { promptTokenCount: 60, candidatesTokenCount: 12, totalTokenCount: 72 }));
    const r = await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'en-US');
    expect(r).toEqual({
      text: 'можешь сделать промпт для VEO 3',
      model: 'gemini-3.6-flash',
      spoken: 'ru',
      // Both calls were billed.
      usage: { inputTokens: 110, outputTokens: 22, totalTokens: 132 },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(sentBody(0).contents[0]!.parts[0]!.text).toMatch(/most likely speaks English/);
    expect(sentBody(1).contents[0]!.parts[0]!.text).toMatch(/The speaker speaks Russian\./);
  });

  it('asks again only once: a second English answer is returned as it is', async () => {
    fetchSpy.mockImplementation(async () => ok('[ru] can you make a prompt'));
    const r = await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'ka-GE');
    expect(r.text).toBe('can you make a prompt');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('a retry that cannot answer still leaves the first answer, not a lost dictation', async () => {
    fetchSpy
      .mockImplementationOnce(async () => ok('[ru] can you make a prompt'))
      .mockImplementationOnce(async () => new Response('bad', { status: 400 }));
    const r = await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'ru-RU', { models: ['gemini-3.6-flash'] });
    expect(r).toMatchObject({ text: 'can you make a prompt', spoken: 'ru' });
  });

  it('the dedicated transcribe model (owner trial only) gets the audio alone: no prompt, no temperature, no thinking', async () => {
    const r = await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'ka-GE', { models: [TRANSCRIBE_MODEL] });
    expect(r.model).toBe('gemini-3.5-transcribe-preview');
    const [url] = fetchSpy.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(
      'https://aiplatform.googleapis.com/v1/projects/gen-lang-client-0671348730/locations/global/publishers/google/models/gemini-3.5-transcribe-preview:generateContent',
    );
    const b = sentBody() as unknown as Record<string, unknown> & { contents: Array<{ parts: unknown[] }> };
    expect(b.contents[0]!.parts).toEqual([{ inlineData: { mimeType: 'audio/wav', data: 'QUJD' } }]);
    expect(b.generationConfig).toBeUndefined();
  });

  it('isTranscribeModel: the recorded-audio transcribe model only, never its Live variant or a chat model', () => {
    expect(isTranscribeModel('gemini-3.5-transcribe-preview')).toBe(true);
    expect(isTranscribeModel('gemini-3.5-transcribe')).toBe(true);
    expect(isTranscribeModel('gemini-3.5-transcribe-live')).toBe(false);
    expect(isTranscribeModel('gemini-3.5-transcribe-live-preview')).toBe(false);
    expect(isTranscribeModel('gemini-3.6-flash')).toBe(false);
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

  const modelOf = (i: number) => /models\/([^:]+):/.exec(String(fetchSpy.mock.calls[i]![0]))![1];

  it('rotates on a missing model, then succeeds on the next', async () => {
    fetchSpy.mockImplementationOnce(async () => new Response('model is no longer available', { status: 404 }));
    const r = await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'en-US');
    expect(r.model).toBe('gemini-3.5-flash');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(sentBody(1).generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'minimal' });
  });

  it("rotates on a 429 (that model's bucket on Vertex AI), as the chat does, and answers from the next model", async () => {
    fetchSpy.mockImplementationOnce(async () => new Response('Resource exhausted. Please try again later.', { status: 429 }));
    const r = await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'ka-GE');
    expect(r).toEqual({ text: 'გამარჯობა', model: 'gemini-3.5-flash' });
    expect([modelOf(0), modelOf(1)]).toEqual(['gemini-3.6-flash', 'gemini-3.5-flash']);
  });

  it('when every model is gone or busy it stops with the last code, and the error names each model tried', async () => {
    fetchSpy
      .mockImplementationOnce(async () => new Response('model is no longer available', { status: 404 }))
      .mockImplementationOnce(async () => new Response('Resource exhausted', { status: 429 }))
      .mockImplementationOnce(async () => new Response('model is no longer available', { status: 404 }));
    const err = (await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'en-US').catch((e: unknown) => e)) as GeminiSttError;
    expect(err).toBeInstanceOf(GeminiSttError);
    expect(err.code).toBe('model_missing');
    expect(err.message.startsWith('gemini-3.6-flash 404, gemini-3.5-flash 429, gemini-3.8-flash 404: ')).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls.map(([url]) => String(url)).join(' ')).not.toMatch(/latest/);
  });

  it('one attempt: the message is the answer alone, with no chain prefix', async () => {
    fetchSpy.mockImplementationOnce(async () => new Response('Permission denied', { status: 403 }));
    const err = (await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'en-US').catch((e: unknown) => e)) as GeminiSttError;
    expect(err.code).toBe('auth');
    expect(err.message).toBe('Gemini STT failed (403) on gemini-3.6-flash: Permission denied');
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

    fetchSpy.mockClear();
    fetchSpy.mockImplementation(async () => new Response('Permission denied on resource', { status: 403 }));
    await expect(transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'en-US')).rejects.toMatchObject({ code: 'auth', status: 403 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('a network failure is typed, never includes the key, and does not rotate (a reset is not the model\'s fault)', async () => {
    fetchSpy.mockImplementation(async () => { throw new TypeError('fetch failed'); });
    const err = (await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'en-US').catch((e: unknown) => e)) as GeminiSttError;
    expect(err.code).toBe('network');
    expect(err.message).not.toContain('test-key');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  const timedOut = async (): Promise<Response> => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); };

  it('a model that does not answer in its share of the deadline hands the rest to the next model (GG, 2026-10-25)', async () => {
    fetchSpy.mockImplementationOnce(timedOut);
    const r = await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'ka-GE');
    expect(r).toEqual({ text: 'გამარჯობა', model: 'gemini-3.5-flash' });
    expect([modelOf(0), modelOf(1)]).toEqual(['gemini-3.6-flash', 'gemini-3.5-flash']);
  });

  it('when every model times out the error names each one, and the last answer is the network error', async () => {
    fetchSpy.mockImplementation(timedOut);
    const err = (await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'ka-GE').catch((e: unknown) => e)) as GeminiSttError;
    expect(err).toBeInstanceOf(GeminiSttError);
    expect(err.code).toBe('network');
    expect(err.message).toBe(
      'gemini-3.6-flash timeout, gemini-3.5-flash timeout, gemini-3.8-flash timeout: Gemini STT network error on gemini-3.8-flash: TimeoutError',
    );
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('an attempt with a model after it stops STT_FALLBACK_RESERVE_MS early (never under 5 s); the last one gets the rest', async () => {
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    // A clock that each timed-out attempt moves on by exactly its own timeout.
    let now = 1_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      fetchSpy.mockImplementation(async () => {
        now += timeoutSpy.mock.calls.at(-1)![0] as number;
        return timedOut();
      });
      await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'ka-GE', { timeoutMs: 22_000 }).catch(() => null);
      // 22 s: the first model 14 s (8 s kept for the rest), the second the 5 s floor, the last what is left.
      expect(STT_FALLBACK_RESERVE_MS).toBe(8_000);
      expect(timeoutSpy.mock.calls.map(([ms]) => ms)).toEqual([14_000, 5_000, 3_000]);
      // One model alone has nothing to keep time for: it gets the whole deadline.
      timeoutSpy.mockClear();
      await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'ka-GE', { models: ['gemini-3.6-flash'], timeoutMs: 22_000 }).catch(() => null);
      expect(timeoutSpy.mock.calls.map(([ms]) => ms)).toEqual([22_000]);
    } finally {
      nowSpy.mockRestore();
      timeoutSpy.mockRestore();
    }
  });

  it('a 400 that names thinking moves to the next model; any other 400 still stops at once', async () => {
    fetchSpy.mockImplementationOnce(async () => new Response(JSON.stringify({
      error: { code: 400, message: 'Thinking level MINIMAL is not supported for this model.', status: 'INVALID_ARGUMENT' },
    }), { status: 400 }));
    const r = await transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'ka-GE');
    expect(r.model).toBe('gemini-3.5-flash');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('Vertex AI unconfigured → auth error and no call, whatever AI Studio keys exist', async () => {
    for (const k of Object.keys(VERTEX_ENV)) delete process.env[k];
    process.env.GEMINI_API_KEYS = 'pool-a, pool-b';
    expect(hasGeminiSttKey()).toBe(false);
    expect(geminiSttBlocker()).toBe('Vertex AI is not configured');
    await expect(transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'en-US')).rejects.toMatchObject({ code: 'auth' });
    expect(fetchSpy).not.toHaveBeenCalled();
    Object.assign(process.env, VERTEX_ENV);
    expect(hasGeminiSttKey()).toBe(true);
    expect(geminiSttBlocker()).toBeNull();
  });

  it('GEMINI_TRANSPORT=gemini_api (the Developer API) → auth error before any provider I/O', async () => {
    process.env.GEMINI_TRANSPORT = 'gemini_api';
    expect(hasGeminiSttKey()).toBe(false);
    await expect(transcribeWithGeminiDetailed('QUJD', 'audio/wav', 'en-US')).rejects.toMatchObject({ code: 'auth' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('the legacy text-only wrapper still works', async () => {
    fetchSpy.mockImplementationOnce(async () => ok(' hi '));
    await expect(transcribeWithGemini('QUJD', 'audio/ogg', 'en-US')).resolves.toBe('hi');
  });
});
