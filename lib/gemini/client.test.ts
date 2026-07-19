import { sanitizeGeminiHistory } from './client';

describe('sanitizeGeminiHistory — Gemini contents-prefix hardening', () => {
  it('passes a clean, well-interleaved history through unchanged', () => {
    const h = [
      { role: 'user' as const, parts: [{ text: 'გამარჯობა' }] },
      { role: 'model' as const, parts: [{ text: 'როგორ დაგეხმაროთ?' }] },
      { role: 'user' as const, parts: [{ text: 'გააკეთე ვიდეო' }] },
    ];
    expect(sanitizeGeminiHistory(h)).toEqual(h);
  });

  it('drops turns whose text is empty / whitespace-only (an empty part 400s the API)', () => {
    const out = sanitizeGeminiHistory([
      { role: 'user', parts: [{ text: 'real' }] },
      { role: 'model', parts: [{ text: '   ' }] },      // whitespace-only → dropped
      { role: 'user', parts: [{ text: '' }] },           // empty → dropped
      { role: 'model', parts: [{ text: 'kept' }] },
    ]);
    expect(out).toEqual([
      { role: 'user', parts: [{ text: 'real' }] },
      { role: 'model', parts: [{ text: 'kept' }] },
    ]);
  });

  it('drops leading model turn(s) — contents must open on a user turn', () => {
    const out = sanitizeGeminiHistory([
      { role: 'model', parts: [{ text: 'stray opener' }] },
      { role: 'model', parts: [{ text: 'another' }] },
      { role: 'user', parts: [{ text: 'first real user' }] },
      { role: 'model', parts: [{ text: 'reply' }] },
    ]);
    expect(out[0]!.role).toBe('user');
    expect(out).toEqual([
      { role: 'user', parts: [{ text: 'first real user' }] },
      { role: 'model', parts: [{ text: 'reply' }] },
    ]);
  });

  it('keeps only a valid subset of parts within a turn', () => {
    const out = sanitizeGeminiHistory([
      { role: 'user', parts: [{ text: '' }, { text: 'keep me' }, { text: '  ' }] },
    ]);
    expect(out).toEqual([{ role: 'user', parts: [{ text: 'keep me' }] }]);
  });

  it('is fail-safe on undefined / non-array / garbage shapes and never throws', () => {
    expect(sanitizeGeminiHistory(undefined)).toEqual([]);
    expect(sanitizeGeminiHistory(null as unknown as [])).toEqual([]);
    const out = sanitizeGeminiHistory([
      null as unknown as { role: 'user'; parts: { text: string }[] },
      { role: 'system' as unknown as 'user', parts: [{ text: 'not a valid role' }] },
      { role: 'user', parts: 'nope' as unknown as { text: string }[] },
      { role: 'user', parts: [{ text: 'survivor' }] },
    ]);
    expect(out).toEqual([{ role: 'user', parts: [{ text: 'survivor' }] }]);
  });

  it('returns empty when every turn is stripped (caller then sends just the current message)', () => {
    expect(
      sanitizeGeminiHistory([
        { role: 'model', parts: [{ text: '' }] },
        { role: 'user', parts: [] },
      ]),
    ).toEqual([]);
  });
});
