import {
  deriveCarryContext,
  CARRY_CONTEXT_MAX_CHARS,
  type CarryContextMessage,
} from './carryContext';

const asset = (mode: string, sourcePrompt: string): CarryContextMessage => ({
  role: 'assistant',
  mode,
  sourcePrompt,
  assetUrl: 'https://cdn.example/asset.png',
});

describe('deriveCarryContext', () => {
  it('returns empty for empty / nullish history', () => {
    expect(deriveCarryContext([], 'video')).toBe('');
    expect(deriveCarryContext(null, 'video')).toBe('');
    expect(deriveCarryContext(undefined, 'video')).toBe('');
  });

  it('carries the prior creative prompt across an agent switch', () => {
    const history: CarryContextMessage[] = [
      { role: 'user', sourcePrompt: '', assetUrl: null },
      asset('interior', 'Scandinavian living room, warm oak, sage-green accents'),
    ];
    expect(deriveCarryContext(history, 'video')).toBe(
      'Scandinavian living room, warm oak, sage-green accents',
    );
  });

  it('returns empty when staying on the same agent (history covers continuity)', () => {
    const history = [asset('image', 'neon-on-charcoal hero shot')];
    expect(deriveCarryContext(history, 'image')).toBe('');
  });

  it('uses the MOST RECENT cross-mode creative output', () => {
    const history = [
      asset('interior', 'old interior prompt'),
      asset('image', 'latest image prompt — teal duotone'),
    ];
    // Switching to video → most recent creative output is the image.
    expect(deriveCarryContext(history, 'video')).toBe('latest image prompt — teal duotone');
  });

  it('ignores non-creative modes (global / voice) and assetless turns', () => {
    const history: CarryContextMessage[] = [
      asset('image', 'a moody portrait, rim light'),
      { role: 'assistant', mode: 'global', sourcePrompt: 'tell me a joke', assetUrl: null },
      { role: 'assistant', mode: 'voice', sourcePrompt: 'read this aloud', assetUrl: 'blob:abc' },
    ];
    expect(deriveCarryContext(history, 'video')).toBe('a moody portrait, rim light');
  });

  it('returns empty when the prior creative output has no usable prompt', () => {
    const history: CarryContextMessage[] = [
      { role: 'assistant', mode: 'image', sourcePrompt: '   ', assetUrl: 'https://x/y.png' },
    ];
    expect(deriveCarryContext(history, 'video')).toBe('');
  });

  it('truncates an over-long seed with an ellipsis', () => {
    const long = 'a'.repeat(CARRY_CONTEXT_MAX_CHARS + 120);
    const out = deriveCarryContext([asset('interior', long)], 'avatar');
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(CARRY_CONTEXT_MAX_CHARS + 1);
  });

  it('skips a same-mode latest output but still finds nothing to carry', () => {
    // Latest creative output equals the active mode → no carry, even if an
    // older different-mode output exists (we only honour the most recent).
    const history = [
      asset('video', 'cinematic drone shot'),
      asset('image', 'flat product still'),
    ];
    expect(deriveCarryContext(history, 'image')).toBe('');
  });
});
