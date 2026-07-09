/** @jest-environment node */
import { sanitizeSpokenText } from './spokenText';

describe('sanitizeSpokenText (v363 — production annotations must never be spoken)', () => {
  it('passes clean narration prose through unchanged', () => {
    const prose = 'There was a morning that the whole country breathed in together. For the last time.';
    expect(sanitizeSpokenText(prose)).toBe(prose);
    const ka = 'იყო ერთი დილა, რომელიც მთელმა ქვეყანამ ერთად ამოისუნთქა. უკანასკნელად.';
    expect(sanitizeSpokenText(ka)).toBe(ka);
  });

  it('strips a timeline-table shot-list block down to no production markers', () => {
    const block = [
      'Scene 1: "The Last Peaceful Morning"',
      'Frames: 0–144 · Duration: 0:00–0:06 · Clips: 2',
      'TC          Shot      Camera        Action',
      '00:00–00:02 S1.1      Drone aerial  Epic descent over old Tbilisi at dawn',
      'Visual: Golden hour (3200K), volumetric god-rays.',
      'Overlay: "თბილისი · 22 ივნისი, 1941" — Cinzel Decorative.',
      '🔊 SFX: tram sparks.',
      '--------------------------------------------------------------------------------',
    ].join('\n');
    const out = sanitizeSpokenText(block);
    expect(out).not.toMatch(/frames|duration|clips|overlay|cinzel|sfx|visual|scene\s*1/i);
    expect(out).not.toMatch(/00:00|S1\.1/);
    expect(out).not.toMatch(/[-]{5,}/);
    expect(out).not.toContain('🔊');
  });

  it('strips inline timecodes and shot codes but keeps the spoken words', () => {
    expect(sanitizeSpokenText('The city 00:06–00:08 froze S2.1 in silence')).toBe('The city froze in silence');
  });

  it('returns empty when the field held only annotations (caller falls back to the LLM writer)', () => {
    const onlyMeta = ['Frames: 0–144', 'TC          Shot', '00:00–00:02 S1.1 Drone aerial', '🎬 Scene 2', '===='].join('\n');
    expect(sanitizeSpokenText(onlyMeta)).toBe('');
  });

  it('handles null/empty safely', () => {
    expect(sanitizeSpokenText(null)).toBe('');
    expect(sanitizeSpokenText('')).toBe('');
  });

  // Day-1 Task 1: inline stage directions / timecodes / labels / sluglines / markdown.
  it('strips inline stage directions, timecodes, labels and markdown', () => {
    expect(sanitizeSpokenText('The wind rose (pause) and the city [00:03] fell silent')).toBe('The wind rose and the city fell silent');
    expect(sanitizeSpokenText('[whispering] come back *sighs* please')).toBe('come back please');
    expect(sanitizeSpokenText('NARRATOR: There was a morning')).toBe('There was a morning');
    expect(sanitizeSpokenText('at 00:03 the radio spoke')).toBe('at the radio spoke');
    expect(sanitizeSpokenText('the sky (0:05) was calm')).toBe('the sky was calm');
    expect(sanitizeSpokenText('INT./EXT. STREET - DAY\nA man walks alone')).toBe('A man walks alone');
    expect(sanitizeSpokenText('**bold** and _italic_ words')).toBe('bold and italic words');
  });

  // CRITICAL Task 1 invariant: Georgian text, diacritics and natural punctuation are preserved EXACTLY.
  it('preserves Georgian prose + punctuation byte-for-byte', () => {
    const ka = 'იყო ერთი დილა… რომელიც მთელმა ქვეყანამ ერთად ამოისუნთქა. უკანასკნელად.';
    expect(sanitizeSpokenText(ka)).toBe(ka);
    const kaQuotes = 'მან თქვა: „დაბრუნდი, გთხოვ." — და ხმა ჩაწყდა.';
    expect(sanitizeSpokenText(kaQuotes)).toBe(kaQuotes);
    const commas = 'ცა იყო წყნარი, მზე იყო თბილი, მაგრამ ერთმა ხმამ ყველაფერი შეცვალა.';
    expect(sanitizeSpokenText(commas)).toBe(commas);
  });
});
