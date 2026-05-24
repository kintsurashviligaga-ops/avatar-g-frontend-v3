import { runWithReflection, critiqueText, formatCritique } from './reflection';

describe('runWithReflection', () => {
  test('clean first pass → 1 iteration, not refined, accepted', async () => {
    const r = await runWithReflection<string>({
      produce: () => 'good',
      critique: () => ({ ok: true, issues: [] }),
    });
    expect(r.iterations).toBe(1);
    expect(r.refined).toBe(false);
    expect(r.accepted).toBe(true);
    expect(r.output).toBe('good');
    expect(r.log).toHaveLength(1);
  });

  test('one bad pass then good → 2 iterations, refined, accepted, critique fed back', async () => {
    const notes: Array<string | null> = [];
    const r = await runWithReflection<string>({
      produce: (note, i) => { notes.push(note); return i === 1 ? 'bad' : 'fixed'; },
      critique: (out) => out === 'fixed' ? { ok: true, issues: [] } : { ok: false, issues: ['missing field x'] },
    });
    expect(r.iterations).toBe(2);
    expect(r.refined).toBe(true);
    expect(r.accepted).toBe(true);
    expect(r.output).toBe('fixed');
    expect(notes[0]).toBeNull();           // first pass has no critique note
    expect(notes[1]).toContain('missing field x'); // refinement receives the critique
  });

  test('always bad → stops at maxIterations, not accepted, returns best effort', async () => {
    let calls = 0;
    const r = await runWithReflection<string>({
      produce: () => { calls++; return 'still bad'; },
      critique: () => ({ ok: false, issues: ['nope'] }),
      maxIterations: 3,
    });
    expect(calls).toBe(3);
    expect(r.iterations).toBe(3);
    expect(r.accepted).toBe(false);
    expect(r.refined).toBe(true);
    expect(r.output).toBe('still bad');
  });

  test('maxIterations is clamped to [1,6]', async () => {
    let calls = 0;
    await runWithReflection<string>({
      produce: () => { calls++; return 'x'; },
      critique: () => ({ ok: false, issues: ['x'] }),
      maxIterations: 99,
    });
    expect(calls).toBe(6);
  });

  test('supports async producers', async () => {
    const r = await runWithReflection<number>({
      produce: async () => { await Promise.resolve(); return 42; },
      critique: (n) => ({ ok: n === 42, issues: [] }),
    });
    expect(r.output).toBe(42);
    expect(r.accepted).toBe(true);
  });
});

describe('critiqueText', () => {
  test('accepts a normal answer', () => {
    expect(critiqueText('Here is your 3D room layout with 4 walls.').ok).toBe(true);
  });
  test('flags empty', () => {
    expect(critiqueText('   ').ok).toBe(false);
  });
  test('flags error/permission markers', () => {
    expect(critiqueText('Unauthorized — set a token').ok).toBe(false);
    expect(critiqueText('Error: failed to render').ok).toBe(false);
  });
  test('flags refusal / non-answer', () => {
    expect(critiqueText("I cannot help with that").ok).toBe(false);
  });
  test('flags unbalanced JSON braces', () => {
    expect(critiqueText('{"a":1, "b":[2,3]').ok).toBe(false);
    expect(critiqueText('{"a":1,"b":[2,3]}').ok).toBe(true);
  });
});

describe('formatCritique', () => {
  test('numbers the issues', () => {
    expect(formatCritique(['a', 'b'])).toContain('(1) a');
    expect(formatCritique(['a', 'b'])).toContain('(2) b');
  });
  test('falls back when empty', () => {
    expect(formatCritique([])).toMatch(/refine/i);
  });
});
