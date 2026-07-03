import { isElevenAlignment, resolveTtsModel, DEFAULT_TTS_MODEL } from './ttsTimestamps';

describe('resolveTtsModel — Georgian TTS model config flip', () => {
  const saved = process.env.ELEVENLABS_TTS_MODEL;
  afterEach(() => {
    if (saved === undefined) delete process.env.ELEVENLABS_TTS_MODEL;
    else process.env.ELEVENLABS_TTS_MODEL = saved;
  });

  it('falls back to the documented default', () => {
    delete process.env.ELEVENLABS_TTS_MODEL;
    expect(resolveTtsModel()).toBe(DEFAULT_TTS_MODEL);
    expect(DEFAULT_TTS_MODEL).toBe('eleven_multilingual_v2');
  });
  it('env override beats the default', () => {
    process.env.ELEVENLABS_TTS_MODEL = 'eleven_v3';
    expect(resolveTtsModel()).toBe('eleven_v3');
  });
  it('per-call override beats env + default, and is trimmed', () => {
    process.env.ELEVENLABS_TTS_MODEL = 'eleven_v3';
    expect(resolveTtsModel('  eleven_turbo_v2_5 ')).toBe('eleven_turbo_v2_5');
  });
  it('ignores empty/whitespace override + env', () => {
    process.env.ELEVENLABS_TTS_MODEL = '   ';
    expect(resolveTtsModel('  ')).toBe(DEFAULT_TTS_MODEL);
  });
});

describe('with-timestamps alignment shape guard (STEP 2.6)', () => {
  it('accepts the real ElevenLabs with-timestamps shape', () => {
    expect(isElevenAlignment({ characters: ['a'], character_start_times_seconds: [0], character_end_times_seconds: [0.1] })).toBe(true);
  });
  it('rejects malformed / empty shapes', () => {
    expect(isElevenAlignment(null)).toBe(false);
    expect(isElevenAlignment({ characters: [] , character_start_times_seconds: [], character_end_times_seconds: [] })).toBe(false);
    expect(isElevenAlignment({ characters: ['a'] })).toBe(false);
    expect(isElevenAlignment({ text: 'x' })).toBe(false);
  });
});
