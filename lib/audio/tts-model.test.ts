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
    it('uses NATURAL, expressive settings for multilingual (not a flat/robotic read)', () => {
      const s = voiceSettingsForModel('eleven_multilingual_v2');
      // Stability sits in the human/expressive band (too high = monotone/robotic;
      // too low = vowel warble). speaker_boost keeps presence.
      expect(s.stability).toBeGreaterThanOrEqual(0.35);
      expect(s.stability).toBeLessThanOrEqual(0.6);
      // `style` is intentionally LOW for Georgian: on the non-native multilingual
      // voice a high `style` OVER-exaggerates prosody and reads artificial/robotic;
      // ElevenLabs `style` adds artifacts as it rises, so low-resource Georgian
      // sounds far more human at ~0.18. Keep it in the calm 0..0.3 band (not 0).
      expect(s.style).toBeGreaterThan(0);
      expect(s.style).toBeLessThanOrEqual(0.3);
      expect(s.use_speaker_boost).toBe(true);
    });

    it('keeps turbo expressive + present too', () => {
      const s = voiceSettingsForModel('eleven_turbo_v2_5');
      expect(s.stability).toBeLessThanOrEqual(0.6);
      expect(s.use_speaker_boost).toBe(true);
    });
  });
});
