import { buildIterativePrompt, getIterationState } from './iteration-store';

describe('buildIterativePrompt — iterative (default) contexts', () => {
  it('returns the first message verbatim on the first call', () => {
    const result = buildIterativePrompt({
      sessionId: 'sess-iter-1',
      serviceContext: 'interior',
      message: 'A cozy Scandinavian living room',
    });
    expect(result.prompt).toBe('A cozy Scandinavian living room');
    expect(result.iteration).toBe(1);
    expect(result.hasPreviousContext).toBe(false);
  });

  it('merges a short refinement under the prior prompt on the second call', () => {
    const sessionId = 'sess-iter-2';
    buildIterativePrompt({
      sessionId,
      serviceContext: 'interior',
      message: 'A cozy Scandinavian living room',
    });
    const second = buildIterativePrompt({
      sessionId,
      serviceContext: 'interior',
      message: 'make it warmer',
    });
    expect(second.iteration).toBe(2);
    expect(second.hasPreviousContext).toBe(true);
    expect(second.prompt).toContain('A cozy Scandinavian living room');
    expect(second.prompt).toContain('make it warmer');
  });
});

describe('PHASE 39 §2 — avatar contexts bypass all iterative caching/merging', () => {
  it('never merges avatar prompts across iterations (prompt is verbatim each time)', () => {
    const sessionId = 'sess-avatar-1';
    const first = buildIterativePrompt({
      sessionId,
      serviceContext: 'avatar',
      message: 'A confident founder, soft studio lighting',
    });
    expect(first.prompt).toBe('A confident founder, soft studio lighting');
    expect(first.iteration).toBe(1);
    expect(first.hasPreviousContext).toBe(false);

    const second = buildIterativePrompt({
      sessionId,
      serviceContext: 'avatar',
      message: 'make it warmer',
    });
    // Must NOT carry the previous prompt forward — verbatim current bubble only.
    expect(second.prompt).toBe('make it warmer');
    expect(second.prompt).not.toContain('confident founder');
    expect(second.iteration).toBe(1);
    expect(second.hasPreviousContext).toBe(false);
  });

  it('treats the avatar_generation intent context the same way', () => {
    const second = buildIterativePrompt({
      sessionId: 'sess-avatar-2',
      serviceContext: 'avatar_generation',
      message: 'A cyberpunk DJ avatar',
    });
    expect(second.prompt).toBe('A cyberpunk DJ avatar');
    expect(second.hasPreviousContext).toBe(false);
  });

  it('is case-insensitive for the avatar context match', () => {
    const result = buildIterativePrompt({
      sessionId: 'sess-avatar-3',
      serviceContext: 'Avatar',
      message: 'Studio portrait avatar',
    });
    expect(result.prompt).toBe('Studio portrait avatar');
    expect(result.hasPreviousContext).toBe(false);
  });

  it('writes nothing to the persistent store for avatar contexts', () => {
    const sessionId = 'sess-avatar-4';
    buildIterativePrompt({
      sessionId,
      serviceContext: 'avatar',
      message: 'A bold news anchor avatar',
    });
    // Zero payload caching — no state should be persisted.
    expect(getIterationState(sessionId, 'avatar')).toBeNull();
  });
});
