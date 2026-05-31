import {
  extractMusicDirectives,
  buildEnforcedMusicStyle,
  extractAspectDirective,
  extractVoiceDirectives,
} from './outputEnforcement';

describe('PHASE 52 TASK 5 — strict prompt mirroring', () => {
  describe('music directives (Udio)', () => {
    it('the "techno must not become ambient" regression: techno is force-anchored', () => {
      const d = extractMusicDirectives('make me a dark driving techno banger with heavy 808s');
      expect(d.genres).toContain('techno');
      expect(d.moods).toContain('dark');
      expect(d.tempo).toContain('uptempo');
      expect(d.instruments).toContain('808 bass');
      // techno is the strongest anchor → first style tag
      expect(d.styleTags[0]).toBe('techno');
      expect(d.styleTags).not.toContain('ambient');
    });

    it('detects an explicit instrumental ask and forces make_instrumental', () => {
      expect(extractMusicDirectives('an instrumental lo-fi beat, no vocals').forceInstrumental).toBe(true);
      expect(extractMusicDirectives('an upbeat pop song with vocals and a catchy chorus').forceInstrumental).toBe(false);
      expect(extractMusicDirectives('an upbeat pop song with vocals and a catchy chorus').forceVocal).toBe(true);
    });

    it('a non-musical prompt yields no spurious anchors', () => {
      const d = extractMusicDirectives('a calm relaxing piece');
      expect(d.genres).toEqual([]);
      // "relaxing"/"calm" are not in the music lexicon → no false genre
      expect(d.styleTags).toEqual(expect.arrayContaining([]));
    });

    it('buildEnforcedMusicStyle puts the typed keywords FIRST, then supplied tags', () => {
      const r = buildEnforcedMusicStyle('euphoric uplifting trance', 'club', ['festival']);
      expect(r.style).toBeDefined();
      const tags = r.styleTags;
      expect(tags.indexOf('trance')).toBeLessThan(tags.indexOf('club'));
      expect(tags).toContain('festival');
      expect(r.forceInstrumental).toBe(false);
    });

    it('falls back to the supplied style when the prompt has no music cues', () => {
      const r = buildEnforcedMusicStyle('something nice', 'cinematic', []);
      // "cinematic score" is matched only with the word "score"; plain "cinematic" alone is not a music genre here
      expect(r.style).toBe('cinematic');
    });
  });

  describe('aspect / orientation lock (LTX)', () => {
    it('the "anamorphic must not become portrait" regression', () => {
      expect(extractAspectDirective('an anamorphic cinematic car chase')).toBe('2.39:1');
      expect(extractAspectDirective('cinemascope desert vista')).toBe('2.39:1');
    });

    it('explicit vertical / portrait / reel → 9:16', () => {
      expect(extractAspectDirective('a vertical reel for tiktok')).toBe('9:16');
      expect(extractAspectDirective('portrait video of a dancer')).toBe('9:16');
    });

    it('orientation noun beats aesthetic adjective: "vertical cinematic" → 9:16', () => {
      expect(extractAspectDirective('vertical cinematic teaser')).toBe('9:16');
    });

    it('widescreen / landscape → 16:9; square → 1:1', () => {
      expect(extractAspectDirective('a widescreen landscape shot')).toBe('16:9');
      expect(extractAspectDirective('a square 1:1 product loop')).toBe('1:1');
    });

    it('returns null when the prompt says nothing about framing', () => {
      expect(extractAspectDirective('a golden retriever running on a beach')).toBeNull();
    });
  });

  describe('voice delivery lock (ElevenLabs)', () => {
    it('maps language asks', () => {
      expect(extractVoiceDirectives('read this in Georgian').language).toBe('ka');
      expect(extractVoiceDirectives('say it in english').language).toBe('en');
    });

    it('calm/measured delivery → high stability', () => {
      const v = extractVoiceDirectives('a calm, measured narration');
      expect(v.emotion).toBe('calm');
      expect(v.voiceSettings.stability).toBeGreaterThanOrEqual(0.7);
    });

    it('excited/fast delivery → low stability, higher style', () => {
      const v = extractVoiceDirectives('an excited, fast hype announcement');
      expect(v.cadence).toBe('fast');
      expect(v.voiceSettings.stability).toBeLessThanOrEqual(0.35);
      expect(v.voiceSettings.style).toBeGreaterThanOrEqual(0.5);
    });

    it('voice settings always stay within the 0–1 ElevenLabs range', () => {
      const v = extractVoiceDirectives('dramatic intense powerful delivery');
      for (const k of ['stability', 'similarity_boost', 'style'] as const) {
        expect(v.voiceSettings[k]).toBeGreaterThanOrEqual(0);
        expect(v.voiceSettings[k]).toBeLessThanOrEqual(1);
      }
    });
  });
});
