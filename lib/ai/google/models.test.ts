import { DEFAULT_LIVE_MODEL as GEMINI_LIVE_WIRE_DEFAULT } from '@/lib/voice/geminiLive';

import {
  DEFAULT_CHAT_MODELS,
  DEFAULT_LIVE_MODEL,
  DEFAULT_STT_MODEL,
  DEFAULT_TTS_MODEL,
  LIVE_MODELS,
  STT_MODELS,
  TRANSCRIBE_LIVE_MODEL,
  TTS_MODELS,
  chatModelChain,
  defaultLiveModel,
  isRetiredModel,
  normalizeModelId,
  parseModelList,
  resolveLiveModel,
  sttModel,
  toModelResource,
  ttsModel,
  type ChatTier,
} from './models';

const ENV_KEYS = [
  'GEMINI_CHAT_MODELS',
  'GEMINI_CHAT_PRO_MODELS',
  'GEMINI_LIVE_MODEL',
  'GEMINI_TTS_MODEL',
  'GEMINI_STT_MODEL',
  'VOICE_V2V_GEMINI_MODEL',
] as const;

const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

describe('catalogue self-check', () => {
  it('every catalogued id is a well-formed, non-retired bare id', () => {
    const all = [
      ...DEFAULT_CHAT_MODELS.standard,
      ...DEFAULT_CHAT_MODELS.pro,
      ...LIVE_MODELS,
      ...TTS_MODELS,
      ...STT_MODELS,
      TRANSCRIBE_LIVE_MODEL,
    ];
    for (const id of all) {
      expect(id).toMatch(ID_RE);
      expect(isRetiredModel(id)).toBe(false);
    }
  });

  it('the defaults are members of their own allowlists', () => {
    expect(LIVE_MODELS).toContain(DEFAULT_LIVE_MODEL);
    expect(TTS_MODELS).toContain(DEFAULT_TTS_MODEL);
    expect(STT_MODELS).toContain(DEFAULT_STT_MODEL);
  });

  it('DEFAULT_LIVE_MODEL is the same model lib/voice/geminiLive.ts puts on the wire today', () => {
    expect(DEFAULT_LIVE_MODEL).toBe('gemini-2.5-flash-native-audio-latest');
    expect(GEMINI_LIVE_WIRE_DEFAULT.replace(/^models\//, '')).toBe(DEFAULT_LIVE_MODEL);
  });

  it('the Live-style transcription model is not offered to the generateContent STT path', () => {
    expect(STT_MODELS).not.toContain(TRANSCRIBE_LIVE_MODEL);
  });
});

describe('isRetiredModel', () => {
  it.each([
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash-live-001',
    'gemini-1.5-pro',
    'gemini-1.5-flash-002',
    'gemini-1.0-pro',
    'models/gemini-2.0-flash',
    'GEMINI-1.5-FLASH',
    'gemini-pro',
    'gemini-pro-vision',
  ])('%p is retired', (id) => {
    expect(isRetiredModel(id)).toBe(true);
  });

  it.each([
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-3.8-flash',
    'gemini-pro-latest',
    'gemini-flash-latest',
    'gemini-2.5-flash-native-audio-latest',
    'gemini-2.05-flash',
    'gemini-20-flash',
  ])('%p is not retired', (id) => {
    expect(isRetiredModel(id)).toBe(false);
  });
});

describe('normalizeModelId', () => {
  it('trims and strips one models/ prefix', () => {
    expect(normalizeModelId('  models/gemini-3.8-flash ')).toBe('gemini-3.8-flash');
    expect(normalizeModelId('gemini-2.5-flash')).toBe('gemini-2.5-flash');
  });

  it.each([
    '',
    '   ',
    'gemini 3 flash',
    '../etc/passwd',
    'models/x/y',
    'gemini-3.8-flash:generateContent',
    'gemini-3.8-flash?key=abc',
    '-leading-dash',
    '.hidden',
    'a'.repeat(129),
  ])('rejects malformed %p', (raw) => {
    expect(normalizeModelId(raw)).toBeNull();
  });

  it('trims surrounding whitespace (a trailing newline from a pasted env value) to a valid id', () => {
    expect(normalizeModelId('gemini-3.8-flash\n')).toBe('gemini-3.8-flash');
  });

  it('rejects non-strings', () => {
    expect(normalizeModelId(undefined)).toBeNull();
    expect(normalizeModelId(null)).toBeNull();
    expect(normalizeModelId(42)).toBeNull();
    expect(normalizeModelId({ id: 'gemini-3.8-flash' })).toBeNull();
  });

  it('accepts exactly 128 characters', () => {
    expect(normalizeModelId('a'.repeat(128))).toBe('a'.repeat(128));
  });
});

describe('toModelResource', () => {
  it('prefixes a bare id and is idempotent', () => {
    expect(toModelResource('gemini-2.5-flash-native-audio-latest')).toBe('models/gemini-2.5-flash-native-audio-latest');
    expect(toModelResource('models/gemini-3.8-live')).toBe('models/gemini-3.8-live');
  });

  it('round-trips the Live default to the exact string geminiLive.ts uses on the wire', () => {
    expect(toModelResource(resolveLiveModel())).toBe(GEMINI_LIVE_WIRE_DEFAULT);
  });
});

describe('parseModelList', () => {
  it('splits on commas, semicolons and newlines, not spaces', () => {
    expect(parseModelList('gemini-3.8-flash, gemini-3.7-flash;gemini-2.5-flash\ngemini-2.5-pro')).toEqual([
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
    ]);
    expect(parseModelList('gemini 3 flash')).toEqual([]);
  });

  it('dedupes (first wins) and caps the chain at 6', () => {
    expect(parseModelList('a1,a2,a1,a3,a4,a5,a6,a7,a8')).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
  });

  it('returns [] for unset / empty input', () => {
    expect(parseModelList(undefined)).toEqual([]);
    expect(parseModelList(null)).toEqual([]);
    expect(parseModelList('')).toEqual([]);
    expect(parseModelList(' , ; ')).toEqual([]);
  });
});

describe('chatModelChain', () => {
  it('returns the standard default chain', () => {
    expect(chatModelChain('standard')).toEqual(['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-2.5-flash']);
  });

  it('returns the pro default chain', () => {
    expect(chatModelChain('pro')).toEqual(['gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-3.8-flash']);
  });

  it('treats an unknown tier as standard', () => {
    expect(chatModelChain('ultra' as unknown as ChatTier)).toEqual([...DEFAULT_CHAT_MODELS.standard]);
  });

  it('returns a fresh array each call (callers may mutate it)', () => {
    const a = chatModelChain('standard');
    a.push('mutated');
    a.shift();
    expect(chatModelChain('standard')).toEqual(['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-2.5-flash']);
    expect(DEFAULT_CHAT_MODELS.standard).toEqual(['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-2.5-flash']);
  });

  it('GEMINI_CHAT_MODELS overrides the standard chain only', () => {
    process.env.GEMINI_CHAT_MODELS = 'gemini-3.7-flash, gemini-2.5-flash-lite';
    expect(chatModelChain('standard')).toEqual(['gemini-3.7-flash', 'gemini-2.5-flash-lite']);
    expect(chatModelChain('pro')).toEqual([...DEFAULT_CHAT_MODELS.pro]);
  });

  it('GEMINI_CHAT_PRO_MODELS overrides the pro chain only', () => {
    process.env.GEMINI_CHAT_PRO_MODELS = 'gemini-pro-latest,models/gemini-2.5-pro';
    expect(chatModelChain('pro')).toEqual(['gemini-pro-latest', 'gemini-2.5-pro']);
    expect(chatModelChain('standard')).toEqual([...DEFAULT_CHAT_MODELS.standard]);
  });

  it('accepts a new, un-catalogued but well-formed id (operator list, not an allowlist)', () => {
    process.env.GEMINI_CHAT_MODELS = 'gemini-4.0-flash-preview';
    expect(chatModelChain('standard')).toEqual(['gemini-4.0-flash-preview']);
  });

  it('drops retired ids from an override', () => {
    process.env.GEMINI_CHAT_MODELS = 'gemini-2.0-flash,gemini-1.5-pro,gemini-3.8-flash,gemini-2.0-flash-lite';
    expect(chatModelChain('standard')).toEqual(['gemini-3.8-flash']);
  });

  it('ignores malformed ids in an override', () => {
    process.env.GEMINI_CHAT_MODELS = '../x, gemini 3, gemini-3.6-flash, a/b, gemini-3.5-flash?key=1';
    expect(chatModelChain('standard')).toEqual(['gemini-3.6-flash']);
  });

  it.each(['', '   ', ',,', ' ; \n '])('an empty override %p falls back to the defaults', (v) => {
    process.env.GEMINI_CHAT_MODELS = v;
    process.env.GEMINI_CHAT_PRO_MODELS = v;
    expect(chatModelChain('standard')).toEqual([...DEFAULT_CHAT_MODELS.standard]);
    expect(chatModelChain('pro')).toEqual([...DEFAULT_CHAT_MODELS.pro]);
  });

  it('an override made only of retired / malformed ids falls back to the defaults', () => {
    process.env.GEMINI_CHAT_MODELS = 'gemini-2.0-flash, bad id, gemini-1.5-flash';
    expect(chatModelChain('standard')).toEqual([...DEFAULT_CHAT_MODELS.standard]);
  });

  it('never contains a retired id', () => {
    for (const tier of ['standard', 'pro'] as const) {
      expect(chatModelChain(tier).some(isRetiredModel)).toBe(false);
    }
  });
});

describe('resolveLiveModel / defaultLiveModel', () => {
  it('no request → the default', () => {
    expect(resolveLiveModel()).toBe(DEFAULT_LIVE_MODEL);
    expect(resolveLiveModel(null)).toBe(DEFAULT_LIVE_MODEL);
    expect(resolveLiveModel('')).toBe(DEFAULT_LIVE_MODEL);
    expect(defaultLiveModel()).toBe(DEFAULT_LIVE_MODEL);
  });

  it.each([...LIVE_MODELS])('allowlisted %p resolves to itself', (id) => {
    expect(resolveLiveModel(id)).toBe(id);
  });

  it('accepts a models/ prefix and any case, returning the bare canonical id', () => {
    expect(resolveLiveModel('models/gemini-3.8-live')).toBe('gemini-3.8-live');
    expect(resolveLiveModel(' GEMINI-3.8-LIVE ')).toBe('gemini-3.8-live');
    expect(resolveLiveModel('models/gemini-2.5-flash-native-audio-latest')).toBe(DEFAULT_LIVE_MODEL);
  });

  it.each([
    'gemini-2.5-pro', // a real model, but not a Live model — the costlier-repoint threat
    'gemini-2.0-flash-live-001', // retired
    'gemini-3.8-live/../gemini-2.5-pro',
    'gemini-3.8-live?x=1',
    'some-unknown-live',
  ])('unlisted / retired / malformed %p → the default', (id) => {
    expect(resolveLiveModel(id)).toBe(DEFAULT_LIVE_MODEL);
  });

  it('ignores a non-string body value', () => {
    expect(resolveLiveModel(123 as unknown as string)).toBe(DEFAULT_LIVE_MODEL);
    expect(resolveLiveModel({ model: 'gemini-3.8-live' } as unknown as string)).toBe(DEFAULT_LIVE_MODEL);
  });

  it('GEMINI_LIVE_MODEL (allowlisted) becomes the effective default for empty AND rejected requests', () => {
    process.env.GEMINI_LIVE_MODEL = 'models/gemini-3.1-flash-live-preview';
    expect(defaultLiveModel()).toBe('gemini-3.1-flash-live-preview');
    expect(resolveLiveModel()).toBe('gemini-3.1-flash-live-preview');
    expect(resolveLiveModel('gemini-2.5-pro')).toBe('gemini-3.1-flash-live-preview');
    // an explicit allowlisted request still wins over the env default
    expect(resolveLiveModel('gemini-3.8-live')).toBe('gemini-3.8-live');
    // the exported constant is the code default and does not move with env
    expect(DEFAULT_LIVE_MODEL).toBe('gemini-2.5-flash-native-audio-latest');
  });

  it.each(['gemini-2.5-pro', 'gemini-2.0-flash-live-001', 'bad model', ''])(
    'GEMINI_LIVE_MODEL=%p (not allowlisted) is ignored',
    (v) => {
      process.env.GEMINI_LIVE_MODEL = v;
      expect(defaultLiveModel()).toBe(DEFAULT_LIVE_MODEL);
      expect(resolveLiveModel()).toBe(DEFAULT_LIVE_MODEL);
    },
  );
});

describe('ttsModel', () => {
  it('defaults to the Georgian-verified flash-preview TTS model', () => {
    expect(ttsModel()).toBe('gemini-2.5-flash-preview-tts');
  });

  it.each([...TTS_MODELS])('GEMINI_TTS_MODEL=%p (allowlisted) is honoured', (id) => {
    process.env.GEMINI_TTS_MODEL = id;
    expect(ttsModel()).toBe(id);
  });

  it('tolerates a models/ prefix (the TTS route strips it today)', () => {
    process.env.GEMINI_TTS_MODEL = 'models/gemini-3.8-flash-tts';
    expect(ttsModel()).toBe('gemini-3.8-flash-tts');
  });

  it.each(['gemini-2.5-flash', 'gemini-2.0-flash-preview-tts', 'x/y', '', '  '])(
    'GEMINI_TTS_MODEL=%p (not allowlisted / malformed / empty) → default',
    (v) => {
      process.env.GEMINI_TTS_MODEL = v;
      expect(ttsModel()).toBe(DEFAULT_TTS_MODEL);
    },
  );
});

describe('sttModel', () => {
  it('defaults to gemini-2.5-flash', () => {
    expect(sttModel()).toBe('gemini-2.5-flash');
  });

  it('GEMINI_STT_MODEL (allowlisted) is honoured', () => {
    process.env.GEMINI_STT_MODEL = 'gemini-3.8-flash';
    expect(sttModel()).toBe('gemini-3.8-flash');
  });

  it.each([
    'gemini-2.5-flash-preview-tts', // a TTS model cannot transcribe
    TRANSCRIBE_LIVE_MODEL, // Live-style; not a generateContent model
    'gemini-2.0-flash-lite', // retired (was in geminiStt.ts's list)
    'gemini flash',
    '',
  ])('GEMINI_STT_MODEL=%p (not allowlisted / retired / malformed / empty) → default', (v) => {
    process.env.GEMINI_STT_MODEL = v;
    expect(sttModel()).toBe(DEFAULT_STT_MODEL);
  });

  it('falls back to the legacy VOICE_V2V_GEMINI_MODEL when GEMINI_STT_MODEL is unset or rejected', () => {
    process.env.VOICE_V2V_GEMINI_MODEL = 'gemini-flash-latest';
    expect(sttModel()).toBe('gemini-flash-latest');
    process.env.GEMINI_STT_MODEL = 'not/valid';
    expect(sttModel()).toBe('gemini-flash-latest');
  });

  it('GEMINI_STT_MODEL wins over the legacy name', () => {
    process.env.VOICE_V2V_GEMINI_MODEL = 'gemini-flash-latest';
    process.env.GEMINI_STT_MODEL = 'gemini-3.6-flash';
    expect(sttModel()).toBe('gemini-3.6-flash');
  });

  it('a retired legacy VOICE_V2V_GEMINI_MODEL is ignored', () => {
    process.env.VOICE_V2V_GEMINI_MODEL = 'gemini-2.0-flash';
    expect(sttModel()).toBe(DEFAULT_STT_MODEL);
  });
});
