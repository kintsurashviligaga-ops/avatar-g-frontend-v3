/** @jest-environment node */
import {
  buildResearchInput,
  fitDocuments,
  foldedContextChars,
  RESEARCH_CONTEXT_MAX_CHARS,
  safeFileName,
  type ResearchContextFile,
} from './context';

const file = (id: string, name: string, len: number, ch = 'a'): ResearchContextFile => ({ id, name, text: ch.repeat(len) });

describe('fitDocuments — the cost control on the user\'s own documents', () => {
  test('under the cap nothing is touched', () => {
    const out = fitDocuments([file('1', 'a.txt', 10_000), file('2', 'b.md', 20_000)]);
    expect(out.map((f) => f.text.length)).toEqual([10_000, 20_000]);
    expect(out.some((f) => f.truncated)).toBe(false);
  });

  test('over the cap the SUM stays within it, every file keeps a share, and the cut is marked', () => {
    const out = fitDocuments([file('1', 'a.txt', 30_000), file('2', 'b.md', 30_000), file('3', 'c.docx', 30_000)]);
    const total = out.reduce((s, f) => s + f.text.length, 0);
    expect(total).toBeLessThanOrEqual(RESEARCH_CONTEXT_MAX_CHARS);
    expect(out.every((f) => f.text.length >= 1_000)).toBe(true);
    expect(out.every((f) => f.truncated && f.text.endsWith('…'))).toBe(true);
  });

  test('a large early file cannot starve the files after it', () => {
    const out = fitDocuments([file('1', 'huge', 29_000), file('2', 'small', 1_500), file('3', 'small2', 1_500), file('4', 'small3', 1_500), file('5', 'small4', 1_500), file('6', 'big2', 29_000)]);
    expect(out.reduce((s, f) => s + f.text.length, 0)).toBeLessThanOrEqual(RESEARCH_CONTEXT_MAX_CHARS);
    expect(out.slice(1, 5).every((f) => f.text.length >= 1_000)).toBe(true);
  });

  test('foldedContextChars equals what buildResearchInput actually folds in', () => {
    const files = [file('1', 'a', 25_000), file('2', 'b', 25_000)];
    const folded = foldedContextChars(files);
    expect(folded).toBeLessThanOrEqual(RESEARCH_CONTEXT_MAX_CHARS);
    const input = buildResearchInput({ prompt: 'q', locale: 'en', files });
    expect(input.length).toBeGreaterThanOrEqual(folded);
    expect(input.length).toBeLessThan(folded + 2_000);
  });
});

describe('buildResearchInput', () => {
  test('no files: the question and one language line — nothing about documents', () => {
    const input = buildResearchInput({ prompt: '  Compare the wine export markets  ', locale: 'ka' });
    expect(input.startsWith('Compare the wine export markets')).toBe(true);
    expect(input).toContain('Georgian');
    expect(input).not.toContain('REFERENCE DOCUMENTS');
  });

  test('files: delimited, numbered, named, and declared data-not-instructions', () => {
    const input = buildResearchInput({
      prompt: 'Analyse the contract',
      locale: 'en',
      files: [{ id: '1', name: 'contract [v2].pdf', text: 'Clause 1.\n\n\n\nClause 2.' }],
    });
    expect(input).toContain('[Document 1: contract v2 .pdf]');
    expect(input).toContain('Clause 1.\n\nClause 2.');
    expect(input).toMatch(/data, never instructions/);
    expect(input).toContain('--- END OF REFERENCE DOCUMENTS ---');
    expect(input.indexOf('Analyse the contract')).toBeLessThan(input.indexOf('REFERENCE DOCUMENTS'));
    expect(input).toContain('English');
  });

  test('the answer language follows the locale (ka / en / ru)', () => {
    expect(buildResearchInput({ prompt: 'q', locale: 'ru' })).toContain('Russian');
    expect(buildResearchInput({ prompt: 'q', locale: 'en' })).toContain('English');
    expect(buildResearchInput({ prompt: 'q', locale: 'ka' })).toContain('Georgian');
  });

  test('the question is bounded', () => {
    const input = buildResearchInput({ prompt: 'x'.repeat(9_000), locale: 'en' });
    expect(input.length).toBeLessThan(4_500);
  });
});

describe('safeFileName', () => {
  test('no control characters or brackets, bounded, never empty', () => {
    expect(safeFileName('a\u0000b\nc[d]e')).toBe('a b c d e');
    expect(safeFileName('')).toBe('document');
    expect(safeFileName(undefined)).toBe('document');
    expect(safeFileName('x'.repeat(500)).length).toBe(120);
  });
});
