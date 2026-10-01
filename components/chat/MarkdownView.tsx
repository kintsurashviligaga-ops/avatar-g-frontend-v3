'use client';

/**
 * components/chat/MarkdownView.tsx — the one renderer for assistant replies.
 *
 * GitHub-flavoured markdown on the `app-*` theme tokens, so it follows light/dark: tables, task lists,
 * code blocks with a language label and a copy button that is always visible, syntax highlighting, and
 * KaTeX math. It is promoted from the private renderer in `MyAvatarChatV2.tsx` (which used hard-coded dark
 * colours) and replaces the body of `components/studio/Markdown.tsx`, which now delegates here.
 *
 * ⚠️ HIGHLIGHTING AND MATH ARE LOADED ONLY WHEN A REPLY NEEDS THEM. highlight.js grammars, KaTeX and its
 * stylesheet together outweigh the rest of the chat UI, and most replies are prose. They are dynamic
 * imports, fetched the first time a fenced code block or a math span appears. Until the chunk arrives the
 * block renders as plain text, then once more with colour. Static imports here would put all of it into
 * the dashboard's first-load bundle.
 *
 * ⚠️ ONLY THE TAIL RE-PARSES WHILE STREAMING. Re-parsing the whole growing reply on every frame is O(n²)
 * over the answer: a 3,000-word reply with tables and code went through micromark hundreds of times. The
 * source is split at blank lines into top-level blocks, and each block is a memoized component keyed by
 * its own text. Finished blocks keep their text, so React skips them, and only the last block re-parses.
 * The split is conservative (see `splitMarkdownBlocks`): it never cuts inside a code fence or a display
 * math block, never splits a loose list, and falls back to one block when the reply has reference-style
 * links or footnotes, whose definitions live in a different block from their uses. So the rendered DOM is
 * the same as one whole-document parse, and the finished bubble looks exactly like the streaming one.
 *
 * ⚠️ NO CARET WHILE STREAMING; THE NEWEST BLOCK FADES IN (Gemini parity). While `streaming` is true the root
 * carries `mya-fade-children` (app/globals.css): every top-level element fades in, opacity only, over 180 ms.
 * A CSS animation runs once, when its element is inserted, and React keeps a block's elements while its text
 * grows, so only a block that has just appeared fades; the paragraph being typed doesn't blink on every frame,
 * and the blocks above it never replay. Dropping the class when the stream ends changes nothing on screen,
 * which keeps the handoff to the committed bubble pixel-identical. The flag is deliberately NOT a prop of the
 * memoized block, so finishing a stream re-parses nothing.
 *
 * ⚠️ SPACING IS ONE RULE ON THE ROOT, NOT MARGINS ON THE ELEMENTS. Blocks sit 16 px apart (Gemini) with a
 * little more above h1/h2, set by `[&>*+*]` rules on the root. Tailwind's `space-y-*` can't do this: its
 * selector outranks any margin class on a child, so heading margins set on the heading never applied.
 *
 * ⚠️ LINKS ARE SANITIZED HERE, NOT TRUSTED FROM THE MODEL. A reply is untrusted text: prompt-injected
 * grounding results can carry `javascript:` links. `safeUrlTransform` keeps http(s), mailto, tel and
 * relative links only (control characters are stripped before the check, the way a browser would strip
 * them) and every external link opens with `rel="noopener noreferrer nofollow"`.
 *
 * ⚠️ `$` IS NOT ALWAYS MATH. remark-math reads "$5 and $10" as the formula "5 and ". Before parsing,
 * `escapeNonMathDollars` keeps only pandoc-style pairs (no space inside the delimiters, no digit right
 * after the closer, no `$` in between) and escapes every other dollar. Prices stay prices.
 *
 * The prose inherits the page font, so the Georgian stack (`var(--font-georgian)`, Noto Sans Georgian)
 * applies unchanged. Code uses a monospace stack that ends in the Georgian faces, so Georgian comments in
 * code don't fall back to an arbitrary system font.
 */

import {
  Children,
  createContext,
  isValidElement,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
import ReactMarkdown, { type Components, type Options as ReactMarkdownOptions } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';

type MdLocale = 'ka' | 'en' | 'ru';
type Pluggable = NonNullable<ReactMarkdownOptions['rehypePlugins']>[number];

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

/** A list item marker at column 0: `- `, `* `, `+ `, `1. ` or `1) `. */
const LIST_ITEM = /^(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;
/** Link reference or footnote definitions. Their uses may sit in another block, so the reply isn't split. */
const REFERENCE_DEFINITION = /^ {0,3}\[[^\]\n]+\]:/m;
const FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})(.*)$/;

interface Fence {
  ch: '`' | '~';
  len: number;
}

function openFence(line: string): Fence | null {
  const m = FENCE_OPEN.exec(line);
  if (!m) return null;
  const marker = m[1]!;
  const ch = marker[0] as '`' | '~';
  // A backtick fence's info string may not contain a backtick (that line is inline code, not a fence).
  if (ch === '`' && (m[2] ?? '').includes('`')) return null;
  return { ch, len: marker.length };
}

function closesFence(line: string, fence: Fence): boolean {
  const t = line.trim();
  if (t.length < fence.len) return false;
  for (let i = 0; i < t.length; i++) if (t[i] !== fence.ch) return false;
  return true;
}

/** A line that opens a multi-line `$$` display block (and doesn't close it on the same line). */
function opensMathBlock(line: string): boolean {
  const t = line.trim();
  if (!t.startsWith('$$')) return false;
  if (t === '$$') return true;
  return !(t.length > 4 && t.endsWith('$$'));
}

function closesMathBlock(line: string): boolean {
  return line.trim().endsWith('$$');
}

/**
 * Splits a markdown source into top-level blocks, at blank lines where CommonMark would also start a new
 * block, so rendering the blocks one after another gives the same DOM as rendering the whole source.
 * A split happens only at a blank line followed by a line at column 0 that is not a list item, or that
 * is a list item when the text before it is not a list. Never inside a code fence or a `$$` block.
 */
export function splitMarkdownBlocks(src: string): string[] {
  if (!src) return [];
  if (REFERENCE_DEFINITION.test(src)) return [src];
  const lines = src.split('\n');
  const blocks: string[] = [];
  let start = 0;
  let fence: Fence | null = null;
  let inMath = false;
  let afterBlank = false;
  let inListContext = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      afterBlank = false;
      continue;
    }
    if (inMath) {
      if (closesMathBlock(line)) inMath = false;
      afterBlank = false;
      continue;
    }
    if (line.trim() === '') {
      afterBlank = true;
      continue;
    }
    const atColumnZero = line[0] !== ' ' && line[0] !== '\t';
    if (atColumnZero) {
      const isListItem = LIST_ITEM.test(line);
      if (afterBlank && i > start && (!isListItem || !inListContext)) {
        blocks.push(lines.slice(start, i).join('\n'));
        start = i;
      }
      inListContext = isListItem;
    }
    afterBlank = false;
    const f = openFence(line);
    if (f) {
      fence = f;
      continue;
    }
    if (opensMathBlock(line)) inMath = true;
  }
  blocks.push(lines.slice(start).join('\n'));
  return blocks;
}

/**
 * Rewrites LaTeX-style delimiters that remark-math doesn't know into dollar delimiters, outside code:
 * `\[ … \]` on its own lines becomes a `$$` block, and `\( … \)` becomes `$…$`.
 *
 * ⚠️ `\[ … \]` IN THE MIDDLE OF A SENTENCE IS LEFT ALONE. Models escape literal brackets (`a\[0\]`,
 * `\[1\]`), and turning those into formulas would print an index in the math font. Display math from a
 * model sits on its own lines, and inline math uses `\( … \)`.
 */
export function normalizeMathDelimiters(src: string): string {
  if (!src.includes('\\(') && !src.includes('\\[')) return src;
  const lines = src.split('\n');
  let fence: Fence | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    const f = openFence(line);
    if (f) {
      fence = f;
      continue;
    }
    const t = line.trim();
    if (t === '\\[' || t === '\\]') {
      // A replacer function, not the string '$$': in a replacement string `$$` means one literal `$`.
      lines[i] = line.replace(t, () => '$$');
      continue;
    }
    const whole = /^([ \t]*)\\\[(.+)\\\][ \t]*$/.exec(line);
    if (whole) {
      lines[i] = `${whole[1]}$$\n${whole[1]}${whole[2]!.trim()}\n${whole[1]}$$`;
      continue;
    }
    if (!line.includes('\\(')) continue;
    lines[i] = mapOutsideCodeSpans(line, (seg) => seg.replace(/\\\((.+?)\\\)/g, (_m, inner: string) => `$${inner.trim()}$`));
  }
  return lines.join('\n');
}

/** Applies `fn` to the parts of one line that are not inline code spans (backtick runs of equal length). */
function mapOutsideCodeSpans(line: string, fn: (text: string) => string): string {
  if (!line.includes('`')) return fn(line);
  let out = '';
  let text = '';
  let i = 0;
  while (i < line.length) {
    const ch = line[i]!;
    if (ch === '\\' && i + 1 < line.length) {
      text += ch + line[i + 1]!;
      i += 2;
      continue;
    }
    if (ch !== '`') {
      text += ch;
      i += 1;
      continue;
    }
    let n = 0;
    while (line[i + n] === '`') n += 1;
    const run = '`'.repeat(n);
    // The closing run must be exactly as long as the opening one.
    let j = i + n;
    let close = -1;
    while (j < line.length) {
      const k = line.indexOf(run, j);
      if (k === -1) break;
      if (line[k + n] !== '`' && (k === 0 || line[k - 1] !== '`')) {
        close = k;
        break;
      }
      j = k + 1;
      while (line[j] === '`') j += 1;
    }
    if (close === -1) {
      text += run;
      i += n;
      continue;
    }
    out += fn(text) + line.slice(i, close + n);
    text = '';
    i = close + n;
  }
  return out + fn(text);
}

function isEscaped(s: string, i: number): boolean {
  let n = 0;
  for (let k = i - 1; k >= 0 && s[k] === '\\'; k--) n += 1;
  return n % 2 === 1;
}

const WS = /\s/;
const DIGIT = /[0-9]/;

/** URLs and link destinations. A `$` inside one is part of the address, never math and never escaped. */
const URLISH = /\]\([^)\s]*\)|<[a-z][a-z0-9+.-]*:[^>\s]*>|(?:https?:\/\/|www\.)[^\s<>]*/gi;

function protectedRanges(seg: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  URLISH.lastIndex = 0;
  for (let m = URLISH.exec(seg); m; m = URLISH.exec(seg)) out.push([m.index, m.index + m[0].length]);
  return out;
}

/** Escapes the dollars of one text segment that can't be math. Returns whether any math survived. */
function escapeDollarsInSegment(seg: string): { text: string; math: boolean } {
  if (!seg.includes('$')) return { text: seg, math: false };
  const guarded = protectedRanges(seg);
  const inUrl = (i: number) => guarded.some(([a, b]) => i >= a && i < b);
  const singles: number[] = [];
  const doubles: Array<[number, number]> = []; // [start, length] of runs of 2+ dollars
  for (let i = 0; i < seg.length; i++) {
    if (seg[i] !== '$' || isEscaped(seg, i) || inUrl(i)) continue;
    let n = 1;
    while (seg[i + n] === '$') n += 1;
    if (n === 1) singles.push(i);
    else doubles.push([i, n]);
    i += n - 1;
  }
  const escape = new Set<number>();
  let math = false;
  // Runs of `$$` are inline display math only when they come in pairs; a lone one is literal.
  if (doubles.length % 2 === 1) {
    const [s, n] = doubles[doubles.length - 1]!;
    for (let k = 0; k < n; k++) escape.add(s + k);
  }
  if (doubles.length >= 2) math = true;
  // Single dollars pair up pandoc-style: the opener is followed by a non-space, the closer is preceded by a
  // non-space and not followed by a digit, and the closer is the very next dollar.
  let i = 0;
  while (i < singles.length) {
    const open = singles[i]!;
    const close = singles[i + 1];
    const openOk = open + 1 < seg.length && !WS.test(seg[open + 1]!);
    const closeOk =
      close !== undefined &&
      close > open + 1 &&
      !WS.test(seg[close - 1]!) &&
      !(close + 1 < seg.length && DIGIT.test(seg[close + 1]!));
    if (openOk && closeOk) {
      math = true;
      i += 2;
    } else {
      escape.add(open);
      i += 1;
    }
  }
  if (escape.size === 0) return { text: seg, math };
  let out = '';
  for (let k = 0; k < seg.length; k++) out += escape.has(k) ? '\\$' : seg[k];
  return { text: out, math };
}

export interface MarkdownBlockInfo {
  /** The block's markdown, with non-math dollars escaped. */
  source: string;
  /** Has a fenced code block (loads the highlighter). */
  code: boolean;
  /** Has math (loads KaTeX). */
  math: boolean;
}

/** Escapes every dollar in one block that can't be math, outside code. Tracks fences and `$$` blocks. */
export function escapeNonMathDollars(block: string): { text: string; math: boolean; code: boolean } {
  const lines = block.split('\n');
  let fence: Fence | null = null;
  let inMath = false;
  let math = false;
  let code = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    if (inMath) {
      if (closesMathBlock(line)) inMath = false;
      continue;
    }
    const f = openFence(line);
    if (f) {
      fence = f;
      code = true;
      continue;
    }
    if (opensMathBlock(line)) {
      inMath = true;
      math = true;
      continue;
    }
    if (!line.includes('$')) continue;
    lines[i] = mapOutsideCodeSpans(line, (seg) => {
      const r = escapeDollarsInSegment(seg);
      if (r.math) math = true;
      return r.text;
    });
  }
  return { text: lines.join('\n'), math, code };
}

/** Normalizes math delimiters, splits into blocks, and marks which blocks need the lazy extensions. */
export function analyzeMarkdown(src: string): MarkdownBlockInfo[] {
  return splitMarkdownBlocks(normalizeMathDelimiters(src)).map((b) => {
    const r = escapeNonMathDollars(b);
    return { source: r.text, code: r.code, math: r.math };
  });
}

const SAFE_LINK_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
const SAFE_IMAGE_SCHEMES = new Set(['http', 'https']);
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;

/**
 * react-markdown `urlTransform`: keeps http(s), mailto and tel links, and relative or in-page links.
 * Images may be http(s) or a base64 raster `data:` URL. Anything else becomes '' (the link is dropped).
 */
export function safeUrlTransform(url: string, key?: string): string {
  const value = String(url ?? '').trim();
  if (!value) return '';
  // Browsers ignore tabs, newlines and other control characters inside a scheme ("java\tscript:"), so the
  // check runs on the URL with them removed.
  // eslint-disable-next-line no-control-regex
  const probe = value.replace(/[\u0000- \u007f]/g, '');
  const colon = probe.indexOf(':');
  const firstDelim = probe.search(/[/?#]/);
  const hasScheme = colon > 0 && (firstDelim === -1 || colon < firstDelim);
  const isImage = key === 'src';
  if (!hasScheme) return colon === 0 ? '' : value;
  const scheme = probe.slice(0, colon).toLowerCase();
  if (isImage) {
    if (scheme === 'data') return SAFE_DATA_IMAGE.test(probe) ? value : '';
    return SAFE_IMAGE_SCHEMES.has(scheme) ? value : '';
  }
  return SAFE_LINK_SCHEMES.has(scheme) ? value : '';
}

// ─── Lazy extensions (highlight, math) ───────────────────────────────────────

interface MathPlugins {
  remark: Pluggable;
  rehype: Pluggable;
}

interface MarkdownExtensions {
  highlight: Pluggable | null;
  math: MathPlugins | null;
}

let extensions: MarkdownExtensions = { highlight: null, math: null };
const extensionListeners = new Set<() => void>();
let highlightLoad: Promise<void> | null = null;
let mathLoad: Promise<void> | null = null;

function setExtensions(next: MarkdownExtensions) {
  extensions = next;
  for (const l of Array.from(extensionListeners)) l();
}

function subscribeExtensions(listener: () => void) {
  extensionListeners.add(listener);
  return () => {
    extensionListeners.delete(listener);
  };
}

function getExtensions(): MarkdownExtensions {
  return extensions;
}

/**
 * Loads rehype-highlight (and its highlight.js grammars) once. A failed chunk load may be retried later.
 *
 * ⚠️ ONLY LABELLED FENCES ARE HIGHLIGHTED (`detect: false`). Auto-detection guesses: it labelled a plain
 * two-line snippet "css" and coloured shell output as if it were code, and the language label then showed
 * the guess as fact. It also runs every grammar, which is too slow to repeat on the block being typed.
 * An unlabelled fence renders as plain monospace with the label "code".
 */
export function loadHighlightExtension(): Promise<void> {
  if (!highlightLoad) {
    highlightLoad = import('rehype-highlight')
      .then((mod) => {
        const plugin: Pluggable = [mod.default, { detect: false }];
        setExtensions({ ...extensions, highlight: plugin });
      })
      .catch((_err) => {
        highlightLoad = null; // offline or a stale deploy's chunk; plain code blocks are still fine
      });
  }
  return highlightLoad;
}

/** Loads remark-math, rehype-katex and the KaTeX stylesheet once. */
export function loadMathExtension(): Promise<void> {
  if (!mathLoad) {
    mathLoad = Promise.all([
      import('remark-math'),
      import('rehype-katex'),
      // Plain CSS has no type declarations; the `as string` only silences tsc. The bundler still sees the
      // literal specifier and emits the stylesheet into this lazy chunk.
      import('katex/dist/katex.min.css' as string),
    ])
      .then(([remarkMath, rehypeKatex]) => {
        setExtensions({
          ...extensions,
          math: {
            remark: [remarkMath.default, { singleDollarTextMath: true }],
            // strict:false — Georgian or Cyrillic letters inside a formula would otherwise log a warning each.
            rehype: [rehypeKatex.default, { throwOnError: false, strict: false }],
          },
        });
      })
      .catch((_err) => {
        mathLoad = null;
      });
  }
  return mathLoad;
}

// ─── Rendering ───────────────────────────────────────────────────────────────

const MarkdownLocaleContext = createContext<MdLocale | undefined>(undefined);

const COPY_LABELS: Record<MdLocale, { copy: string; copied: string }> = {
  ka: { copy: 'კოპირება', copied: 'დაკოპირდა' },
  en: { copy: 'Copy', copied: 'Copied' },
  ru: { copy: 'Копировать', copied: 'Скопировано' },
};

/** Monospace first, then the Georgian faces the prose uses, so Georgian comments in code match the text. */
const MONO_STACK =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', var(--font-georgian), 'Noto Sans Georgian', monospace";

/**
 * highlight.js token colours on the theme tokens, so code follows light/dark like the rest of the page
 * (no highlight.js theme stylesheet is shipped). The palette stays inside the brand's black/white/cyan
 * system: keywords take the accent, literals the warning tone, comments the muted tone.
 */
const HLJS_THEME = [
  '[&_.hljs-comment]:italic [&_.hljs-comment]:text-app-muted [&_.hljs-quote]:italic [&_.hljs-quote]:text-app-muted',
  '[&_.hljs-keyword]:text-app-accent [&_.hljs-selector-tag]:text-app-accent [&_.hljs-doctag]:text-app-accent',
  '[&_.hljs-built_in]:text-app-accent/80 [&_.hljs-type]:text-app-accent/80 [&_.hljs-class]:text-app-accent/80',
  '[&_.hljs-string]:text-app-warning [&_.hljs-regexp]:text-app-warning [&_.hljs-addition]:text-app-warning',
  '[&_.hljs-number]:text-app-warning [&_.hljs-literal]:text-app-warning [&_.hljs-symbol]:text-app-warning [&_.hljs-bullet]:text-app-warning',
  '[&_.hljs-title]:font-semibold [&_.hljs-section]:font-semibold [&_.hljs-name]:text-app-accent',
  '[&_.hljs-attr]:text-app-accent/70 [&_.hljs-attribute]:text-app-accent/70 [&_.hljs-property]:text-app-accent/70',
  '[&_.hljs-meta]:text-app-muted [&_.hljs-deletion]:text-app-danger',
  '[&_.hljs-emphasis]:italic [&_.hljs-strong]:font-semibold',
].join(' ');

/** Flattens rendered children (including highlight.js token spans) back to the raw source for Copy. */
function nodeToText(node: ReactNode): string {
  if (node == null || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join('');
  if (isValidElement(node)) return nodeToText((node.props as { children?: ReactNode }).children);
  return '';
}

function languageOf(className: string | undefined): string {
  const m = /(?:^|\s)language-([^\s]+)/.exec(className ?? '');
  return m ? m[1]!.toLowerCase() : '';
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_err) {
    /* denied: try the legacy path */
  }
  // Insecure origins and some in-app webviews have no async clipboard.
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (_err) {
    return false;
  }
}

function CodeBlock({ className, children }: { className?: string; children?: ReactNode }) {
  const locale = useContext(MarkdownLocaleContext) ?? 'en';
  const labels = COPY_LABELS[locale];
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lang = languageOf(className);
  // Read at click time from the latest children, so a copy during streaming takes what is on screen.
  const childrenRef = useRef(children);
  childrenRef.current = children;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = useCallback(async () => {
    const ok = await copyText(nodeToText(childrenRef.current).replace(/\n$/, ''));
    if (!ok) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }, []);

  // Gemini's code surface: one elevated panel, the language and Copy on its first row with no divider.
  return (
    <div className="my-2 overflow-hidden rounded-2xl bg-app-elevated ring-1 ring-app-border/10" data-md-code="">
      <div className="flex items-center justify-between gap-2 pl-4 pr-1.5 pt-1">
        <span className="truncate text-[12px] font-medium lowercase tracking-wide text-app-muted" style={{ fontFamily: MONO_STACK }}>
          {lang || 'code'}
        </span>
        {/* ⚠️ Always visible. The old button was opacity-0 until hover, so on a phone it did not exist. */}
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? labels.copied : labels.copy}
          title={labels.copy}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] text-app-muted transition-colors hover:bg-app-border/10 hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 [@media(pointer:fine)]:h-8"
        >
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          <span>{copied ? labels.copied : labels.copy}</span>
        </button>
      </div>
      <pre className={`overflow-x-auto px-4 pb-4 pt-1 text-[14px] leading-[1.6] text-app-text ${HLJS_THEME}`}>
        <code className={className} style={{ fontFamily: MONO_STACK }}>
          {children}
        </code>
      </pre>
    </div>
  );
}

type WithNode<P> = P & { node?: unknown };

function isExternal(href: string): boolean {
  return /^(?:https?:)?\/\//i.test(href);
}

const COMPONENTS: Components = {
  a: ({ node: _n, href, children, ...props }) => {
    if (!href) return <span className="text-app-text">{children}</span>; // an unsafe link, dropped by urlTransform
    const external = isExternal(href);
    return (
      <a
        {...props}
        href={href}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}
        className="break-words text-app-accent underline-offset-2 hover:underline"
      >
        {children}
      </a>
    );
  },
  img: ({ node: _n, src, alt, ...props }) => {
    if (!src) return null;
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} src={src} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" className="my-2 max-h-[60vh] max-w-full rounded-xl bg-black/20 object-contain ring-1 ring-app-border/10" />;
  },
  p: ({ node: _n, ...props }) => <p {...props} className="whitespace-pre-wrap break-words" />,
  // Gemini's lists: 8 px between items, a deeper indent, muted markers.
  ul: ({ node: _n, ...props }) => <ul {...props} className="list-disc space-y-2 pl-6 marker:text-app-muted" />,
  ol: ({ node: _n, ...props }) => <ol {...props} className="list-decimal space-y-2 pl-6 marker:text-app-muted" />,
  // A nested list or a loose item's second paragraph sits 8 px under the text before it.
  li: ({ node: _n, ...props }) => <li {...props} className="break-words [&>*+*]:mt-2" />,
  strong: ({ node: _n, ...props }) => <strong {...props} className="font-semibold text-app-text" />,
  em: ({ node: _n, ...props }) => <em {...props} className="italic" />,
  // Headings: Gemini's scale. The line-heights stay above the 1.1 Georgian floor for display text (DESIGN §3),
  // and nothing drops below the 16 px body size. At the top level the root sets the space above them.
  h1: ({ node: _n, ...props }) => <h1 {...props} className="mb-2 mt-6 text-[22px] font-semibold leading-[1.35]" />,
  h2: ({ node: _n, ...props }) => <h2 {...props} className="mb-2 mt-5 text-[19px] font-semibold leading-[1.4]" />,
  h3: ({ node: _n, ...props }) => <h3 {...props} className="mb-1.5 mt-4 text-[17px] font-semibold leading-[1.45]" />,
  h4: ({ node: _n, ...props }) => <h4 {...props} className="mb-1 mt-4 text-[16px] font-semibold leading-[1.5]" />,
  h5: ({ node: _n, ...props }) => <h5 {...props} className="mb-1 mt-3 text-[16px] font-medium leading-[1.5]" />,
  h6: ({ node: _n, ...props }) => <h6 {...props} className="mb-1 mt-3 text-[16px] font-medium leading-[1.5] text-app-muted" />,
  // A neutral rule, not the accent (one accent, DESIGN §2), and upright: Noto Sans Georgian has no italic, so
  // an italic quote was a synthetic slant.
  blockquote: ({ node: _n, ...props }) => <blockquote {...props} className="border-l-2 border-app-border/20 pl-4 text-app-muted [&>*+*]:mt-2" />,
  hr: () => <hr className="my-3 border-app-border/10" />,
  // Table text is reading text, so it keeps the 16 px body size (Georgian minimum) and scrolls sideways.
  table: ({ node: _n, ...props }) => (
    <div className="my-2 overflow-x-auto rounded-2xl ring-1 ring-app-border/10">
      <table {...props} className="w-full border-collapse text-[16px] leading-[1.6]" />
    </div>
  ),
  thead: ({ node: _n, ...props }) => <thead {...props} className="bg-app-elevated" />,
  th: ({ node: _n, ...props }) => <th {...props} className="px-4 py-2 text-left font-semibold text-app-text" />,
  td: ({ node: _n, ...props }) => <td {...props} className="border-t border-app-border/10 px-4 py-2 align-top" />,
  // A fenced block arrives as <pre><code class="language-x">. The <pre> is replaced by CodeBlock, which
  // draws its own <pre>, so block code never nests <pre><div><pre>.
  pre: ({ node: _n, children }: WithNode<{ children?: ReactNode }>) => {
    const child = Children.toArray(children).find(isValidElement) as ReactElement<{ className?: string; children?: ReactNode }> | undefined;
    if (!child) return <pre className="overflow-x-auto">{children}</pre>;
    return <CodeBlock className={child.props.className}>{child.props.children}</CodeBlock>;
  },
  // Only inline code reaches here as rendered output; block code is rendered by `pre` above. Neutral text, as
  // in Gemini: the accent on every code span overspent the one accent.
  code: ({ node: _n, className, children }: WithNode<{ className?: string; children?: ReactNode }>) => (
    <code className={`rounded-md bg-app-elevated px-1.5 py-0.5 text-[0.875em] text-app-text ${className ?? ''}`} style={{ fontFamily: MONO_STACK }}>
      {children}
    </code>
  ),
};

const REMARK_BASE: Pluggable[] = [remarkGfm];

interface MarkdownBlockProps {
  source: string;
  highlight: Pluggable | null;
  math: MathPlugins | null;
}

// One top-level block. Memoized on its own text and plugin set, so a finished block never re-parses.
const MarkdownBlock = memo(function MarkdownBlock({ source, highlight, math }: MarkdownBlockProps) {
  const remarkPlugins = math ? [...REMARK_BASE, math.remark] : REMARK_BASE;
  const rehypePlugins: Pluggable[] = [];
  if (math) rehypePlugins.push(math.rehype);
  if (highlight) rehypePlugins.push(highlight);
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={COMPONENTS} urlTransform={safeUrlTransform}>
      {source}
    </ReactMarkdown>
  );
});

export interface MarkdownViewProps {
  /** The markdown source (an assistant reply). */
  source: string;
  /** True while the reply is still arriving: each block fades in as it appears (see the header). */
  streaming?: boolean;
  /** Labels the code copy button. Defaults to English. */
  locale?: MdLocale;
  /** Extra classes on the root. */
  className?: string;
}

/**
 * 16 px / 1.7 body (Georgian needs the height; Gemini's 17/24 is too tight for it), 16 px between blocks and
 * 24 / 20 px above a top-level h1 / h2. The flow rules are arbitrary variants, which Tailwind emits after the
 * plain utilities, so they also win over a child's own `my-*` (a code block, a table) at the top level, where
 * the root owns the rhythm. The first and last child sit flush with the bubble.
 */
const ROOT_CLASS = [
  'min-w-0 break-words text-[16px] leading-[1.7]',
  '[&>*+*]:mt-4 [&>*+h1]:mt-6 [&>*+h2]:mt-5',
  '[&>:first-child]:mt-0 [&>:last-child]:mb-0',
].join(' ');

/** app/globals.css: the root's children fade in once, as they are inserted. Only while streaming. */
const STREAMING_CLASS = 'mya-fade-children';

function MarkdownViewImpl({ source, streaming = false, locale, className }: MarkdownViewProps) {
  const ext = useSyncExternalStore(subscribeExtensions, getExtensions, getExtensions);
  const blocks = useMemo(() => analyzeMarkdown(source ?? ''), [source]);
  const needsCode = blocks.some((b) => b.code);
  const needsMath = blocks.some((b) => b.math);

  useEffect(() => {
    if (needsCode) void loadHighlightExtension();
  }, [needsCode]);
  useEffect(() => {
    if (needsMath) void loadMathExtension();
  }, [needsMath]);

  const rootClass = [ROOT_CLASS, streaming ? STREAMING_CLASS : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <MarkdownLocaleContext.Provider value={locale}>
      <div className={rootClass} data-md-root="">
        {blocks.map((b, i) => (
          <MarkdownBlock
            key={i}
            source={b.source}
            // Only the blocks that need an extension get it, so a chunk loading doesn't re-parse the others.
            highlight={b.code ? ext.highlight : null}
            math={b.math ? ext.math : null}
          />
        ))}
      </div>
    </MarkdownLocaleContext.Provider>
  );
}

/** Memoized on its props: history bubbles whose text did not change never re-render. */
export const MarkdownView = memo(MarkdownViewImpl);

export default MarkdownView;
