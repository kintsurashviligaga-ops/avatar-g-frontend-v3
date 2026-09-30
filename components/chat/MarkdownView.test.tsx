/**
 * @jest-environment jsdom
 *
 * MarkdownView: the shared renderer for assistant replies, rendered through the REAL unified pipeline
 * (react-markdown, remark-gfm, remark-math, rehype-katex, rehype-highlight).
 *
 * ⚠️ HOW THE REAL PIPELINE RUNS UNDER JEST. Those packages are ESM-only and this repo's jest config (next/jest)
 * does not transform node_modules, so a plain import fails with "Unexpected token 'export'". Each one is
 * mocked with a factory that loads the real package through Node's own `require`, which can load ESM
 * synchronously (Node ≥ 20.19 / 22.12). The mocks are the real modules, not stand-ins. The factories also
 * count loads, which is how "the highlighter is never loaded for plain text" is observed.
 *
 * ⚠️ TEST ORDER MATTERS FOR THE LAZY-LOAD TEST. The extensions are module-level caches, as in the app. The
 * "plain text loads nothing" test runs first in this file, before any test renders code or math.
 */
import { act, fireEvent, render } from '@testing-library/react';

interface MockLoads {
  highlight: number;
  katex: number;
  math: number;
  parses: string[];
}

function mockLoads(): MockLoads {
  const g = globalThis as unknown as { __mdTestLoads?: MockLoads };
  g.__mdTestLoads ??= { highlight: 0, katex: 0, math: 0, parses: [] };
  return g.__mdTestLoads;
}

/** Node's require, bypassing jest's module registry (which cannot load ESM). */
function mockNativeRequire(id: string): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const NodeModule = require('module') as { new (id: string): { filename: string; paths: string[]; require(id: string): unknown }; _nodeModulePaths(dir: string): string[] };
  const m = new NodeModule(__filename);
  m.filename = __filename;
  m.paths = NodeModule._nodeModulePaths(__dirname);
  return m.require(id) as Record<string, unknown>;
}

jest.mock('react-markdown', () => {
  const real = mockNativeRequire('react-markdown');
  const RealMarkdown = real.default as (props: { children?: string }) => unknown;
  // Records every parse, so the test can see which blocks re-parsed.
  const Counting = (props: { children?: string }) => {
    mockLoads().parses.push(String(props.children ?? ''));
    return RealMarkdown(props);
  };
  return { ...real, __esModule: true, default: Counting };
});
jest.mock('remark-gfm', () => mockNativeRequire('remark-gfm'));
jest.mock('rehype-highlight', () => {
  mockLoads().highlight += 1;
  return mockNativeRequire('rehype-highlight');
});
jest.mock('rehype-katex', () => {
  mockLoads().katex += 1;
  return mockNativeRequire('rehype-katex');
});
jest.mock('remark-math', () => {
  mockLoads().math += 1;
  return mockNativeRequire('remark-math');
});

import {
  MarkdownView,
  analyzeMarkdown,
  escapeNonMathDollars,
  loadHighlightExtension,
  loadMathExtension,
  normalizeMathDelimiters,
  rehypeStreamCaret,
  safeUrlTransform,
  splitMarkdownBlocks,
  CARET_TAG,
} from './MarkdownView';

/** Lets pending dynamic imports and the resulting store update settle. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

describe('lazy extensions', () => {
  it('plain prose never loads the highlighter or KaTeX (this test must run first)', async () => {
    const { container } = render(<MarkdownView source={'# Title\n\nJust **words**, a [link](https://example.com) and $5 or $10.\n\n- one\n- two'} />);
    await settle();
    expect(mockLoads().highlight).toBe(0);
    expect(mockLoads().katex).toBe(0);
    expect(mockLoads().math).toBe(0);
    expect(container.querySelector('h1')?.textContent).toBe('Title');
    // Prices are not math: both dollars render as text.
    expect(container.textContent).toContain('$5 or $10.');
  });

  it('a fenced code block loads the highlighter once and colours the code', async () => {
    const { container } = render(<MarkdownView source={'Here:\n\n```ts\nconst answer: number = 42;\n```\n'} locale="ka" />);
    // Before the chunk arrives the block is already readable, with its label and copy button.
    const code = container.querySelector('[data-md-code]')!;
    expect(code).toBeTruthy();
    expect(code.textContent).toContain('const answer: number = 42;');
    await act(async () => {
      await loadHighlightExtension();
    });
    await settle();
    expect(mockLoads().highlight).toBe(1);
    expect(container.querySelector('.hljs-keyword')?.textContent).toBe('const');
    expect(container.querySelector('.hljs-number')?.textContent).toBe('42');
  });

  it('an unlabelled fence stays plain and is labelled "code", never a guessed language', async () => {
    await act(async () => {
      await loadHighlightExtension();
    });
    const { container } = render(<MarkdownView source={'```\nfoo bar\n\nbaz qux\n```'} />);
    await settle();
    const block = container.querySelector('[data-md-code]')!;
    expect(block.querySelector('span')?.textContent).toBe('code');
    const code = block.querySelector('code')!;
    expect(code.className).toBe(''); // no `hljs` and no guessed `language-*`
    expect(code.querySelector('span')).toBeNull(); // no token spans
    expect(code.textContent).toBe('foo bar\n\nbaz qux\n');
  });

  it('math loads KaTeX and renders a formula; prices on the same line stay text', async () => {
    const { container } = render(<MarkdownView source={'Euler: $e^{i\\pi} + 1 = 0$ costs $5 or $10.\n\n$$\n\\int_0^1 x\\,dx\n$$\n'} />);
    await act(async () => {
      await loadMathExtension();
    });
    await settle();
    expect(mockLoads().katex).toBe(1);
    expect(mockLoads().math).toBe(1);
    expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('.katex-display')).toBeTruthy();
    expect(container.textContent).toContain('costs $5 or $10.');
  });
});

describe('rendering', () => {
  it('renders a GFM table inside a horizontal-scroll wrapper', () => {
    const { container } = render(<MarkdownView source={'| Plan | Price |\n|---|---|\n| Pro | 29 ₾ |\n| Max | 79 ₾ |'} />);
    const table = container.querySelector('table')!;
    expect(table).toBeTruthy();
    expect(table.parentElement!.className).toContain('overflow-x-auto');
    expect(Array.from(table.querySelectorAll('th')).map((th) => th.textContent)).toEqual(['Plan', 'Price']);
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('code blocks show the language and an always-visible copy button that copies the raw code', async () => {
    const writeText = jest.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { container, getByRole } = render(<MarkdownView source={'```python\nprint("გამარჯობა")\n```'} locale="en" />);
    const block = container.querySelector('[data-md-code]')!;
    expect(block.textContent).toContain('python');
    const button = getByRole('button', { name: 'Copy' });
    // ⚠️ The old copy button was opacity-0 until hover, so it did not exist on touch screens.
    expect(button.className).not.toMatch(/opacity-0/);
    await act(async () => {
      fireEvent.click(button);
    });
    expect(writeText).toHaveBeenCalledWith('print("გამარჯობა")');
    expect(getByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  it('localizes the copy label', () => {
    const { getByRole } = render(<MarkdownView source={'```\nx\n```'} locale="ka" />);
    expect(getByRole('button', { name: 'კოპირება' })).toBeTruthy();
  });

  it('inline code stays inline', () => {
    const { container } = render(<MarkdownView source={'Run `npm test` now.'} />);
    expect(container.querySelector('p code')?.textContent).toBe('npm test');
    expect(container.querySelector('[data-md-code]')).toBeNull();
  });
});

describe('links are sanitized', () => {
  it('drops javascript: and data: links but keeps the text', () => {
    const { container } = render(
      <MarkdownView source={'[a](javascript:alert(1)) [b](JaVaScRiPt:alert(1)) [c](data:text/html;base64,PHNjcmlwdD4=) [d](vbscript:msgbox)'} />,
    );
    expect(container.querySelectorAll('a')).toHaveLength(0);
    expect(container.textContent).toContain('a b c d');
    expect(container.innerHTML).not.toMatch(/javascript:|vbscript:|data:text/i);
  });

  it('opens external links in a new tab with noopener', () => {
    const { container } = render(<MarkdownView source={'[ok](https://example.com/x) and https://auto.example.org'} />);
    const links = Array.from(container.querySelectorAll('a'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://example.com/x', 'https://auto.example.org']);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
      expect(a.getAttribute('rel')).toContain('noreferrer');
    }
  });

  it('drops unsafe image sources', () => {
    const { container } = render(<MarkdownView source={'![x](javascript:alert(1)) ![y](https://img.example/y.png)'} />);
    const imgs = Array.from(container.querySelectorAll('img'));
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['https://img.example/y.png']);
  });

  it('safeUrlTransform', () => {
    expect(safeUrlTransform('https://a.example')).toBe('https://a.example');
    expect(safeUrlTransform('mailto:hi@a.example')).toBe('mailto:hi@a.example');
    expect(safeUrlTransform('/ka/pricing')).toBe('/ka/pricing');
    expect(safeUrlTransform('#fn-1')).toBe('#fn-1');
    expect(safeUrlTransform('javascript:alert(1)')).toBe('');
    expect(safeUrlTransform(' java\tscript:alert(1)')).toBe('');
    expect(safeUrlTransform('java\nscript:alert(1)')).toBe('');
    expect(safeUrlTransform('\u0001javascript:alert(1)')).toBe('');
    expect(safeUrlTransform('data:text/html,<script>')).toBe('');
    expect(safeUrlTransform('data:image/png;base64,iVBORw0KGgo=', 'src')).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(safeUrlTransform('data:image/svg+xml;base64,PHN2Zz4=', 'src')).toBe('');
    expect(safeUrlTransform('mailto:x@y.z', 'src')).toBe('');
  });
});

describe('streaming', () => {
  const caretParent = (container: HTMLElement) => container.querySelector('[data-stream-caret]')?.parentElement?.tagName;

  it('places the caret inline at the end of the last paragraph, not on its own line', () => {
    const { container } = render(<MarkdownView source={'First.\n\nHello **world**'} streaming />);
    expect(container.querySelectorAll('[data-stream-caret]')).toHaveLength(1);
    expect(caretParent(container)).toBe('P');
    const p = container.querySelector('[data-stream-caret]')!.parentElement!;
    expect(p.textContent).toBe('Hello world');
    // Right after the bold word, as the paragraph's last node.
    expect(p.lastChild).toBe(container.querySelector('[data-stream-caret]'));
    expect(p.lastElementChild?.previousElementSibling?.tagName).toBe('STRONG');
  });

  it('puts the caret in the last list item and in the code being typed', () => {
    const list = render(<MarkdownView source={'- a\n- b'} streaming />);
    expect(caretParent(list.container)).toBe('LI');
    list.unmount();
    const code = render(<MarkdownView source={'```js\nconst x = 1'} streaming />);
    const caret = code.container.querySelector('[data-stream-caret]')!;
    const codeEl = caret.closest('code')!;
    expect(codeEl).toBeTruthy();
    // On the line being typed: the only thing after the caret is the code's trailing newline.
    expect(caret.nextSibling?.textContent).toBe('\n');
    expect(caret.nextSibling?.nextSibling ?? null).toBeNull();
    expect(codeEl.textContent).toBe('const x = 1\n');
  });

  it('shows a caret alone before the first character, and none once finished', () => {
    const empty = render(<MarkdownView source="" streaming />);
    expect(empty.container.querySelectorAll('[data-stream-caret]')).toHaveLength(1);
    empty.unmount();
    const done = render(<MarkdownView source="Done." />);
    expect(done.container.querySelector('[data-stream-caret]')).toBeNull();
  });

  it('re-parses only the tail block as text streams in', () => {
    const head = '# Title\n\nFirst paragraph.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n';
    const { rerender, container } = render(<MarkdownView source={`${head}Tail`} streaming />);
    mockLoads().parses.length = 0;
    for (const more of [' grows', ' and grows', ' and grows more.']) {
      rerender(<MarkdownView source={`${head}Tail${more}`} streaming />);
    }
    const parses = mockLoads().parses;
    expect(parses).toHaveLength(3);
    expect(parses.every((p) => p.startsWith('Tail'))).toBe(true);
    // Finishing the stream re-renders only the tail (its caret goes away); the finished blocks stay put.
    parses.length = 0;
    rerender(<MarkdownView source={`${head}Tail and grows more.`} />);
    expect(parses).toEqual(['Tail and grows more.']);
    expect(container.querySelector('[data-stream-caret]')).toBeNull();
    expect(container.querySelector('h1')?.textContent).toBe('Title');
    expect(container.querySelector('table')).toBeTruthy();
  });

  it('renders the same DOM split into blocks as one whole-document parse', () => {
    const src = '# H\n\nPara one\nline two\n\n1. a\n\n2. b\n\n   nested para\n\n> quote\n\n```\ncode\n\nmore code\n```\n\nEnd.';
    // The only difference allowed is the whitespace text between top-level elements, which a whole parse
    // keeps and a split parse doesn't. The root is not white-space:pre, so it never renders.
    const norm = (html: string) => html.replace(/>\s+</g, '><');
    const split = render(<MarkdownView source={src} />);
    const html = norm(split.container.innerHTML);
    split.unmount();
    // A reference definition disables splitting, so the same text renders as one block.
    const whole = render(<MarkdownView source={`${src}\n\n[unused]: https://x.example`} />);
    expect(norm(whole.container.innerHTML)).toBe(html);
    expect(html).toContain('<li class="break-words"><p class="whitespace-pre-wrap break-words">b</p><p class="whitespace-pre-wrap break-words">nested para</p></li>');
  });
});

describe('splitMarkdownBlocks', () => {
  it('splits at blank lines between top-level blocks', () => {
    expect(splitMarkdownBlocks('# A\n\npara\n\n- x\n- y')).toEqual(['# A\n', 'para\n', '- x\n- y']);
  });

  it('never splits inside a code fence or a $$ block', () => {
    const src = 'a\n\n```\none\n\ntwo\n```\n\n$$\nx\n\ny\n$$\n\nb';
    expect(splitMarkdownBlocks(src)).toEqual(['a\n', '```\none\n\ntwo\n```\n', '$$\nx\n\ny\n$$\n', 'b']);
  });

  it('keeps a loose list together and keeps indented continuations with their item', () => {
    expect(splitMarkdownBlocks('1. a\n\n2. b\n\n   more about b\n\nafter')).toEqual(['1. a\n\n2. b\n\n   more about b\n', 'after']);
  });

  it('keeps everything in one block when there are reference definitions or footnotes', () => {
    const src = 'See [x][1] and a note[^n].\n\n[1]: https://a.example\n\n[^n]: the note';
    expect(splitMarkdownBlocks(src)).toEqual([src]);
  });

  it('joins back to the original source', () => {
    const src = '# T\n\ntext\n\n```js\nx\n\ny\n```\n\n- a\n\n- b\n\nend\n';
    expect(splitMarkdownBlocks(src).join('\n')).toBe(src);
  });
});

describe('dollars and math delimiters', () => {
  const esc = (s: string) => escapeNonMathDollars(s);

  it('escapes currency but keeps pandoc-style math pairs', () => {
    expect(esc('costs $5 and $10').text).toBe('costs \\$5 and \\$10');
    expect(esc('costs $5 and $10').math).toBe(false);
    expect(esc('from $5-$10').text).toBe('from \\$5-\\$10');
    expect(esc('$x^2$ and $y$').text).toBe('$x^2$ and $y$');
    expect(esc('$x^2$ and $y$').math).toBe(true);
    expect(esc('costs $5, or $x$').text).toBe('costs \\$5, or $x$');
  });

  it('leaves code, escaped dollars and URLs alone', () => {
    expect(esc('`echo $HOME` costs $5').text).toBe('`echo $HOME` costs \\$5');
    expect(esc('```sh\necho $A $B\n```').text).toBe('```sh\necho $A $B\n```');
    expect(esc('already \\$5').text).toBe('already \\$5');
    expect(esc('see https://x.example/?q=$a and [l](https://y.example/$b)').text).toBe('see https://x.example/?q=$a and [l](https://y.example/$b)');
  });

  it('detects code fences and display math', () => {
    expect(esc('```\nx\n```')).toMatchObject({ code: true, math: false });
    expect(esc('$$\nx\n$$')).toMatchObject({ code: false, math: true });
  });

  it('rewrites \\( \\) and \\[ \\] to dollars, outside code', () => {
    expect(normalizeMathDelimiters('inline \\( a+b \\) here')).toBe('inline $a+b$ here');
    expect(normalizeMathDelimiters('\\[\nx^2\n\\]')).toBe('$$\nx^2\n$$');
    expect(normalizeMathDelimiters('\\[ x^2 \\]')).toBe('$$\nx^2\n$$');
    expect(normalizeMathDelimiters('`\\(keep\\)`')).toBe('`\\(keep\\)`');
    expect(normalizeMathDelimiters('item a\\[0\\] and \\[1\\]')).toBe('item a\\[0\\] and \\[1\\]');
    expect(normalizeMathDelimiters('```\n\\(keep\\)\n```')).toBe('```\n\\(keep\\)\n```');
  });

  it('analyzeMarkdown marks only the blocks that need an extension', () => {
    const blocks = analyzeMarkdown('prose $5\n\n```js\nx\n```\n\n$a$');
    expect(blocks.map((b) => [b.code, b.math])).toEqual([[false, false], [true, false], [false, true]]);
    expect(blocks[0]!.source).toBe('prose \\$5\n');
  });
});

describe('rehypeStreamCaret', () => {
  type N = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: N[] };
  const el = (tagName: string, children: N[] = [], properties: Record<string, unknown> = {}): N => ({ type: 'element', tagName, properties, children });
  const txt = (value: string): N => ({ type: 'text', value });

  it('never enters KaTeX output', () => {
    const katex = el('span', [el('span', [txt('x')])], { className: ['katex'] });
    const tree: N = { type: 'root', children: [el('p', [txt('a '), katex])] };
    rehypeStreamCaret()(tree);
    const p = tree.children![0]!;
    expect(p.children!.map((c) => c.tagName ?? c.type)).toEqual(['text', 'span', CARET_TAG]);
  });

  it('skips trailing whitespace text between block elements', () => {
    const tree: N = { type: 'root', children: [el('ul', [txt('\n'), el('li', [txt('a')]), txt('\n')]), txt('\n')] };
    rehypeStreamCaret()(tree);
    const li = tree.children![0]!.children![1]!;
    expect(li.children!.map((c) => c.tagName ?? c.value)).toEqual(['a', CARET_TAG]);
  });
});
