import { extractPromptTraits, enrichVideoPrompt } from './promptTraits';

describe('extractPromptTraits — directorial extraction', () => {
  it('pulls camera, style, lighting, tone and audio cues from a rich prompt', () => {
    const t = extractPromptTraits(
      'A dramatic cinematic shot, slow dolly in on a confident founder at golden hour with an orchestral score',
    );
    expect(t.cameraMotion).toContain('slow dolly-in');
    expect(t.aesthetic).toContain('cinematic');
    expect(t.lighting).toContain('golden-hour light');
    expect(t.emotionalTone).toEqual(expect.arrayContaining(['dramatic', 'confident']));
    expect(t.audioCues).toContain('orchestral score');
    expect(t.wantsAudio).toBe(true);
  });

  it('detects cadence keywords', () => {
    expect(extractPromptTraits('a fast, energetic montage').cadence).toBe('fast');
    expect(extractPromptTraits('a slow, deliberate reveal').cadence).toBe('slow');
    expect(extractPromptTraits('a steady, even pace').cadence).toBe('measured');
    expect(extractPromptTraits('a plain landscape').cadence).toBeNull();
  });

  it('captures negative cues for suppression', () => {
    const t = extractPromptTraits('portrait, sharp, no watermark, no blur');
    expect(t.negativeCues).toEqual(expect.arrayContaining(['watermark', 'blur']));
  });
});

describe('extractPromptTraits — wantsAudio inference (silent-video fix)', () => {
  it('is true for explicit acoustic markers', () => {
    expect(extractPromptTraits('a clip with cinematic sound').wantsAudio).toBe(true);
    expect(extractPromptTraits('she speaks dramatically to camera').wantsAudio).toBe(true);
  });

  it('is true for implicitly cinematic / scripted prompts', () => {
    expect(extractPromptTraits('a film trailer for a sci-fi epic').wantsAudio).toBe(true);
    expect(extractPromptTraits('a news anchor presents the headlines').wantsAudio).toBe(true);
  });

  it('respects the defaultAudio opt-in for a silent-looking prompt', () => {
    expect(extractPromptTraits('a red apple on a table').wantsAudio).toBe(false);
    expect(extractPromptTraits('a red apple on a table', { defaultAudio: true }).wantsAudio).toBe(true);
  });
});

describe('enrichVideoPrompt — safe, deduped, capped folding', () => {
  it('appends only traits the prompt does not already state', () => {
    const t = extractPromptTraits('cinematic shot with orchestral score, slow dolly in');
    const enriched = enrichVideoPrompt('cinematic shot with orchestral score, slow dolly in', t);
    // "cinematic" and "orchestral score" already present → not duplicated.
    expect(enriched.toLowerCase().split('cinematic').length - 1).toBe(1);
    expect(enriched.toLowerCase().split('orchestral score').length - 1).toBe(1);
  });

  it('adds a default audio clause when audio is wanted but unspecified', () => {
    const t = extractPromptTraits('an epic film teaser');
    const enriched = enrichVideoPrompt('an epic film teaser', t);
    expect(enriched).toContain('Audio:');
  });

  it('returns the base prompt untouched when there is nothing to add', () => {
    const t = extractPromptTraits('a red apple');
    const enriched = enrichVideoPrompt('a red apple', t);
    expect(enriched).toBe('a red apple');
  });

  it('hard-caps the enriched prompt to the provided max length', () => {
    const long = 'cinematic '.repeat(400); // ~4000 chars
    const t = extractPromptTraits(long);
    const enriched = enrichVideoPrompt(long, t, 1500);
    expect(enriched.length).toBeLessThanOrEqual(1500);
  });

  it('emits an Avoid clause from negative cues', () => {
    const t = extractPromptTraits('portrait, no watermark, no blur');
    const enriched = enrichVideoPrompt('portrait', t);
    expect(enriched).toContain('Avoid:');
    expect(enriched).toContain('watermark');
  });
});
