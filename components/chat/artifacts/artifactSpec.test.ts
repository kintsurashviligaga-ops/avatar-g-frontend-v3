/**
 * artifactSpec: the one gate in front of the canvas — the language allowlist, the 200 KB UTF-8 bound, titles,
 * identity and download names.
 *
 * ⚠️ WHAT THESE PIN.
 *  - Unknown languages are refused, never mapped to a "close enough" one (the language picks the Preview branch,
 *    the highlight grammar and the file extension).
 *  - The bound is UTF-8 bytes: 70 K Georgian characters are 210 KB and must be refused, though `length` is 70 K.
 *  - A title is one visible line: control characters and bidi overrides cannot reach the header or the file name.
 */
import {
  ARTIFACT_LANGUAGES,
  MAX_ARTIFACT_CODE_BYTES,
  artifactFileName,
  artifactIdFor,
  deriveArtifactTitle,
  fitsArtifactBound,
  isPreviewable,
  normalizeArtifactLanguage,
  sanitizeArtifactTitle,
  toArtifactInput,
  utf8ByteLength,
} from './artifactSpec';

describe('normalizeArtifactLanguage', () => {
  it('keeps canonical ids and maps the common fence aliases', () => {
    expect(normalizeArtifactLanguage('html')).toBe('html');
    expect(normalizeArtifactLanguage(' HTML ')).toBe('html');
    expect(normalizeArtifactLanguage('htm')).toBe('html');
    expect(normalizeArtifactLanguage('js')).toBe('javascript');
    expect(normalizeArtifactLanguage('ts')).toBe('typescript');
    expect(normalizeArtifactLanguage('py')).toBe('python');
    expect(normalizeArtifactLanguage('sh')).toBe('bash');
    expect(normalizeArtifactLanguage('yml')).toBe('yaml');
    expect(normalizeArtifactLanguage('c++')).toBe('cpp');
    expect(normalizeArtifactLanguage('c#')).toBe('csharp');
    expect(normalizeArtifactLanguage('txt')).toBe('text');
    expect(normalizeArtifactLanguage('svg')).toBe('svg');
  });

  it('refuses anything off the allowlist, including prototype keys and injection-shaped strings', () => {
    for (const bad of ['mermaid', 'brainfuck', '', '   ', 'html" onload="x', 'constructor', '__proto__', 'toString', 'a'.repeat(40)]) {
      expect(normalizeArtifactLanguage(bad)).toBeNull();
    }
    for (const bad of [undefined, null, 42, {}, ['html']]) expect(normalizeArtifactLanguage(bad)).toBeNull();
  });

  it('only html and svg are previewable', () => {
    const previewable = (Object.keys(ARTIFACT_LANGUAGES) as Array<keyof typeof ARTIFACT_LANGUAGES>).filter(isPreviewable);
    expect(previewable.sort()).toEqual(['html', 'svg']);
  });
});

describe('the 200 KB bound', () => {
  it('counts UTF-8 bytes: ASCII 1, Georgian 3, an emoji (surrogate pair) 4', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('ქართ')).toBe(12);
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('🚀')).toBe(4);
    expect(utf8ByteLength('\ud800')).toBe(3); // a lone surrogate encodes as U+FFFD
  });

  it('refuses Georgian text that is short in characters but over 200 KB in bytes', () => {
    const georgian = 'ა'.repeat(70_000); // 70 K chars, 210 KB
    expect(georgian.length).toBeLessThan(MAX_ARTIFACT_CODE_BYTES);
    expect(fitsArtifactBound(georgian)).toBe(false);
    expect(fitsArtifactBound('x'.repeat(MAX_ARTIFACT_CODE_BYTES))).toBe(true);
    expect(fitsArtifactBound('x'.repeat(MAX_ARTIFACT_CODE_BYTES + 1))).toBe(false);
  });
});

describe('titles and identity', () => {
  it('sanitizes a caller title to one bounded visible line', () => {
    expect(sanitizeArtifactTitle('  My\npage\t ')).toBe('My page');
    expect(sanitizeArtifactTitle('evil‮exe.txt')).toBe('evil exe.txt');
    expect(sanitizeArtifactTitle('\u0000\u0007')).toBeNull();
    expect(sanitizeArtifactTitle(42)).toBeNull();
    expect(Array.from(sanitizeArtifactTitle('ტ'.repeat(500))!).length).toBe(120);
  });

  it('derives a title from <title>, then an HTML <h1>, else the language name', () => {
    expect(deriveArtifactTitle('html', '<html><head><title>Todo &amp; Done</title></head></html>')).toBe('Todo & Done');
    expect(deriveArtifactTitle('html', '<body><h1 class="x">ჩემი გვერდი</h1></body>')).toBe('ჩემი გვერდი');
    expect(deriveArtifactTitle('svg', '<svg><title>Logo</title></svg>')).toBe('Logo');
    expect(deriveArtifactTitle('svg', '<svg><h1>not svg</h1></svg>')).toBe('SVG');
    expect(deriveArtifactTitle('python', 'print(1)')).toBe('Python');
  });

  it('an artifact id is language + case-folded title', () => {
    expect(artifactIdFor('html', 'Todo App')).toBe('html:todo app');
    expect(artifactIdFor('python', 'Python')).toBe('python:python');
  });
});

describe('toArtifactInput', () => {
  it('accepts a valid input and fills the title and id', () => {
    expect(toArtifactInput({ language: 'py', code: 'print(1)' })).toEqual({ id: 'python:python', title: 'Python', language: 'python', code: 'print(1)' });
    expect(toArtifactInput({ title: 'Hello', language: 'html', code: '<p>hi</p>' })).toEqual({
      id: 'html:hello',
      title: 'Hello',
      language: 'html',
      code: '<p>hi</p>',
    });
  });

  it('refuses a bad language, blank or non-string code, and oversize code', () => {
    expect(toArtifactInput({ language: 'mermaid', code: 'graph TD' })).toBeNull();
    expect(toArtifactInput({ language: 'html', code: '   \n ' })).toBeNull();
    expect(toArtifactInput({ language: 'html', code: 42 })).toBeNull();
    expect(toArtifactInput({ language: 'html', code: 'x'.repeat(MAX_ARTIFACT_CODE_BYTES + 1) })).toBeNull();
  });
});

describe('artifactFileName', () => {
  it('uses the title (any script) and the language extension, never a path', () => {
    expect(artifactFileName({ title: 'Todo App', language: 'html' })).toBe('Todo-App.html');
    expect(artifactFileName({ title: 'ჩემი გვერდი', language: 'html' })).toBe('ჩემი-გვერდი.html');
    expect(artifactFileName({ title: '../../etc/passwd', language: 'text' })).toBe('etc-passwd.txt');
    expect(artifactFileName({ title: 'Logo', language: 'svg' })).toBe('Logo.svg');
    expect(artifactFileName({ title: 'Python', language: 'python' })).toBe('Python.py');
    expect(artifactFileName({ title: '???', language: 'json' })).toBe('artifact.json');
    expect(artifactFileName({ title: 'anything', language: 'dockerfile' })).toBe('Dockerfile');
  });
});
