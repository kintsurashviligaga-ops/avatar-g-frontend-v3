/**
 * lib/connectors/google/drive.ts — the Google Drive connector: the files the user PICKED (scope drive.file, GG
 * 2026-11-01), listed and read as text. Implements the same ConnectorProvider as Local files.
 *
 *   status    'soon' when not configured (driveOAuthConfig null) — exactly as before this file existed.
 *             'unavailable' when configured but the connector_accounts table is missing.
 *             'connectable' when configured and the table is there; per user: 'ready' once linked.
 *   listFiles files.list (drive.file only ever shows files this app was given: the picked ones), supported types only.
 *   read      Docs/Slides → export text/plain, Sheets → export text/csv, PDF/DOCX → download (≤ 10 MB) → text,
 *             TXT/MD/CSV → download as UTF-8. Text is tidied and capped like local files (RESEARCH_FILE_MAX_CHARS).
 *
 * Every call trades the sealed refresh token for a fresh access token. If Google says the grant is gone (the user removed
 * MyAvatar in their Google account), the row is deleted and the answer is not_connected. Nothing here throws.
 */
import { RESEARCH_FILE_MAX_CHARS, safeFileName, tidy } from '@/lib/research/context';
import type { ConnectorFile, ConnectorProvider, ListResult, ReadResult } from '../types';
import { decryptToken } from './crypto';
import { refreshAccessToken, type DriveOAuthConfig } from './oauth';
import type { ConnectorAccountStore } from './store';

const API = 'https://www.googleapis.com/drive/v3/files';
export const DRIVE_MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;
export const DRIVE_LIST_MAX = 50;

/** The Drive types the connector reads, and how. */
export const DRIVE_EXPORT: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.presentation': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
};
export const DRIVE_DOWNLOAD = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/csv',
]);
export const DRIVE_SUPPORTED_MIME = [...Object.keys(DRIVE_EXPORT), ...DRIVE_DOWNLOAD];

/** Drive file ids are URL-safe base64-ish, 10–200 chars. Anything else never reaches a URL. */
export const DRIVE_ID_RE = /^[A-Za-z0-9_-]{10,200}$/;

export type BinaryExtractor = (buf: Buffer, mimeType: string) => Promise<string>;

export interface DriveDeps {
  cfg: DriveOAuthConfig | null;
  store: ConnectorAccountStore | null;
  tableReady: boolean;
  fetch?: typeof fetch;
  extract?: BinaryExtractor;
}

type Token = { ok: true; accessToken: string } | { ok: false; reason: 'not_connected' | 'unavailable' | 'failed' };

/** A fresh access token for this user, or why not. A revoked grant deletes the stored row. */
export async function driveAccessToken(deps: DriveDeps, userId: string): Promise<Token> {
  if (!deps.cfg || !deps.store || !deps.tableReady) return { ok: false, reason: 'unavailable' };
  let row;
  try {
    row = await deps.store.get(userId);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
  if (!row) return { ok: false, reason: 'not_connected' };
  const refresh = decryptToken(row.sealedRefreshToken, userId, deps.cfg.keys);
  if (!refresh) return { ok: false, reason: 'not_connected' };
  const r = await refreshAccessToken(deps.cfg, refresh, deps.fetch);
  if (r.ok) return { ok: true, accessToken: r.accessToken };
  if (r.reason === 'revoked') {
    await deps.store.remove(userId).catch(() => false);
    return { ok: false, reason: 'not_connected' };
  }
  return { ok: false, reason: 'failed' };
}

interface DriveFileJson {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  createdTime?: string;
}

function toFile(f: DriveFileJson): ConnectorFile | null {
  if (!f.id || !DRIVE_ID_RE.test(f.id) || !f.mimeType || !DRIVE_SUPPORTED_MIME.includes(f.mimeType)) return null;
  const bytes = f.size ? Number(f.size) : null;
  return {
    id: f.id,
    name: safeFileName(f.name ?? 'Drive file'),
    mimeType: f.mimeType,
    chars: null,
    bytes: Number.isFinite(bytes) ? bytes : null,
    truncated: false,
    createdAt: f.createdTime ?? null,
  };
}

export async function listDriveFiles(accessToken: string, f: typeof fetch = fetch): Promise<ConnectorFile[] | null> {
  const q = new URLSearchParams({
    q: 'trashed = false',
    pageSize: String(DRIVE_LIST_MAX),
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,mimeType,size,createdTime)',
    spaces: 'drive',
  });
  try {
    const res = await f(`${API}?${q}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const body = (await res.json()) as { files?: DriveFileJson[] };
    return (body.files ?? []).map(toFile).filter((x): x is ConnectorFile => !!x);
  } catch {
    return null;
  }
}

export function capText(raw: string): { text: string; truncated: boolean } {
  const t = tidy(raw);
  if (t.length <= RESEARCH_FILE_MAX_CHARS) return { text: t, truncated: false };
  return { text: `${t.slice(0, RESEARCH_FILE_MAX_CHARS - 1)}…`, truncated: true };
}

/** PDF via unpdf, DOCX via mammoth: the same libraries as /api/utils/extract-text. '' when unreadable. */
export const defaultExtractor: BinaryExtractor = async (buf, mimeType) => {
  try {
    if (mimeType === 'application/pdf') {
      const { extractText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await extractText(pdf, { mergePages: true });
      return String(Array.isArray(text) ? text.join('\n') : text ?? '');
    }
    if (mimeType.includes('wordprocessingml')) {
      const mammoth = (await import('mammoth')) as unknown as { extractRawText?: (o: { buffer: Buffer }) => Promise<{ value: string }>; default?: { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> } };
      const extract = mammoth.extractRawText ?? mammoth.default?.extractRawText;
      return extract ? String((await extract({ buffer: buf })).value ?? '') : '';
    }
    return buf.toString('utf8');
  } catch {
    return '';
  }
};

export async function readDriveFile(accessToken: string, fileId: string, o: { fetch?: typeof fetch; extract?: BinaryExtractor } = {}): Promise<ReadResult> {
  if (!DRIVE_ID_RE.test(fileId)) return { ok: false, reason: 'not_found' };
  const f = o.fetch ?? fetch;
  const auth = { Authorization: `Bearer ${accessToken}` };
  try {
    const metaRes = await f(`${API}/${fileId}?fields=id,name,mimeType,size`, { headers: auth });
    if (metaRes.status === 404 || metaRes.status === 403) return { ok: false, reason: 'not_found' };
    if (!metaRes.ok) return { ok: false, reason: 'failed' };
    const meta = (await metaRes.json()) as DriveFileJson;
    const file = toFile(meta);
    if (!file || !file.mimeType) return { ok: false, reason: 'not_found' };

    const exportAs = DRIVE_EXPORT[file.mimeType];
    let raw: string;
    if (exportAs) {
      const res = await f(`${API}/${fileId}/export?mimeType=${encodeURIComponent(exportAs)}`, { headers: auth });
      if (!res.ok) return { ok: false, reason: 'failed' };
      raw = await res.text();
    } else {
      if (file.bytes !== null && file.bytes > DRIVE_MAX_DOWNLOAD_BYTES) return { ok: false, reason: 'failed' };
      const res = await f(`${API}/${fileId}?alt=media`, { headers: auth });
      if (!res.ok) return { ok: false, reason: 'failed' };
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > DRIVE_MAX_DOWNLOAD_BYTES) return { ok: false, reason: 'failed' };
      raw = await (o.extract ?? defaultExtractor)(buf, file.mimeType);
    }
    const { text } = capText(raw);
    if (!text) return { ok: false, reason: 'failed' };
    return { ok: true, name: file.name, text };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export function driveProvider(deps: DriveDeps): ConnectorProvider {
  return {
    id: 'google_drive',
    label: 'Google Drive',
    status: () => (!deps.cfg ? 'soon' : !deps.store || !deps.tableReady ? 'unavailable' : 'connectable'),
    // The link itself is a browser redirect (/api/connectors/google_drive/connect); here we only say whether it can start.
    connect: async () => (deps.cfg && deps.store && deps.tableReady ? { ok: true } : { ok: false, reason: 'not_available' }),
    async listFiles(userId): Promise<ListResult> {
      const t = await driveAccessToken(deps, userId);
      if (!t.ok) return { ok: false, reason: t.reason === 'not_connected' ? 'not_connected' : t.reason === 'unavailable' ? 'unavailable' : 'failed' };
      const files = await listDriveFiles(t.accessToken, deps.fetch);
      return files ? { ok: true, files } : { ok: false, reason: 'failed' };
    },
    async isLinked(userId) {
      if (!deps.cfg || !deps.store || !deps.tableReady) return false;
      const row = await deps.store.get(userId).catch(() => null);
      return !!row && decryptToken(row.sealedRefreshToken, userId, deps.cfg.keys) !== null;
    },
    async read(userId, fileId): Promise<ReadResult> {
      const t = await driveAccessToken(deps, userId);
      if (!t.ok) return { ok: false, reason: t.reason };
      return readDriveFile(t.accessToken, fileId, { fetch: deps.fetch, extract: deps.extract });
    },
  };
}
