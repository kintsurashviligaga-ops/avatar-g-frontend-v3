/** @jest-environment node */
import { buildLiveSetup } from '@/lib/voice/geminiLive';
import { buildPhoneLiveSetup, PHONE_COMPRESSION } from './phoneSetup';

const base = { model: 'gemini-2.5-flash-native-audio-latest', locale: 'ka' as const, platformSystem: 'PLATFORM', memoryBlock: 'MEMORY', scope: 'service' as const, supportEmail: 'help@example.com' };

describe('WhatsApp call Live setup (server-built, locked into the token)', () => {
  it('one brain: the platform prompt and memory first, the phone rule last', () => {
    const { setup } = buildPhoneLiveSetup(base);
    const text = setup.systemInstruction!.parts[0]!.text;
    expect(text.indexOf('PLATFORM')).toBe(0);
    expect(text.indexOf('MEMORY')).toBeGreaterThan(0);
    expect(text.endsWith('offer to end the call.')).toBe(true);
    expect(text).toContain('help@example.com');
  });

  it('phone tools only: no screen actions, no Google Search', () => {
    const { setup } = buildPhoneLiveSetup(base);
    expect(setup.tools).toHaveLength(1);
    const block = setup.tools![0]!;
    expect('functionDeclarations' in block && block.functionDeclarations.map((d) => d.name)).toEqual(['account_summary', 'task_status', 'stop_task', 'send_result', 'call_me_when_ready', 'end_call']);
    expect(JSON.stringify(setup)).not.toContain('googleSearch');
    const creative = buildPhoneLiveSetup({ ...base, scope: 'creative' }).setup.tools![0]!;
    expect('functionDeclarations' in creative && creative.functionDeclarations.map((d) => d.name)).toContain('start_order');
  });

  it('transcribes in the caller\'s language, compresses explicitly, is resumable', () => {
    const { setup } = buildPhoneLiveSetup(base);
    expect(setup.inputAudioTranscription).toEqual({ languageCodes: ['ka-GE'] });
    expect(setup.outputAudioTranscription).toEqual({});
    expect(setup.contextWindowCompression).toEqual({ triggerTokens: PHONE_COMPRESSION.triggerTokens, slidingWindow: { targetTokens: PHONE_COMPRESSION.targetTokens } });
    expect(setup.sessionResumption).toEqual({});
    expect(buildPhoneLiveSetup({ ...base, locale: 'ru', resumptionHandle: 'h-123' }).setup).toMatchObject({ inputAudioTranscription: { languageCodes: ['ru-RU'] }, sessionResumption: { handle: 'h-123' } });
  });

  it('an unlisted model falls back to the default (allowlist stays in charge)', () => {
    expect(buildPhoneLiveSetup({ ...base, model: 'gemini-1.5-pro' }).setup.model).toBe('models/gemini-2.5-flash-native-audio-latest');
  });
});

describe('buildLiveSetup compression and own declarations stay backward compatible', () => {
  const common = { model: 'gemini-2.5-flash-native-audio-latest', systemInstruction: 'x', voiceName: 'Aoede' };
  it('`compression: true` is still Google\'s defaults; a malformed pair falls back to them', () => {
    expect(buildLiveSetup({ ...common, compression: true }).setup.contextWindowCompression).toEqual({ slidingWindow: {} });
    expect(buildLiveSetup({ ...common, compression: { triggerTokens: 100, targetTokens: 50 } }).setup.contextWindowCompression).toEqual({ slidingWindow: {} });
    expect(buildLiveSetup({ ...common, compression: { triggerTokens: 8000, targetTokens: 9000 } }).setup.contextWindowCompression).toEqual({ slidingWindow: {} });
    expect(buildLiveSetup(common).setup.contextWindowCompression).toBeUndefined();
  });
  it('the UI actions are unchanged when no own list is given; an own list replaces them', () => {
    const ui = buildLiveSetup({ ...common, tools: ['live_actions', 'google_search'] }).setup.tools!;
    expect(ui).toHaveLength(2);
    expect('functionDeclarations' in ui[0]! && ui[0].functionDeclarations.length).toBeGreaterThan(3);
    const own = buildLiveSetup({ ...common, tools: ['live_actions'], functionDeclarations: [{ name: 'only_me', description: 'd' }] }).setup.tools!;
    expect(own).toEqual([{ functionDeclarations: [{ name: 'only_me', description: 'd' }] }]);
  });
});
