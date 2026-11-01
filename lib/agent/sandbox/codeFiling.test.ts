import { chunkText, codeRunSpec, fileCodeRun, type FilingDeps, type FiledRun } from './codeFiling';

const run: FiledRun = { language: 'python', code: 'print(sum(range(1, 101)))', exitCode: 0, stdout: '5050\n', stderr: '', wallMs: 512 };

function deps(over: Partial<FilingDeps> = {}) {
  const calls: Record<string, unknown[]> = { upload: [], record: [] };
  const d: FilingDeps = {
    render: async () => new Uint8Array([37, 80, 68, 70]),
    upload: async (path, bytes) => { calls.upload!.push({ path, bytes: bytes.byteLength }); return 'https://signed/x.pdf'; },
    record: async (i) => { calls.record!.push(i); return true; },
    newId: () => 'id-1',
    now: () => new Date('2026-11-01T06:00:00Z'),
    ...over,
  };
  return { d, calls };
}

test('the PDF holds the output first, then the code, in the chat language', () => {
  const spec = codeRunSpec(run, 'ka')!;
  expect(spec.title).toBe('Python კოდის შედეგი');
  expect(spec.subtitle).toBe('დასრულდა, კოდი 0 · 0.5 წმ');
  expect(spec.sections.map((s) => s.heading)).toEqual(['შედეგი', 'კოდი']);
  expect(spec.sections[0]!.blocks[0]).toEqual({ type: 'paragraph', text: '5050' });
});

test('stderr gets its own section; no output says so', () => {
  const spec = codeRunSpec({ ...run, language: 'node', stdout: '', stderr: 'boom', exitCode: 1 }, 'en')!;
  expect(spec.title).toBe('JavaScript code result');
  expect(spec.sections.map((s) => s.heading)).toEqual(['Output', 'Errors (stderr)', 'Code']);
  expect(spec.sections[0]!.blocks[0]).toEqual({ type: 'paragraph', text: 'The program printed nothing.' });
});

test('long text is split into paragraphs the spec accepts and cut past the filed limit', () => {
  const long = Array.from({ length: 4000 }, (_, i) => `line ${i}`).join('\n');
  expect(chunkText(long).every((p) => p.length <= 3900)).toBe(true);
  const spec = codeRunSpec({ ...run, stdout: long }, 'ru')!;
  const text = spec.sections[0]!.blocks.map((b) => (b as { text: string }).text).join('\n');
  expect(text.endsWith('…[сокращено]')).toBe(true);
});

test('files a document row with the signed link under the user folder', async () => {
  const { d, calls } = deps();
  await expect(fileCodeRun(d, { userId: 'u-1', locale: 'ka', run })).resolves.toBe(true);
  expect(calls.upload).toEqual([{ path: 'documents/u-1/2026-11-01-code-id-1.pdf', bytes: 4 }]);
  expect(calls.record).toEqual([{ id: 'id-1', userId: 'u-1', url: 'https://signed/x.pdf', title: 'Python კოდის შედეგი' }]);
});

test('fail-soft: refused Storage, a refused write or a renderer error is just false', async () => {
  expect(await fileCodeRun(deps({ upload: async () => null }).d, { userId: 'u', locale: 'ka', run })).toBe(false);
  expect(await fileCodeRun(deps({ record: async () => false }).d, { userId: 'u', locale: 'ka', run })).toBe(false);
  expect(await fileCodeRun(deps({ render: async () => { throw new Error('x'); } }).d, { userId: 'u', locale: 'ka', run })).toBe(false);
});
