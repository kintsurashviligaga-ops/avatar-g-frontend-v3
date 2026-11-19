/**
 * lib/agent/workspace/paths.ts — the rules for a workspace and the files in it (GG's 2026-11-06 audit, ACTION 2, PH-2).
 *
 * A workspace is a folder of the user's own files that outlives a chat turn: Agent G reads and writes it, a code run
 * gets its files and writes its results back, and every change is a new version (a write or a delete never loses the
 * file before it). It lives in the user's private storage, under their user id (store.ts); nothing here touches it.
 *
 * Pure: names, paths and limits only.
 */

/** The private Storage bucket every workspace lives in (each object under its owner's user id). */
export const WORKSPACE_BUCKET = 'workspaces';

/** Files in one workspace (live, not counting old versions). */
export const WS_MAX_FILES = 200;
/** One file. Large media belongs in the Library, not here. */
export const WS_MAX_FILE_BYTES = 10 * 1024 * 1024;
/** All live files of one workspace together. */
export const WS_MAX_TOTAL_BYTES = 100 * 1024 * 1024;
/** Old versions kept per file; the oldest beyond this is dropped. */
export const WS_MAX_VERSIONS = 10;
/** Workspaces per user. */
export const WS_MAX_WORKSPACES = 20;
/** A path's length in characters. */
export const WS_MAX_PATH_CHARS = 200;
/** A workspace title. */
export const WS_MAX_TITLE_CHARS = 80;

/** A workspace id: what newWorkspaceId makes, nothing a caller could use to walk out of the folder. */
export function isWorkspaceId(v: unknown): v is string {
  return typeof v === 'string' && /^ws_[a-z0-9]{8,32}$/.test(v);
}

/**
 * A file path inside a workspace, as stored: forward slashes, no leading slash, no `.` / `..` / empty parts, no control
 * characters, no backslash. `data/sales.csv` ok; `../x`, `/etc/x`, `a//b`, `a\b` refused (null).
 */
export function normalizeWsPath(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  let p = v.trim().replace(/^\.\/+/, '');
  if (!p || p.length > WS_MAX_PATH_CHARS) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(p)) return null;
  if (p.startsWith('/')) return null;
  p = p.replace(/\/+$/, '');
  const parts = p.split('/');
  if (parts.some((s) => !s || s === '.' || s === '..')) return null;
  // The store and the code runner keep their own files under names starting `.ws` (the manifest, a run's entry file and
  // its start marker); a user file never takes such a name, so it can never overwrite or be mistaken for one.
  if (parts[0]!.startsWith('.ws')) return null;
  return parts.join('/');
}

export function cleanTitle(v: unknown): string {
  const t = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return (t || 'Workspace').slice(0, WS_MAX_TITLE_CHARS);
}

const TYPES: Record<string, string> = {
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', tsv: 'text/tab-separated-values', json: 'application/json',
  py: 'text/x-python', js: 'text/javascript', mjs: 'text/javascript', ts: 'text/plain', html: 'text/html', css: 'text/css',
  xml: 'application/xml', yaml: 'text/yaml', yml: 'text/yaml', sh: 'text/x-shellscript', sql: 'text/plain',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  pdf: 'application/pdf', zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4',
};

export function wsContentType(path: string): string {
  const ext = path.toLowerCase().split('.').pop() ?? '';
  return TYPES[ext] ?? 'application/octet-stream';
}

/** Text Agent G may read as text (the rest it is told the size and type of). */
export function isTextPath(path: string): boolean {
  const t = wsContentType(path);
  return t.startsWith('text/') || t === 'application/json' || t === 'application/xml' || t === 'image/svg+xml';
}
