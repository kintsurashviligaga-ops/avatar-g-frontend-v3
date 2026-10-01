/**
 * components/chat/artifacts/artifactSpec.ts — what an artifact may be, before anything renders it.
 *
 * Pure (no React, no DOM): the language allowlist and its aliases, the size bound, title derivation, the identity
 * an artifact's versions hang off, and the download name. The canvas, the code-block button and the
 * `myavatar:open-artifact` event all go through `toArtifactInput`, so there is ONE rule for what opens.
 *
 * ⚠️ AN ALLOWLIST, NOT A PASS-THROUGH. The language decides three things downstream: whether the Preview tab exists
 * (html / svg only), which highlight.js grammar colours the Code tab, and the extension + MIME of the download. A
 * free-form language string would reach all three — `language: "html\" onload=…"` is a class name, a file name and
 * a branch condition at once. Unknown languages are refused, never "best-effort" mapped.
 *
 * ⚠️ 200 KB IS MEASURED IN UTF-8 BYTES, NOT `string.length`. Georgian is three bytes a character in UTF-8, so a
 * length check would let 600 KB through as "200 K characters". `utf8ByteLength` counts without allocating.
 */

export const MAX_ARTIFACT_CODE_BYTES = 200 * 1024;
export const MAX_ARTIFACT_TITLE_CHARS = 120;

export interface ArtifactLanguageSpec {
  /** Shown in the canvas header chip and used as the fallback title. */
  label: string;
  /** Download file extension, with the dot. `''` with `fileName` for extension-less files (Dockerfile). */
  ext: string;
  /** Download MIME type. Text types carry the charset so Georgian survives a double-click open. */
  mime: string;
  /** The highlight.js grammar for the Code tab (`detect: false` upstream, so an unknown one just stays plain). */
  hljs: string;
  /** A fixed download name instead of `<title><ext>`. */
  fileName?: string;
}

const TEXT = 'text/plain;charset=utf-8';

/** The canonical languages. Keys are what the store, the class names and the tests see. */
export const ARTIFACT_LANGUAGES = {
  html: { label: 'HTML', ext: '.html', mime: 'text/html;charset=utf-8', hljs: 'xml' },
  svg: { label: 'SVG', ext: '.svg', mime: 'image/svg+xml;charset=utf-8', hljs: 'xml' },
  css: { label: 'CSS', ext: '.css', mime: 'text/css;charset=utf-8', hljs: 'css' },
  scss: { label: 'SCSS', ext: '.scss', mime: TEXT, hljs: 'scss' },
  javascript: { label: 'JavaScript', ext: '.js', mime: 'text/javascript;charset=utf-8', hljs: 'javascript' },
  typescript: { label: 'TypeScript', ext: '.ts', mime: TEXT, hljs: 'typescript' },
  jsx: { label: 'JSX', ext: '.jsx', mime: TEXT, hljs: 'javascript' },
  tsx: { label: 'TSX', ext: '.tsx', mime: TEXT, hljs: 'typescript' },
  json: { label: 'JSON', ext: '.json', mime: 'application/json;charset=utf-8', hljs: 'json' },
  python: { label: 'Python', ext: '.py', mime: TEXT, hljs: 'python' },
  bash: { label: 'Bash', ext: '.sh', mime: TEXT, hljs: 'bash' },
  powershell: { label: 'PowerShell', ext: '.ps1', mime: TEXT, hljs: 'powershell' },
  sql: { label: 'SQL', ext: '.sql', mime: TEXT, hljs: 'sql' },
  markdown: { label: 'Markdown', ext: '.md', mime: 'text/markdown;charset=utf-8', hljs: 'markdown' },
  yaml: { label: 'YAML', ext: '.yaml', mime: TEXT, hljs: 'yaml' },
  toml: { label: 'TOML', ext: '.toml', mime: TEXT, hljs: 'ini' },
  ini: { label: 'INI', ext: '.ini', mime: TEXT, hljs: 'ini' },
  xml: { label: 'XML', ext: '.xml', mime: 'application/xml;charset=utf-8', hljs: 'xml' },
  csv: { label: 'CSV', ext: '.csv', mime: 'text/csv;charset=utf-8', hljs: 'plaintext' },
  graphql: { label: 'GraphQL', ext: '.graphql', mime: TEXT, hljs: 'graphql' },
  java: { label: 'Java', ext: '.java', mime: TEXT, hljs: 'java' },
  kotlin: { label: 'Kotlin', ext: '.kt', mime: TEXT, hljs: 'kotlin' },
  swift: { label: 'Swift', ext: '.swift', mime: TEXT, hljs: 'swift' },
  c: { label: 'C', ext: '.c', mime: TEXT, hljs: 'c' },
  cpp: { label: 'C++', ext: '.cpp', mime: TEXT, hljs: 'cpp' },
  csharp: { label: 'C#', ext: '.cs', mime: TEXT, hljs: 'csharp' },
  go: { label: 'Go', ext: '.go', mime: TEXT, hljs: 'go' },
  rust: { label: 'Rust', ext: '.rs', mime: TEXT, hljs: 'rust' },
  php: { label: 'PHP', ext: '.php', mime: TEXT, hljs: 'php' },
  ruby: { label: 'Ruby', ext: '.rb', mime: TEXT, hljs: 'ruby' },
  lua: { label: 'Lua', ext: '.lua', mime: TEXT, hljs: 'lua' },
  r: { label: 'R', ext: '.r', mime: TEXT, hljs: 'r' },
  dart: { label: 'Dart', ext: '.dart', mime: TEXT, hljs: 'dart' },
  diff: { label: 'Diff', ext: '.diff', mime: TEXT, hljs: 'diff' },
  dockerfile: { label: 'Dockerfile', ext: '', mime: TEXT, hljs: 'dockerfile', fileName: 'Dockerfile' },
  makefile: { label: 'Makefile', ext: '', mime: TEXT, hljs: 'makefile', fileName: 'Makefile' },
  text: { label: 'Text', ext: '.txt', mime: TEXT, hljs: 'plaintext' },
} as const satisfies Record<string, ArtifactLanguageSpec>;

export type ArtifactLanguage = keyof typeof ARTIFACT_LANGUAGES;

/** What models and voice tools actually write in a fence → the canonical key. Lower-case, trimmed. */
const ALIASES: Readonly<Record<string, ArtifactLanguage>> = {
  htm: 'html',
  xhtml: 'html',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  node: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  py: 'python',
  python3: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  ps1: 'powershell',
  pwsh: 'powershell',
  postgres: 'sql',
  postgresql: 'sql',
  mysql: 'sql',
  md: 'markdown',
  yml: 'yaml',
  jsonc: 'json',
  json5: 'json',
  'c++': 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  'c#': 'csharp',
  golang: 'go',
  rs: 'rust',
  rb: 'ruby',
  kt: 'kotlin',
  gql: 'graphql',
  patch: 'diff',
  docker: 'dockerfile',
  make: 'makefile',
  txt: 'text',
  plaintext: 'text',
  plain: 'text',
};

const LANGUAGE_RE = /^[a-z0-9#+.-]{1,24}$/;

/** A fence label or an event's `language` → the canonical key, or null when it is not on the allowlist. */
export function normalizeArtifactLanguage(raw: unknown): ArtifactLanguage | null {
  if (typeof raw !== 'string') return null;
  const id = raw.trim().toLowerCase();
  if (!LANGUAGE_RE.test(id)) return null;
  if (Object.prototype.hasOwnProperty.call(ARTIFACT_LANGUAGES, id)) return id as ArtifactLanguage;
  return Object.prototype.hasOwnProperty.call(ALIASES, id) ? ALIASES[id]! : null;
}

/** Only these get a Preview tab (a sandboxed iframe); everything else is Code only. */
export function isPreviewable(language: ArtifactLanguage): language is 'html' | 'svg' {
  return language === 'html' || language === 'svg';
}

/** UTF-8 byte length without allocating a buffer. Stops counting once past `stopAfter`. */
export function utf8ByteLength(s: string, stopAfter = Number.POSITIVE_INFINITY): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      bytes += 4; // a surrogate pair is one 4-byte code point
      i += 1;
    } else bytes += 3; // the rest of the BMP, and a lone surrogate (encoded as U+FFFD, 3 bytes)
    if (bytes > stopAfter) return bytes;
  }
  return bytes;
}

/** True when `code` is within the 200 KB bound. A UTF-16 unit is at least one UTF-8 byte, so a long string fails fast. */
export function fitsArtifactBound(code: string): boolean {
  if (code.length > MAX_ARTIFACT_CODE_BYTES) return false;
  return utf8ByteLength(code, MAX_ARTIFACT_CODE_BYTES) <= MAX_ARTIFACT_CODE_BYTES;
}

// C0/C1 controls and the bidi overrides/isolates: a title is one visible line, and an RLO could make "evil.exe"
// read as "exe.live" in the header and in the download name.
// eslint-disable-next-line no-control-regex
const TITLE_STRIP_RE = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;

/** A caller-supplied title → one bounded visible line, or null when nothing visible is left. */
export function sanitizeArtifactTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const clean = raw.slice(0, MAX_ARTIFACT_TITLE_CHARS * 4).replace(TITLE_STRIP_RE, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return Array.from(clean).slice(0, MAX_ARTIFACT_TITLE_CHARS).join('').trim() || null;
}

const HTML_ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeBasicEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_m, name: string) => HTML_ENTITIES[name] ?? '');
}

/** The document's own `<title>` (HTML or SVG), else an HTML page's first `<h1>`. Looks at the first 20 KB only. */
function titleFromMarkup(code: string, language: 'html' | 'svg'): string | null {
  const head = code.slice(0, 20_000);
  const title = /<title\b[^>]{0,200}>([^<]{1,300})<\/title>/i.exec(head)?.[1];
  const h1 = language === 'html' ? /<h1\b[^>]{0,200}>([^<]{1,300})<\/h1>/i.exec(head)?.[1] : undefined;
  return sanitizeArtifactTitle(decodeBasicEntities(title ?? h1 ?? ''));
}

/** The title an artifact shows when its producer gave none: the markup's own title, else the language's name. */
export function deriveArtifactTitle(language: ArtifactLanguage, code: string): string {
  if (isPreviewable(language)) {
    const t = titleFromMarkup(code, language);
    if (t) return t;
  }
  return ARTIFACT_LANGUAGES[language].label;
}

/**
 * The identity versions hang off: language + case-folded title.
 *
 * ⚠️ WHY NOT A HASH OF THE CODE. A version is "the same thing, changed": the user asks for a todo page, then says
 * "make the button blue", and the model re-sends the WHOLE page under the same `<title>`. Keyed by title, the second
 * page lands as v2 of the first, and the canvas can step back to v1. Untitled snippets share their language's id
 * ("Python"), so a follow-up fix of a script is its next version too; identical code is never stored twice (the
 * store re-selects the existing version instead).
 */
export function artifactIdFor(language: ArtifactLanguage, title: string): string {
  return `${language}:${title.toLocaleLowerCase('en-US')}`;
}

export interface ArtifactInput {
  id: string;
  title: string;
  language: ArtifactLanguage;
  code: string;
}

/**
 * The one gate in front of the canvas. `title` is optional; `language` must be on the allowlist; `code` must be a
 * non-blank string within 200 KB. Returns null for anything else — a malformed event is dropped, never half-opened.
 */
export function toArtifactInput(raw: { title?: unknown; language?: unknown; code?: unknown }): ArtifactInput | null {
  const language = normalizeArtifactLanguage(raw.language);
  if (!language) return null;
  const code = raw.code;
  if (typeof code !== 'string' || !code.trim() || !fitsArtifactBound(code)) return null;
  const title = sanitizeArtifactTitle(raw.title) ?? deriveArtifactTitle(language, code);
  return { id: artifactIdFor(language, title), title, language, code };
}

/** A download name from the title: letters (any script), digits, `-` and `_`; never a path, never empty. */
export function artifactFileName(artifact: Pick<ArtifactInput, 'title' | 'language'>): string {
  const spec: ArtifactLanguageSpec = ARTIFACT_LANGUAGES[artifact.language];
  if (spec.fileName) return spec.fileName;
  const base = artifact.title
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '');
  const bounded = Array.from(base).slice(0, 60).join('').replace(/[-_]+$/, '');
  return `${bounded || 'artifact'}${spec.ext}`;
}
