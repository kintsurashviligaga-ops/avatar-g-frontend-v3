import { classifyIntent, photoAction, photoActions, audioAction, isImperativeCommand } from './agentG';

describe('Agent G — classifyIntent', () => {
  describe('with an attached asset (workspace fixed by kind)', () => {
    it('routes an image + "remove background" → PHOTO_STUDIO / remove_bg (ka)', () => {
      const d = classifyIntent('მოაშორე ფონი ამ სურათს', 'image');
      expect(d.route).toBe('PHOTO_STUDIO');
      expect(d.mode).toBe('photo');
      expect(d.action).toBe('remove_bg');
    });
    it('routes an image + "colorize" → colorize (en)', () => {
      const d = classifyIntent('please colorize this old photo', 'image');
      expect(d.route).toBe('PHOTO_STUDIO');
      expect(d.action).toBe('colorize');
    });
    it('routes an image + "upscale/quality" → upscale (ru)', () => {
      const d = classifyIntent('улучши качество и апскейл', 'image');
      expect(d.action).toBe('upscale');
    });
    it('routes an image + "restore face" → face_restore', () => {
      expect(classifyIntent('restore the face in this picture', 'image').action).toBe('face_restore');
    });
    it('routes audio + "karaoke" → AUDIO_STUDIO / splitter', () => {
      const d = classifyIntent('გააკეთე კარაოკე', 'audio');
      expect(d.route).toBe('AUDIO_STUDIO');
      expect(d.action).toBe('splitter');
    });
    it('routes audio + "de-noise" → vocal_isolation', () => {
      expect(classifyIntent('remove the background noise', 'audio').action).toBe('vocal_isolation');
    });
    it('routes video + "trim" → VIDEO_EDITOR with no auto-action (manual NLE)', () => {
      const d = classifyIntent('გაჭერი ეს ვიდეო', 'video');
      expect(d.route).toBe('VIDEO_EDITOR');
      expect(d.mode).toBe('video');
      expect(d.action).toBeNull();
    });
    it('an attached image + a non-edit question mentioning "background" → CLARIFY (verb-gated, no hijack)', () => {
      // "background" is a NOUN; with no edit verb this is a question, not an edit → must stay conversational.
      const d = classifyIntent('what is in the background of this photo?', 'image');
      expect(d.route).toBe('CLARIFY');
      expect(d.mode).toBeNull();
    });
    it('an attached image + pure "describe this" → CLARIFY', () => {
      const d = classifyIntent('describe this image for me', 'image');
      expect(d.route).toBe('CLARIFY');
      expect(d.mode).toBeNull();
    });
  });

  describe('without an asset (workspace inferred from keywords)', () => {
    it('classifies a photo edit ask → PHOTO_STUDIO', () => {
      const d = classifyIntent('მინდა ფონი მოვაშორო', null);
      expect(d.route).toBe('PHOTO_STUDIO');
    });
    it('classifies a vocal split ask → AUDIO_STUDIO / splitter', () => {
      const d = classifyIntent('split the vocals from the instrumental');
      expect(d.route).toBe('AUDIO_STUDIO');
      expect(d.action).toBe('splitter');
    });
    it('a bare "make me some music" is NOT hijacked into audio editing', () => {
      const d = classifyIntent('generate some epic lofi music');
      expect(d.route).toBe('CLARIFY'); // no edit verb → not an edit intent
    });
    it('an empty / ambiguous prompt → CLARIFY', () => {
      expect(classifyIntent('', null).route).toBe('CLARIFY');
      expect(classifyIntent('hello there', null).route).toBe('CLARIFY');
    });
  });

  // Regression: substring / bare-stem matching previously HIJACKED ordinary chat about an attached photo and could
  // even auto-charge. Whole-word (Latin/Cyrillic) + preverb-prefixed (Georgian) matching must keep these CLARIFY.
  describe('no false-positive hijack (whole-word + prefixed stems)', () => {
    it('ka compliment "რა ლამაზი ფერადი ფოტოა" (colorful photo) → CLARIFY, not colorize', () => {
      expect(classifyIntent('რა ლამაზი ფერადი ფოტოა', 'image').route).toBe('CLARIFY');
    });
    it('en "I love the muted tones" → CLARIFY (muted ≠ mute)', () => {
      expect(classifyIntent('I love the muted tones in this photo', 'image').route).toBe('CLARIFY');
    });
    it('en "is that a pencil sharpener?" → CLARIFY (sharpener ≠ sharpen)', () => {
      expect(classifyIntent('is that a pencil sharpener on the desk', 'image').route).toBe('CLARIFY');
      expect(photoAction('is that a pencil sharpener on the desk')).toBeNull();
    });
    it('ka "ეს ფოტო ბაზარდან არის" (from the market) → CLARIFY (ბაზარდან ≠ გაზარდ)', () => {
      expect(classifyIntent('ეს ფოტო ბაზარდან არის', 'image').route).toBe('CLARIFY');
    });
    it('ka "ვფიქრობ ეს უმჯობესია" (it is better) → CLARIFY (უმჯობესია ≠ გააუმჯობეს)', () => {
      expect(classifyIntent('ვფიქრობ ეს ვარიანტი უმჯობესია', 'image').route).toBe('CLARIFY');
    });
    it('ka "აქ ლამაზი ჭერი ჩანს" (a nice ceiling) → CLARIFY (ჭერი ≠ გაჭერ)', () => {
      expect(classifyIntent('აქ ლამაზი ჭერი ჩანს', 'video').route).toBe('CLARIFY');
    });
  });

  describe('recall — common phrasings that SHOULD route', () => {
    it('"cut this video in half" → VIDEO_EDITOR', () => {
      expect(classifyIntent('cut this video in half', 'video').route).toBe('VIDEO_EDITOR');
    });
    it('"clean up the background noise" → AUDIO_STUDIO / vocal_isolation', () => {
      const d = classifyIntent('clean up the background noise in this recording', 'audio');
      expect(d.route).toBe('AUDIO_STUDIO');
      expect(d.action).toBe('vocal_isolation');
    });
    it('"haircut" / "muted" do NOT trigger (whole-word)', () => {
      expect(classifyIntent('nice haircut in this photo', 'image').route).toBe('CLARIFY');
    });
  });

  describe('isImperativeCommand (auto-run gate)', () => {
    it('true for real commands', () => {
      expect(isImperativeCommand('remove the background')).toBe(true);
      expect(isImperativeCommand('მოაშორე ფონი')).toBe(true);
      expect(isImperativeCommand('please remove the bg')).toBe(true);
      expect(isImperativeCommand('isolate the vocals')).toBe(true); // "is " lead must not block "isolate"
    });
    it('false for questions / hypotheticals (never auto-charge)', () => {
      expect(isImperativeCommand('should I delete this photo?')).toBe(false);
      expect(isImperativeCommand('can you enhance my understanding of this?')).toBe(false);
      expect(isImperativeCommand('what should I do with this image')).toBe(false);
      expect(isImperativeCommand('რა ლამაზი ფოტოა')).toBe(false);
    });
  });

  describe('multi-action chaining (compound prompts)', () => {
    it('ka "მოაშორე ფონი და გაზარდე ხარისხი" → [remove_bg, upscale]', () => {
      const d = classifyIntent('მოაშორე ფონი და გაზარდე ხარისხი', 'image');
      expect(d.route).toBe('PHOTO_STUDIO');
      expect(d.actions).toEqual(['remove_bg', 'upscale']);
      expect(d.action).toBe('remove_bg'); // back-compat: first of the chain
    });
    it('en "remove the background and upscale" → [remove_bg, upscale]', () => {
      expect(classifyIntent('remove the background and upscale', 'image').actions).toEqual(['remove_bg', 'upscale']);
    });
    it('en "remove bg, colorize, then upscale" (3-link, comma + then) preserves order', () => {
      expect(photoActions('remove bg, colorize, then upscale')).toEqual(['remove_bg', 'colorize', 'upscale']);
    });
    it('a single action yields a one-element chain', () => {
      const d = classifyIntent('colorize this', 'image');
      expect(d.actions).toEqual(['colorize']);
    });
    it('de-dupes repeated actions preserving first position', () => {
      expect(photoActions('upscale and enhance the quality')).toEqual(['upscale']);
    });
    it('CLARIFY / video carry an empty chain', () => {
      expect(classifyIntent('describe this', 'image').actions).toEqual([]);
      expect(classifyIntent('trim this', 'video').actions).toEqual([]);
    });
    // Regression: a noun-only clause must NOT inject a spurious (billed, destructive) link.
    it('"upscale the photo and keep the background" → [upscale] only (never remove_bg)', () => {
      expect(photoActions('upscale the photo and keep the background')).toEqual(['upscale']);
      expect(classifyIntent('upscale the photo and keep the background', 'image').actions).toEqual(['upscale']);
    });
    it('"upscale this and leave her face alone" → [upscale] only (never face_restore)', () => {
      expect(photoActions('upscale this and leave her face alone')).toEqual(['upscale']);
    });
    it('ka "გააფერადე მაგრამ ფონი დატოვე" (colorize but keep the background) → [colorize] only', () => {
      expect(photoActions('გააფერადე მაგრამ ფონი დატოვე')).toEqual(['colorize']);
    });
  });

  describe('action mappers', () => {
    it('photoAction maps background removal', () => {
      expect(photoAction('remove background')).toBe('remove_bg');
      expect(photoAction('მოაშორე ფონი')).toBe('remove_bg');
    });
    it('photoAction returns null when no concrete action', () => {
      expect(photoAction('do something cool')).toBeNull();
    });
    it('audioAction maps karaoke/denoise', () => {
      expect(audioAction('karaoke please')).toBe('splitter');
      expect(audioAction('denoise this')).toBe('vocal_isolation');
      expect(audioAction('nothing relevant')).toBeNull();
    });
  });
});
