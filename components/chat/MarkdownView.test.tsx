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
import { readFileSync } from 'fs';
import { join } from 'path';
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
  HighlightedCode,
  MarkdownView,
  analyzeMarkdown,
  escapeNonMathDollars,
  fenceCode,
  loadHighlightExtension,
  loadMathExtension,
  normalizeMathDelimiters,
  safeUrlTransform,
  splitMarkdownBlocks,
} from './MarkdownView';
import { resetArtifactStore, useArtifactStore } from './artifacts/artifactStore';
import { MAX_ARTIFACT_CODE_BYTES } from './artifacts/artifactSpec';

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

  it('inline code stays inline, in neutral text rather than the accent', () => {
    const { container } = render(<MarkdownView source={'Run `npm test` now.'} />);
    const code = container.querySelector('p code')!;
    expect(code.textContent).toBe('npm test');
    expect(code.className).toContain('text-app-text');
    expect(code.className).not.toContain('text-app-accent');
    expect(container.querySelector('[data-md-code]')).toBeNull();
  });

  it('spaces top-level blocks from the root, 16 px apart with more above h1 and h2', () => {
    const { container } = render(<MarkdownView source={'Intro.\n\n## Part\n\nBody.'} />);
    const root = container.querySelector('[data-md-root]')!;
    const cls = root.className.split(' ');
    // `space-y-*` outranked every margin on a child, so heading margins never applied; the root owns the rhythm.
    expect(cls.some((c) => c.startsWith('space-y-'))).toBe(false);
    expect(cls).toEqual(expect.arrayContaining(['[&>*+*]:mt-4', '[&>*+h1]:mt-6', '[&>*+h2]:mt-5', '[&>:first-child]:mt-0', '[&>:last-child]:mb-0']));
    // Body text keeps the Georgian reading size and height.
    expect(cls).toEqual(expect.arrayContaining(['text-[16px]', 'leading-[1.7]']));
    expect(container.querySelector('h2')?.className).toContain('text-[19px]');
  });

  it('keeps table text at the 16 px body size and blockquotes upright and neutral', () => {
    const { container } = render(<MarkdownView source={'| ა | ბ |\n|---|---|\n| 1 | 2 |\n\n> ციტატა'} />);
    expect(container.querySelector('table')?.className).toContain('text-[16px]');
    const quote = container.querySelector('blockquote')!;
    expect(quote.className).not.toMatch(/\bitalic\b/);
    expect(quote.className).not.toContain('app-accent');
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
  const root = (container: HTMLElement) => container.querySelector('[data-md-root]')!;

  it('draws no caret: while streaming the root fades new blocks in, and a finished reply does not', () => {
    const { container } = render(<MarkdownView source={'First.\n\nHello **world**'} streaming />);
    expect(container.querySelector('[data-stream-caret]')).toBeNull();
    expect(container.innerHTML).not.toContain('mya-caret');
    expect(root(container).classList.contains('mya-fade-children')).toBe(true);
    // The paragraph ends at the last word; nothing trails it.
    const last = container.querySelectorAll('p')[1]!;
    expect(last.textContent).toBe('Hello world');
    expect(last.lastElementChild?.tagName).toBe('STRONG');

    const done = render(<MarkdownView source="Done." />);
    expect(root(done.container).classList.contains('mya-fade-children')).toBe(false);
  });

  it('renders an empty root before the first character', () => {
    const { container } = render(<MarkdownView source="" streaming />);
    expect(root(container).childElementCount).toBe(0);
  });

  it('keeps a block\'s elements while the next one arrives, so only the new block fades in', () => {
    // A CSS animation runs when its element is inserted. The first paragraph must stay the SAME node as the
    // reply grows, or its fade would replay on every new block.
    const { rerender, container } = render(<MarkdownView source={'First para'} streaming />);
    const first = container.querySelector('p')!;
    rerender(<MarkdownView source={'First paragraph.'} streaming />);
    expect(container.querySelector('p')).toBe(first);
    rerender(<MarkdownView source={'First paragraph.\n\nSecond'} streaming />);
    const ps = container.querySelectorAll('p');
    expect(ps).toHaveLength(2);
    expect(ps[0]).toBe(first);
    // Finishing only drops the class: the same nodes stay on screen, so the handoff can't flash.
    rerender(<MarkdownView source={'First paragraph.\n\nSecond'} />);
    expect(container.querySelectorAll('p')[0]).toBe(first);
    expect(container.querySelectorAll('p')[1]).toBe(ps[1]);
    expect(root(container).classList.contains('mya-fade-children')).toBe(false);
  });

  it('the fade is opacity-only, 180 ms, and off under reduced motion (app/globals.css)', () => {
    const css = readFileSync(join(__dirname, '../../app/globals.css'), 'utf8');
    const keyframes = /@keyframes mya-fade\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(keyframes).toMatch(/opacity:\s*0/);
    // `fadeIn` rises 8 px, which jitters each new paragraph; this one must not move anything.
    expect(keyframes).not.toContain('transform');
    expect(css).toMatch(/\.mya-fade-children > \*\s*\{\s*animation:\s*mya-fade 180ms/);
    const reduced = Array.from(css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)).map((m) => m[1]).join('\n');
    expect(reduced).toContain('.mya-fade-children > *');
    expect(reduced).toContain('.mya-fade,');
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
    // Finishing the stream re-parses nothing: the fade flag lives on the root, not on the memoized blocks.
    parses.length = 0;
    rerender(<MarkdownView source={`${head}Tail and grows more.`} />);
    expect(parses).toEqual([]);
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
    expect(html).toContain('<li class="break-words [&amp;>*+*]:mt-2"><p class="whitespace-pre-wrap break-words">b</p><p class="whitespace-pre-wrap break-words">nested para</p></li>');
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

describe('"Open in canvas" on a code block', () => {
  // ⚠️ WHAT THESE PIN. The button exists only (1) once the reply has finished streaming, (2) while a canvas is
  // mounted somewhere (`registerHost`), (3) for a language on the artifact allowlist, (4) within 200 KB. html / svg
  // say "Preview" and land on the Preview tab; everything else says "Open in canvas". Flipping `streaming` must not
  // re-parse a block: the flag reaches CodeBlock through context.
  let unregister: (() => void) | null = null;
  const mountHost = () => {
    unregister = useArtifactStore.getState().registerHost();
  };
  beforeEach(() => resetArtifactStore());
  // Runs before RTL's own cleanup (a nested afterEach), so the blocks are still mounted: the store update needs act.
  afterEach(() =>
    act(() => {
      unregister?.();
      unregister = null;
    }),
  );
  const canvasButton = (container: HTMLElement) => container.querySelector('[data-md-open-canvas]');

  it('is absent when no canvas is mounted, even on a finished reply', () => {
    const { container, getByRole } = render(<MarkdownView source={'```python\nprint(1)\n```'} locale="en" />);
    expect(canvasButton(container)).toBeNull();
    expect(getByRole('button', { name: 'Copy' })).toBeTruthy(); // Copy is unaffected
  });

  it('is absent while the reply streams and appears when it finishes, without re-parsing the block', () => {
    mountHost();
    const src = 'Here:\n\n```python\nprint(1)\n```';
    const { container, rerender, queryByRole, getByRole } = render(<MarkdownView source={src} streaming locale="en" />);
    expect(canvasButton(container)).toBeNull();
    expect(queryByRole('button', { name: 'Open in canvas' })).toBeNull();
    mockLoads().parses.length = 0;
    rerender(<MarkdownView source={src} locale="en" />);
    expect(getByRole('button', { name: 'Open in canvas' })).toBeTruthy();
    expect(mockLoads().parses).toEqual([]);
  });

  it('appears once a canvas mounts, and goes when it unmounts', () => {
    const { container } = render(<MarkdownView source={'```js\nx()\n```'} locale="en" />);
    expect(canvasButton(container)).toBeNull();
    act(() => mountHost());
    expect(canvasButton(container)).toBeTruthy();
    act(() => {
      unregister?.();
      unregister = null;
    });
    expect(canvasButton(container)).toBeNull();
  });

  it('html and svg say "Preview"; other languages and unlabelled fences say "Open in canvas"', () => {
    mountHost();
    const { container } = render(
      <MarkdownView source={'```html\n<p>a</p>\n```\n\n```svg\n<svg/>\n```\n\n```ts\nlet a = 1;\n```\n\n```\nplain\n```'} locale="en" />,
    );
    const buttons = Array.from(container.querySelectorAll('[data-md-open-canvas]'));
    expect(buttons.map((b) => [b.getAttribute('data-md-open-canvas'), b.getAttribute('aria-label')])).toEqual([
      ['html', 'Preview'],
      ['svg', 'Preview'],
      ['typescript', 'Open in canvas'],
      ['text', 'Open in canvas'],
    ]);
  });

  it('is absent for a language off the allowlist and for code over 200 KB', () => {
    mountHost();
    const big = 'x'.repeat(MAX_ARTIFACT_CODE_BYTES + 10);
    const { container } = render(<MarkdownView source={`\`\`\`mermaid\ngraph TD\n\`\`\`\n\n\`\`\`text\n${big}\n\`\`\``} locale="en" />);
    expect(container.querySelectorAll('[data-md-code]')).toHaveLength(2);
    expect(canvasButton(container)).toBeNull();
  });

  it('localizes the label (Georgian)', () => {
    mountHost();
    const { getByRole } = render(<MarkdownView source={'```html\n<p>a</p>\n```\n\n```py\nx\n```'} locale="ka" />);
    expect(getByRole('button', { name: 'გადახედვა' })).toBeTruthy();
    expect(getByRole('button', { name: 'კანვასში გახსნა' })).toBeTruthy();
  });

  it('opens the raw code in the canvas store, html on the Preview tab', async () => {
    mountHost();
    await act(async () => {
      await loadHighlightExtension(); // the click must read the code back out of the highlighted token spans
    });
    const html = '<!doctype html>\n<title>Clock</title>\n<p>12:00</p>';
    const { getByRole } = render(<MarkdownView source={`\`\`\`html\n${html}\n\`\`\`\n\n\`\`\`python\nprint("გამარჯობა")\n\`\`\``} locale="en" />);
    await settle();
    fireEvent.click(getByRole('button', { name: 'Preview' }));
    expect(useArtifactStore.getState()).toMatchObject({
      open: true,
      tab: 'preview',
      current: { id: 'html:clock', title: 'Clock', language: 'html', code: html },
    });
    fireEvent.click(getByRole('button', { name: 'Open in canvas' }));
    expect(useArtifactStore.getState()).toMatchObject({ tab: 'code', current: { language: 'python', code: 'print("გამარჯობა")' } });
  });
});

describe('HighlightedCode (the canvas Code tab)', () => {
  it('renders the code exactly, highlighted with the chat theme, with no header or buttons', async () => {
    await act(async () => {
      await loadHighlightExtension();
    });
    const code = 'const a = 1;\n// ქართული\n';
    const { container } = render(<HighlightedCode code={code} language="ts" />);
    await settle();
    const pre = container.querySelector('[data-artifact-code]')!;
    expect(pre.textContent).toBe(`${code}\n`);
    expect(container.querySelector('.hljs-keyword')?.textContent).toBe('const');
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('[data-md-code]')).toBeNull();
  });

  it('code containing a fence cannot close its own block', () => {
    const code = 'before\n```\nnot the end\n````\nafter';
    expect(fenceCode(code, 'markdown').startsWith('`````markdown\n')).toBe(true);
    const { container } = render(<HighlightedCode code={code} language="markdown" />);
    expect(container.querySelectorAll('pre')).toHaveLength(1);
    expect(container.querySelector('pre')!.textContent).toBe(`${code}\n`);
  });

  it('never renders markup in the code as HTML', () => {
    const { container } = render(<HighlightedCode code={'<img src=x onerror="alert(1)"><script>alert(2)</script>'} language="html" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(2)</script>');
  });
});
