import {
  buildSetupMessage, buildAudioMessage, buildVideoMessage, buildLiveUrl,
  parseLiveServerEvents, DEFAULT_LIVE_MODEL, GEMINI_LIVE_VOICES,
  buildLiveSetup, toLiveModelResource, parseLiveServerMessage, parseDurationMs,
  buildRealtimeAudio, buildRealtimeVideo, buildRealtimeText, buildAudioStreamEnd, buildToolResponse,
  GeminiLiveSession, type LiveServerEvent, type LiveSetup,
} from './geminiLive';
import { DEFAULT_LIVE_MODEL as BARE_DEFAULT_LIVE_MODEL } from '../ai/google/models';
import { LIVE_FUNCTION_DECLARATIONS } from './liveTools';

describe('geminiLive — pure wire-format builders/parser', () => {
  it('buildSetupMessage defaults model + AUDIO modality, omits empty systemInstruction', () => {
    const m = buildSetupMessage({}) as { setup: { model: string; generationConfig: { responseModalities: string[] }; systemInstruction?: unknown } };
    expect(m.setup.model).toBe(DEFAULT_LIVE_MODEL);
    expect(m.setup.generationConfig.responseModalities).toEqual(['AUDIO']);
    expect(m.setup.systemInstruction).toBeUndefined();
  });

  it('buildSetupMessage includes system instruction + custom modalities when given', () => {
    const m = buildSetupMessage({ systemInstruction: 'Be Maia', responseModalities: ['TEXT'], model: 'models/x' }) as { setup: { model: string; systemInstruction: { parts: { text: string }[] }; generationConfig: { responseModalities: string[] } } };
    expect(m.setup.model).toBe('models/x');
    expect(m.setup.systemInstruction.parts[0]!.text).toBe('Be Maia');
    expect(m.setup.generationConfig.responseModalities).toEqual(['TEXT']);
  });

  it('buildSetupMessage disables thinking (thinkingBudget 0) for low-latency voice', () => {
    const m = buildSetupMessage({}) as { setup: { generationConfig: { thinkingConfig?: { thinkingBudget?: number } } } };
    expect(m.setup.generationConfig.thinkingConfig?.thinkingBudget).toBe(0);
  });

  it('DEFAULT_LIVE_MODEL is a native-audio Live model (the retired 2.0-flash-live-001 must not return)', () => {
    // Guards the "retired model → handshake fails" regression: the model must be a currently-served one.
    expect(DEFAULT_LIVE_MODEL).toBe('models/gemini-2.5-flash-native-audio-latest');
    expect(DEFAULT_LIVE_MODEL).not.toBe('models/gemini-2.0-flash-live-001');
  });

  it('GEMINI_LIVE_VOICES maps female/male to verified prebuilt voices', () => {
    expect(GEMINI_LIVE_VOICES.female).toBe('Aoede');
    expect(GEMINI_LIVE_VOICES.male).toBe('Charon');
  });

  it('buildSetupMessage emits speechConfig with the prebuilt voice when voiceName is set', () => {
    const m = buildSetupMessage({ voiceName: 'Aoede' }) as { setup: { generationConfig: { speechConfig?: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } }; languageCode?: string } } } };
    expect(m.setup.generationConfig.speechConfig?.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Aoede');
    expect(m.setup.generationConfig.speechConfig?.languageCode).toBeUndefined();
  });

  it('buildSetupMessage adds languageCode to speechConfig only alongside a voiceName', () => {
    const m = buildSetupMessage({ voiceName: 'Charon', languageCode: 'ka-GE' }) as { setup: { generationConfig: { speechConfig?: { languageCode?: string } } } };
    expect(m.setup.generationConfig.speechConfig?.languageCode).toBe('ka-GE');
  });

  it('buildSetupMessage omits speechConfig entirely when no voiceName is given (default-voice path unchanged)', () => {
    const m = buildSetupMessage({ systemInstruction: 'hi' }) as { setup: { generationConfig: Record<string, unknown> } };
    expect('speechConfig' in m.setup.generationConfig).toBe(false);
  });

  it('buildSetupMessage round-trips a dated systemInstruction verbatim (date-injection contract)', () => {
    const instr = "You are MyAvatar.\nToday's date is Friday, July 24, 2026.";
    const m = buildSetupMessage({ systemInstruction: instr, voiceName: 'Aoede' }) as { setup: { systemInstruction: { parts: { text: string }[] } } };
    expect(m.setup.systemInstruction.parts[0]!.text).toBe(instr);
  });

  it('buildAudioMessage / buildVideoMessage produce mediaChunks with correct mimeTypes', () => {
    const a = buildAudioMessage('AAAA') as { realtimeInput: { mediaChunks: { mimeType: string; data: string }[] } };
    expect(a.realtimeInput.mediaChunks[0]).toEqual({ mimeType: 'audio/pcm;rate=16000', data: 'AAAA' });
    const v = buildVideoMessage('BBBB') as { realtimeInput: { mediaChunks: { mimeType: string; data: string }[] } };
    expect(v.realtimeInput.mediaChunks[0]!.mimeType).toBe('image/jpeg');
  });

  it('buildLiveUrl uses the v1alpha Constrained method for an ephemeral token, v1beta for an api key', () => {
    expect(buildLiveUrl({ token: 'ephem 1', wsBase: 'wss://x' }))
      .toBe('wss://x.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=ephem%201');
    expect(buildLiveUrl({ apiKey: 'k', wsBase: 'wss://x' }))
      .toBe('wss://x.v1beta.GenerativeService.BidiGenerateContent?key=k');
  });

  it('parseLiveServerEvents maps setupComplete', () => {
    expect(parseLiveServerEvents({ setupComplete: {} })).toEqual([{ type: 'setupComplete' }]);
  });

  it('parseLiveServerEvents extracts audio + turnComplete from one message', () => {
    const evs = parseLiveServerEvents({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'PCM' } }] },
        turnComplete: true,
      },
    });
    expect(evs).toEqual([{ type: 'audio', data: 'PCM' }, { type: 'turnComplete' }]);
  });

  it('parseLiveServerEvents surfaces interruption before content', () => {
    const evs = parseLiveServerEvents({ serverContent: { interrupted: true, modelTurn: { parts: [{ text: 'hi' }] } } });
    expect(evs[0]).toEqual({ type: 'interrupted' });
    expect(evs).toContainEqual({ type: 'text', text: 'hi' });
  });

  it('parseLiveServerEvents is fail-safe on garbage', () => {
    expect(parseLiveServerEvents(null)).toEqual([{ type: 'unknown' }]);
    expect(parseLiveServerEvents('nope')).toEqual([{ type: 'unknown' }]);
    expect(parseLiveServerEvents({ serverContent: {} })).toEqual([{ type: 'unknown' }]);
  });
});

// ─── Parity protocol (2026-09-30) ─────────────────────────────────────────────

const setupOf = (m: unknown): LiveSetup => (m as { setup: LiveSetup }).setup;
const base = { model: 'gemini-2.5-flash-native-audio-latest', systemInstruction: 'Be Maia', voiceName: 'Aoede' };

describe('geminiLive — buildLiveSetup', () => {
  it('minimal options → exactly model + AUDIO + prebuilt voice + systemInstruction + 2.5 thinkingBudget 0', () => {
    expect(buildLiveSetup(base)).toEqual({
      setup: {
        model: 'models/gemini-2.5-flash-native-audio-latest',
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } },
          thinkingConfig: { thinkingBudget: 0 },
        },
        systemInstruction: { parts: [{ text: 'Be Maia' }] },
      },
    });
  });

  it('agrees with lib/ai/google/models.ts on the default Live model (bare vs resource form)', () => {
    expect(DEFAULT_LIVE_MODEL).toBe(`models/${BARE_DEFAULT_LIVE_MODEL}`);
    expect(setupOf(buildLiveSetup({ ...base, model: BARE_DEFAULT_LIVE_MODEL })).model).toBe(DEFAULT_LIVE_MODEL);
  });

  it('normalises the model: bare → models/…, prefixed kept, malformed / retired → DEFAULT_LIVE_MODEL', () => {
    expect(toLiveModelResource('gemini-3.8-live')).toBe('models/gemini-3.8-live');
    expect(toLiveModelResource('models/gemini-3.1-flash-live-preview')).toBe('models/gemini-3.1-flash-live-preview');
    expect(toLiveModelResource(' gemini-2.5-flash-native-audio-preview-12-2025 ')).toBe('models/gemini-2.5-flash-native-audio-preview-12-2025');
    expect(toLiveModelResource('gemini-2.0-flash-live-001')).toBe(DEFAULT_LIVE_MODEL);
    expect(toLiveModelResource('models/gemini-1.5-pro')).toBe(DEFAULT_LIVE_MODEL);
    expect(toLiveModelResource('../../evil?key=x')).toBe(DEFAULT_LIVE_MODEL);
    expect(toLiveModelResource('')).toBe(DEFAULT_LIVE_MODEL);
    expect(toLiveModelResource(undefined)).toBe(DEFAULT_LIVE_MODEL);
    expect(setupOf(buildLiveSetup({ ...base, model: 'gemini 2.5' })).model).toBe(DEFAULT_LIVE_MODEL);
  });

  it('sends thinkingConfig to the 2.5 family only (3.8-live must omit it, 3.1 defaults to minimal)', () => {
    for (const m of ['gemini-3.8-live', 'gemini-3.1-flash-live-preview']) {
      expect('thinkingConfig' in setupOf(buildLiveSetup({ ...base, model: m })).generationConfig).toBe(false);
    }
    expect(setupOf(buildLiveSetup({ ...base, model: 'gemini-2.5-flash-native-audio-preview-12-2025' })).generationConfig.thinkingConfig)
      .toEqual({ thinkingBudget: 0 });
  });

  it('temperature: finite → clamped 0..2; missing / NaN → omitted', () => {
    expect(setupOf(buildLiveSetup({ ...base, temperature: 0.7 })).generationConfig.temperature).toBe(0.7);
    expect(setupOf(buildLiveSetup({ ...base, temperature: 9 })).generationConfig.temperature).toBe(2);
    expect(setupOf(buildLiveSetup({ ...base, temperature: -1 })).generationConfig.temperature).toBe(0);
    expect('temperature' in setupOf(buildLiveSetup({ ...base, temperature: Number.NaN })).generationConfig).toBe(false);
    expect('temperature' in setupOf(buildLiveSetup(base)).generationConfig).toBe(false);
  });

  it('voiceName: case-normalised; malformed → Aoede (a case slip must not swap gender)', () => {
    expect(setupOf(buildLiveSetup({ ...base, voiceName: 'charon' })).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Charon');
    expect(setupOf(buildLiveSetup({ ...base, voiceName: 'Kore' })).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Kore');
    expect(setupOf(buildLiveSetup({ ...base, voiceName: '<script>' })).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Aoede');
  });

  it('blank systemInstruction is omitted', () => {
    expect(setupOf(buildLiveSetup({ ...base, systemInstruction: '   ' })).systemInstruction).toBeUndefined();
  });

  it('transcribe → inputAudioTranscription + outputAudioTranscription; languageCode becomes the INPUT hint only', () => {
    const s = setupOf(buildLiveSetup({ ...base, transcribe: true, languageCode: 'ka-GE' }));
    expect(s.inputAudioTranscription).toEqual({ languageCodes: ['ka-GE'] });
    expect(s.outputAudioTranscription).toEqual({});
    // ⚠️ native-audio models do not support speechConfig.languageCode (docs 2026-09) — never emitted here.
    expect('languageCode' in s.generationConfig.speechConfig).toBe(false);
  });

  it('transcribe without / with a malformed languageCode → auto-detect ({}); languageCode without transcribe → ignored', () => {
    expect(setupOf(buildLiveSetup({ ...base, transcribe: true })).inputAudioTranscription).toEqual({});
    expect(setupOf(buildLiveSetup({ ...base, transcribe: true, languageCode: 'ka GE; drop' })).inputAudioTranscription).toEqual({});
    const s = setupOf(buildLiveSetup({ ...base, languageCode: 'ka' }));
    expect(s.inputAudioTranscription).toBeUndefined();
    expect(s.outputAudioTranscription).toBeUndefined();
  });

  it('resumptionHandle: undefined → absent; null / "" → {} (new resumable session); handle → {handle}; malformed → {}', () => {
    expect('sessionResumption' in setupOf(buildLiveSetup(base))).toBe(false);
    expect(setupOf(buildLiveSetup({ ...base, resumptionHandle: null })).sessionResumption).toEqual({});
    expect(setupOf(buildLiveSetup({ ...base, resumptionHandle: '' })).sessionResumption).toEqual({});
    expect(setupOf(buildLiveSetup({ ...base, resumptionHandle: 'Cg0xMjM0NTY3ODkwMTIz' })).sessionResumption).toEqual({ handle: 'Cg0xMjM0NTY3ODkwMTIz' });
    expect(setupOf(buildLiveSetup({ ...base, resumptionHandle: 'has space' })).sessionResumption).toEqual({});
    expect(setupOf(buildLiveSetup({ ...base, resumptionHandle: 'x'.repeat(5000) })).sessionResumption).toEqual({});
  });

  it('compression → contextWindowCompression {slidingWindow:{}}', () => {
    expect(setupOf(buildLiveSetup({ ...base, compression: true })).contextWindowCompression).toEqual({ slidingWindow: {} });
    expect(setupOf(buildLiveSetup({ ...base, compression: false })).contextWindowCompression).toBeUndefined();
  });

  it('tools: google_search → [{googleSearch:{}}] once; empty / unknown → no tools field', () => {
    expect(setupOf(buildLiveSetup({ ...base, tools: ['google_search', 'google_search'] })).tools).toEqual([{ googleSearch: {} }]);
    expect(setupOf(buildLiveSetup({ ...base, tools: [] })).tools).toBeUndefined();
    expect(setupOf(buildLiveSetup({ ...base, tools: ['code_execution' as never] })).tools).toBeUndefined();
  });

  it('tools: live_actions → the functionDeclarations block, FIRST, once; search follows it', () => {
    expect(setupOf(buildLiveSetup({ ...base, tools: ['live_actions'] })).tools).toEqual([{ functionDeclarations: LIVE_FUNCTION_DECLARATIONS }]);
    // Listed in either order, emitted declarations-then-search (the order the route tests pin).
    expect(setupOf(buildLiveSetup({ ...base, tools: ['google_search', 'live_actions', 'live_actions'] })).tools).toEqual([
      { functionDeclarations: LIVE_FUNCTION_DECLARATIONS },
      { googleSearch: {} },
    ]);
    // Survives the JSON hop to the mint and the browser unchanged.
    const msg = buildLiveSetup({ ...base, tools: ['live_actions'] });
    expect(JSON.parse(JSON.stringify(msg))).toEqual(msg);
  });

  it('every option at once is JSON-round-trip safe and carries all documented field names', () => {
    const msg = buildLiveSetup({ ...base, model: 'gemini-3.8-live', temperature: 0.7, languageCode: 'ka', resumptionHandle: 'h1', transcribe: true, compression: true, tools: ['google_search'] });
    const round = JSON.parse(JSON.stringify(msg)) as { setup: Record<string, unknown> };
    expect(round).toEqual(msg);
    expect(Object.keys(round.setup).sort()).toEqual([
      'contextWindowCompression', 'generationConfig', 'inputAudioTranscription', 'model',
      'outputAudioTranscription', 'sessionResumption', 'systemInstruction', 'tools',
    ]);
  });
});

describe('geminiLive — realtime / tool builders', () => {
  it('uses the documented realtimeInput.audio / .video / .text / audioStreamEnd fields (not mediaChunks)', () => {
    expect(buildRealtimeAudio('AAAA')).toEqual({ realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: 'AAAA' } } });
    expect(buildRealtimeVideo('BBBB')).toEqual({ realtimeInput: { video: { mimeType: 'image/jpeg', data: 'BBBB' } } });
    expect(buildRealtimeVideo('CCCC', 'image/png').realtimeInput.video.mimeType).toBe('image/png');
    expect(buildRealtimeText('გამარჯობა')).toEqual({ realtimeInput: { text: 'გამარჯობა' } });
    expect(buildAudioStreamEnd()).toEqual({ realtimeInput: { audioStreamEnd: true } });
  });

  it('buildToolResponse matches by id and drops malformed entries', () => {
    expect(buildToolResponse([
      { id: 'c1', name: 'open_studio', response: { result: 'ok' } },
      { id: 5 as unknown as string, name: 'bad', response: {} },
      null as never,
    ])).toEqual({ toolResponse: { functionResponses: [{ id: 'c1', name: 'open_studio', response: { result: 'ok' } }] } });
  });
});

describe('geminiLive — parseLiveServerMessage', () => {
  it('setupComplete', () => {
    expect(parseLiveServerMessage({ setupComplete: {} })).toEqual([{ kind: 'setupComplete' }]);
  });

  it('audio keeps its mimeType; non-audio inline data, text parts and thought parts are not surfaced', () => {
    expect(parseLiveServerMessage({
      serverContent: { modelTurn: { parts: [
        { inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'PCM' } },
        { inlineData: { mimeType: 'image/png', data: 'IMG' } },
        { text: 'thinking about it', thought: true },
        { text: 'plain text part' },
      ] } },
    })).toEqual([{ kind: 'audio', data: 'PCM', mimeType: 'audio/pcm;rate=24000' }]);
  });

  it('input / output transcripts (camelCase), with `finished` → final', () => {
    expect(parseLiveServerMessage({ serverContent: { inputTranscription: { text: 'გამარჯობა' } } }))
      .toEqual([{ kind: 'inputTranscript', text: 'გამარჯობა' }]);
    expect(parseLiveServerMessage({ serverContent: { outputTranscription: { text: 'Hi!', finished: true } } }))
      .toEqual([{ kind: 'outputTranscript', text: 'Hi!', final: true }]);
    expect(parseLiveServerMessage({ serverContent: { inputTranscription: { text: '', finished: true } } }))
      .toEqual([{ kind: 'inputTranscript', text: '', final: true }]);
    expect(parseLiveServerMessage({ serverContent: { inputTranscription: { text: '' } } })).toEqual([]);
  });

  it('interimInputTranscription is ignored (delta-vs-replacement undocumented)', () => {
    expect(parseLiveServerMessage({ serverContent: { interimInputTranscription: { text: 'გამა' } } })).toEqual([]);
  });

  it('turnComplete and interrupted', () => {
    expect(parseLiveServerMessage({ serverContent: { turnComplete: true } })).toEqual([{ kind: 'turnComplete' }]);
    expect(parseLiveServerMessage({ serverContent: { interrupted: true } })).toEqual([{ kind: 'interrupted' }]);
  });

  it('goAway.timeLeft (protobuf Duration string / object) → timeLeftMs; unparseable → no timeLeftMs', () => {
    expect(parseLiveServerMessage({ goAway: { timeLeft: '50s' } })).toEqual([{ kind: 'goAway', timeLeftMs: 50000 }]);
    expect(parseLiveServerMessage({ goAway: { timeLeft: '0.500s' } })).toEqual([{ kind: 'goAway', timeLeftMs: 500 }]);
    expect(parseLiveServerMessage({ goAway: { timeLeft: { seconds: '9', nanos: 500000000 } } })).toEqual([{ kind: 'goAway', timeLeftMs: 9500 }]);
    expect(parseLiveServerMessage({ goAway: {} })).toEqual([{ kind: 'goAway' }]);
    expect(parseLiveServerMessage({ goAway: { timeLeft: 'soon' } })).toEqual([{ kind: 'goAway' }]);
    expect(parseDurationMs('-3s')).toBeUndefined();
    expect(parseDurationMs(12)).toBeUndefined();
  });

  it('sessionResumptionUpdate {newHandle, resumable}', () => {
    expect(parseLiveServerMessage({ sessionResumptionUpdate: { newHandle: 'H1', resumable: true } }))
      .toEqual([{ kind: 'resumption', handle: 'H1', resumable: true }]);
    // proto3 JSON omits false bools; an empty handle is never resumable.
    expect(parseLiveServerMessage({ sessionResumptionUpdate: {} })).toEqual([{ kind: 'resumption', handle: '', resumable: false }]);
    expect(parseLiveServerMessage({ sessionResumptionUpdate: { newHandle: 'H2' } })).toEqual([{ kind: 'resumption', handle: 'H2', resumable: true }]);
    expect(parseLiveServerMessage({ sessionResumptionUpdate: { newHandle: 'H3', resumable: false } })).toEqual([{ kind: 'resumption', handle: 'H3', resumable: false }]);
    expect(parseLiveServerMessage({ sessionResumptionUpdate: { newHandle: 'bad handle', resumable: true } })).toEqual([{ kind: 'resumption', handle: '', resumable: false }]);
  });

  it('usageMetadata.totalTokenCount → usage; falls back to prompt + response', () => {
    expect(parseLiveServerMessage({ usageMetadata: { totalTokenCount: 321, promptTokenCount: 300, responseTokenCount: 21 } }))
      .toEqual([{ kind: 'usage', totalTokens: 321 }]);
    expect(parseLiveServerMessage({ usageMetadata: { promptTokenCount: 10, responseTokenCount: 5 } })).toEqual([{ kind: 'usage', totalTokens: 15 }]);
    expect(parseLiveServerMessage({ usageMetadata: {} })).toEqual([{ kind: 'usage' }]);
  });

  it('toolCall.functionCalls → calls; missing id tolerated, nameless dropped, args default {}', () => {
    expect(parseLiveServerMessage({ toolCall: { functionCalls: [
      { id: 'c1', name: 'open_studio', args: { tool: 'video' } },
      { name: 'no_id' },
      { id: 'c3' },
      'junk',
    ] } })).toEqual([{ kind: 'toolCall', calls: [
      { id: 'c1', name: 'open_studio', args: { tool: 'video' } },
      { id: '', name: 'no_id', args: {} },
    ] }]);
    expect(parseLiveServerMessage({ toolCall: { functionCalls: [] } })).toEqual([]);
  });

  it('error frames (string or {message}) → error, capped', () => {
    expect(parseLiveServerMessage({ error: { code: 400, message: 'Invalid setup' } })).toEqual([{ kind: 'error', message: 'Invalid setup' }]);
    expect(parseLiveServerMessage({ error: 'x'.repeat(900) })).toEqual([{ kind: 'error', message: 'x'.repeat(500) }]);
    expect(parseLiveServerMessage({ error: {} })).toEqual([{ kind: 'error', message: 'Live API error' }]);
  });

  it('multiple events from ONE frame, in playback order (interrupt first, usage after content)', () => {
    const evs = parseLiveServerMessage({
      usageMetadata: { totalTokenCount: 42 },
      serverContent: {
        turnComplete: true,
        outputTranscription: { text: 'Hello' },
        modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'A1' } }, { inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'A2' } }] },
        inputTranscription: { text: 'hi' },
        interrupted: true,
      },
    });
    expect(evs.map((e: LiveServerEvent) => e.kind)).toEqual(['interrupted', 'inputTranscript', 'audio', 'audio', 'outputTranscript', 'turnComplete', 'usage']);
  });

  it('accepts the raw JSON string of a frame', () => {
    expect(parseLiveServerMessage('{"setupComplete":{}}')).toEqual([{ kind: 'setupComplete' }]);
  });

  it('toolCallCancellation.ids → toolCallCancellation; junk ids dropped, empty → nothing, bounded', () => {
    expect(parseLiveServerMessage({ toolCallCancellation: { ids: ['c1', 'c2'] } })).toEqual([{ kind: 'toolCallCancellation', ids: ['c1', 'c2'] }]);
    expect(parseLiveServerMessage({ toolCallCancellation: { ids: ['c1', 7, '', null, 'x'.repeat(300)] } })).toEqual([{ kind: 'toolCallCancellation', ids: ['c1'] }]);
    expect(parseLiveServerMessage({ toolCallCancellation: { ids: [] } })).toEqual([]);
    expect(parseLiveServerMessage({ toolCallCancellation: { ids: 'c1' } })).toEqual([]);
    expect(parseLiveServerMessage({ toolCallCancellation: {} })).toEqual([]);
    const many = Array.from({ length: 500 }, (_, i) => `id${i}`);
    const ev = parseLiveServerMessage({ toolCallCancellation: { ids: many } })[0] as { ids: string[] };
    expect(ev.ids).toHaveLength(64);
  });

  it('unknown / not-surfaced messages → []', () => {
    expect(parseLiveServerMessage({ serverContent: { generationComplete: true, waitingForInput: true } })).toEqual([]);
    expect(parseLiveServerMessage({ somethingNew: { x: 1 } })).toEqual([]);
    expect(parseLiveServerMessage({})).toEqual([]);
  });

  it('malformed input → [] and never throws', () => {
    const hostile = new Proxy({}, { get() { throw new Error('boom'); }, has() { throw new Error('boom'); } });
    for (const bad of [null, undefined, 0, 42, true, 'nope', '{bad json', '[]', [], [1, 2], hostile,
      { serverContent: 'x' }, { serverContent: { modelTurn: { parts: 'x' } } }, { serverContent: { modelTurn: { parts: [null, 1, 'a'] } } },
      { serverContent: { inputTranscription: 'x', outputTranscription: 5 } }, { toolCall: 'x' }, { toolCall: { functionCalls: 'x' } },
      { goAway: 'x' }, { sessionResumptionUpdate: 'x' }, { usageMetadata: 'x' }, { setupComplete: null }]) {
      expect(() => parseLiveServerMessage(bad)).not.toThrow();
      expect(parseLiveServerMessage(bad)).toEqual([]);
    }
  });
});

// ─── Session wrapper with a fake WebSocket ─────────────────────────────────────

class FakeSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  static last: FakeSocket | null = null;
  readyState = FakeSocket.CONNECTING;
  binaryType = 'blob';
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  constructor(public url: string) { FakeSocket.last = this; }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close(code = 1000, reason = '') { this.readyState = FakeSocket.CLOSED; this.onclose?.({ code, reason }); }
  open() { this.readyState = FakeSocket.OPEN; this.onopen?.(); }
  receive(obj: unknown) { this.onmessage?.({ data: JSON.stringify(obj) }); }
}

describe('geminiLive — GeminiLiveSession', () => {
  const realWS = (globalThis as { WebSocket?: unknown }).WebSocket;
  beforeEach(() => { (globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket; FakeSocket.last = null; });
  afterEach(() => { (globalThis as { WebSocket?: unknown }).WebSocket = realWS; jest.useRealTimers(); });
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('LEGACY path unchanged: legacy setup frame, mediaChunks audio, legacy callbacks', async () => {
    const onSetupComplete = jest.fn(); const onAudio = jest.fn(); const onTurnComplete = jest.fn();
    const s = new GeminiLiveSession({ token: 't', voiceName: 'Aoede', systemInstruction: 'x' }, { onSetupComplete, onAudio, onTurnComplete });
    s.connect();
    const ws = FakeSocket.last!;
    expect(ws.url).toContain('.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=t');
    ws.open();
    expect(ws.sent[0]).toEqual(buildSetupMessage({ token: 't', voiceName: 'Aoede', systemInstruction: 'x' }));
    ws.receive({ setupComplete: {} });
    await flush();
    expect(onSetupComplete).toHaveBeenCalledTimes(1);
    expect(s.isReady).toBe(true);
    s.sendAudioChunk('AAAA');
    expect(ws.sent[1]).toEqual(buildAudioMessage('AAAA'));
    ws.receive({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'P' } }] }, turnComplete: true } });
    await flush();
    expect(onAudio).toHaveBeenCalledWith('P');
    expect(onTurnComplete).toHaveBeenCalledTimes(1);
  });

  it('setupMessage override is sent verbatim (a bare setup payload is wrapped); realtime format uses realtimeInput.audio', async () => {
    const setup = buildLiveSetup({ ...base, transcribe: true, resumptionHandle: null });
    const s = new GeminiLiveSession({ token: 't', setupMessage: setup.setup, realtimeInputFormat: 'realtime' });
    s.connect();
    const ws = FakeSocket.last!;
    ws.open();
    expect(ws.sent[0]).toEqual(setup);
    ws.receive({ setupComplete: {} });
    await flush();
    s.sendAudioChunk('AAAA');
    s.sendVideoFrame('VVVV');
    s.sendText('hi');
    s.endAudioStream();
    s.sendToolResponse([{ id: 'c1', name: 'f', response: { ok: true } }]);
    expect(ws.sent.slice(1)).toEqual([
      buildRealtimeAudio('AAAA'), buildRealtimeVideo('VVVV'), buildRealtimeText('hi'), buildAudioStreamEnd(),
      buildToolResponse([{ id: 'c1', name: 'f', response: { ok: true } }]),
    ]);
  });

  it('holds mic audio spoken before setupComplete (bounded) and flushes it in order after; drops early video', async () => {
    const s = new GeminiLiveSession({ token: 't' });
    s.connect();
    const ws = FakeSocket.last!;
    ws.open();
    for (let i = 0; i < 70; i++) s.sendAudioChunk(`c${i}`);
    s.sendVideoFrame('early');
    s.sendText('early');
    expect(ws.sent).toHaveLength(1); // setup only — nothing before setupComplete
    ws.receive({ setupComplete: {} });
    await flush();
    const audio = ws.sent.slice(1) as Array<{ realtimeInput: { mediaChunks: Array<{ data: string }> } }>;
    expect(audio).toHaveLength(64);
    expect(audio[0]!.realtimeInput.mediaChunks[0]!.data).toBe('c6');
    expect(audio[63]!.realtimeInput.mediaChunks[0]!.data).toBe('c69');
  });

  it('onEvent receives parity events and the session tracks the latest resumable handle', async () => {
    const events: LiveServerEvent[] = [];
    const s = new GeminiLiveSession({ token: 't' }, { onEvent: (e) => events.push(e) });
    s.connect();
    const ws = FakeSocket.last!;
    ws.open();
    ws.receive({ setupComplete: {} });
    ws.receive({ sessionResumptionUpdate: { newHandle: 'H1', resumable: true } });
    ws.receive({ sessionResumptionUpdate: { resumable: false } });
    ws.receive({ serverContent: { outputTranscription: { text: 'გამარჯობა' } } });
    ws.receive({ goAway: { timeLeft: '10s' } });
    await flush();
    expect(events).toEqual([
      { kind: 'setupComplete' },
      { kind: 'resumption', handle: 'H1', resumable: true },
      { kind: 'resumption', handle: '', resumable: false },
      { kind: 'outputTranscript', text: 'გამარჯობა' },
      { kind: 'goAway', timeLeftMs: 10000 },
    ]);
    expect(s.resumptionHandle).toBe('H1'); // a non-resumable update never clobbers the last good handle
  });

  it('setupTimeoutMs fails a hung handshake with onError and closes; off by default', () => {
    jest.useFakeTimers();
    const onError = jest.fn(); const onClose = jest.fn();
    const s = new GeminiLiveSession({ token: 't', setupTimeoutMs: 5000 }, { onError, onClose });
    s.connect();
    FakeSocket.last!.open();
    jest.advanceTimersByTime(4999);
    expect(onError).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onError).toHaveBeenCalledWith('Live setup timed out');
    expect(onClose).toHaveBeenCalled();
    expect(s.isClosed).toBe(true);

    const onError2 = jest.fn();
    new GeminiLiveSession({ token: 't' }, { onError: onError2 }).connect();
    FakeSocket.last!.open();
    jest.advanceTimersByTime(60_000);
    expect(onError2).not.toHaveBeenCalled();
  });

  it('a superseded socket\'s late close / frames never touch the reconnected socket', async () => {
    const onClose = jest.fn(); const onAudio = jest.fn(); const onError = jest.fn();
    const s = new GeminiLiveSession({ token: 't' }, { onClose, onAudio, onError });
    s.connect();
    const ws1 = FakeSocket.last!;
    ws1.open();
    ws1.close = () => { ws1.readyState = FakeSocket.CLOSED; }; // real sockets report onclose a macrotask later
    s.close();
    s.connect();
    const ws2 = FakeSocket.last!;
    expect(ws2).not.toBe(ws1);
    ws2.open();
    ws2.receive({ setupComplete: {} });
    await flush();
    // The OLD socket now reports its close, an error and a stale audio frame.
    ws1.onclose?.({ code: 1000, reason: 'client closed' });
    ws1.onerror?.();
    ws1.receive({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'STALE' } }] } } });
    await flush();
    expect(onClose).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onAudio).not.toHaveBeenCalled();
    expect(s.isReady).toBe(true);
    s.sendAudioChunk('AAAA');
    expect(ws2.sent[ws2.sent.length - 1]).toEqual(buildAudioMessage('AAAA'));
    // A client close() of the CURRENT socket still reports onClose (today's contract).
    s.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('no credential → onError, no socket', () => {
    const onError = jest.fn();
    new GeminiLiveSession({}, { onError }).connect();
    expect(onError).toHaveBeenCalled();
    expect(FakeSocket.last).toBeNull();
  });
});
