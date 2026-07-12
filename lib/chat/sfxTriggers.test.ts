/** @jest-environment node */
import { enrichSfxBrief, SFX_TRIGGERS } from './sfxTriggers';

describe('enrichSfxBrief — contextual SFX keyword enrichment (Phase 25 V1)', () => {
  test('no match → returns the input UNCHANGED (pure no-op)', () => {
    expect(enrichSfxBrief('a quiet person thinking')).toBe('a quiet person thinking');
  });

  test('empty/whitespace → returns empty', () => {
    expect(enrichSfxBrief('')).toBe('');
    expect(enrichSfxBrief('   ')).toBe('');
  });

  test('a football brief prepends stadium/crowd cues with a LOUD intensity word', () => {
    const out = enrichSfxBrief('make a football film about a striker');
    expect(out).toMatch(/stadium crowd roar/i);
    expect(out).toMatch(/referee whistle/i);
    expect(out).toMatch(/powerful, dominant/); // loud intensity word
    expect(out).toContain('make a football film about a striker'); // original preserved
  });

  test('a "goal" scores the loudest cue (most-specific pattern first)', () => {
    const out = enrichSfxBrief('and then he scored the winning goal');
    expect(out).toMatch(/stadium eruption|crowd cheering|airhorn/i);
  });

  test('nature keywords use a SOFT intensity word', () => {
    const out = enrichSfxBrief('birds at dawn in the forest');
    expect(out).toMatch(/birdsong dawn chorus/i);
    expect(out).toMatch(/\(subtle\)/);
  });

  test('multiple domains layer their cues (deduped) without exceeding 280 chars', () => {
    const out = enrichSfxBrief('a gunshot during the storm near the ocean with birds');
    expect(out.length).toBeLessThanOrEqual(280);
    expect(out).toMatch(/gunshot crack/i);
    expect(out).toMatch(/wind gusts|thunder/i);
  });

  test('every trigger cue is non-empty and every pattern is a RegExp (curated closed set)', () => {
    for (const t of SFX_TRIGGERS) {
      expect(t.pattern).toBeInstanceOf(RegExp);
      expect(t.cue.trim().length).toBeGreaterThan(0);
      expect(['soft', 'medium', 'loud']).toContain(t.intensity);
    }
  });
});
