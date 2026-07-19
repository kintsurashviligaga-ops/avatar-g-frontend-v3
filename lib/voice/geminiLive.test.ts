import {
  buildSetupMessage, buildAudioMessage, buildVideoMessage, buildLiveUrl,
  parseLiveServerEvents, DEFAULT_LIVE_MODEL,
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
