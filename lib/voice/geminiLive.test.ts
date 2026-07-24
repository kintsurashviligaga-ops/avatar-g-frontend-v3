import {
  buildSetupMessage, buildAudioMessage, buildVideoMessage, buildLiveUrl,
  parseLiveServerEvents, DEFAULT_LIVE_MODEL, GEMINI_LIVE_VOICES,
} from './geminiLive';

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
