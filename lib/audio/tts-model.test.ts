import {
  isGeorgianText,
  selectTtsModel,
  voiceSettingsForModel,
} from './tts-model';

describe('TTS model selection — PHASE 48 §3 Georgian phoneme fix', () => {
  describe('isGeorgianText', () => {
    it('detects Georgian script anywhere in the text', () => {
      expect(isGeorgianText('გამარჯობა')).toBe(true);
      expect(isGeorgianText('hello გამარჯობა world')).toBe(true);
    });

    it('honors an explicit ka locale even for non-Georgian text', () => {
      expect(isGeorgianText('hello', 'ka')).toBe(true);
      expect(isGeorgianText('hello', 'ka-GE')).toBe(true);
    });

    it('is false for plain English / other scripts without a ka locale', () => {
      expect(isGeorgianText('hello world')).toBe(false);
      expect(isGeorgianText('привет', 'ru')).toBe(false);
      expect(isGeorgianText('', null)).toBe(false);
    });
  });

  describe('selectTtsModel', () => {
    it('HARD-FORCES eleven_multilingual_v2 for Georgian text', () => {
      // The production bug: turbo (English-first) mangled Georgian phonemes.
      expect(selectTtsModel('გამარჯობა, როგორ ხარ?')).toBe('eleven_multilingual_v2');
    });

    it('forces multilingual when the ka locale is set even if text is latin', () => {
      expect(selectTtsModel('saxli', 'ka')).toBe('eleven_multilingual_v2');
    });

    it('keeps the low-latency turbo model for English', () => {
      expect(selectTtsModel('Hello, how are you?')).toBe('eleven_turbo_v2_5');
    });
  });

  describe('voiceSettingsForModel', () => {
    it('uses higher stability for multilingual so Georgian vowels do not warble', () => {
      const s = voiceSettingsForModel('eleven_multilingual_v2');
      expect(s.stability).toBeGreaterThanOrEqual(0.8);
      expect(s.use_speaker_boost).toBe(true);
    });

    it('keeps the snappier default for turbo', () => {
      const s = voiceSettingsForModel('eleven_turbo_v2_5');
      expect(s.stability).toBeCloseTo(0.75);
    });
  });
});
