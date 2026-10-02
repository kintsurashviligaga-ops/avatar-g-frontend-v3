/**
 * lib/connectors/registry.ts — the list of connectors and the honest state of each. GET /api/connectors answers from here.
 *
 *   Local files    WORKS. Upload → extract text → stored per user → attachable to a Deep Research run. (localFiles.ts)
 *   Google Drive   NOT WIRED. A provider object that says so: connect() refuses, listFiles()/read() answer not_connected.
 *   OneDrive · Notion · Dropbox   the same — "soon", named so the Connectors view can show where this is heading.
 *
 * ⚠️ DRIVE IS NOT CONNECTED, AND NOTHING HERE CAN CONNECT IT. No OAuth client, no redirect, no consent screen, no token
 * column, no scope request. What wiring it needs (none of which exists):
 *   1. a Google OAuth client with the `drive.readonly` scope (or the narrower `drive.file` + the Picker), verified by Google;
 *   2. an authorization-code flow (/api/connectors/google_drive/connect → callback) with a signed `state`;
 *   3. refresh tokens stored ENCRYPTED (a new table, written by service_role only), a disconnect route that revokes them;
 *   4. listFiles() over Drive's files.list and read() exporting Docs/Sheets to text (files.export) or downloading PDFs through
 *      /api/utils/extract-text, with the same per-file and total caps as local files;
 *   5. a privacy-policy line and a consent text (lib/legal/content.ts) before any real user can connect.
 * Until then the status stays 'soon' and the UI says "coming soon" — never "connected", never a fake file list.
 */
import type { ConnectorFile, ConnectorId, ConnectorProvider, ConnectorState, ConnectorStatus } from './types';
import type { LocalFilesStore } from './localFiles';

/** The "coming soon" providers, in the order the Connectors view shows them after Local files. */
export const SOON_CONNECTORS: ReadonlyArray<{ id: Exclude<ConnectorId, 'local_files'>; label: string }> = [
  { id: 'google_drive', label: 'Google Drive' },
  { id: 'onedrive', label: 'OneDrive' },
  { id: 'notion', label: 'Notion' },
  { id: 'dropbox', label: 'Dropbox' },
];

/** A provider that exists so the structure is ready, and answers honestly that it cannot connect yet. */
export function soonProvider(id: ConnectorId, label: string): ConnectorProvider {
  return {
    id,
    label,
    status: () => 'soon',
    connect: async () => ({ ok: false, reason: 'not_available' }),
    listFiles: async () => ({ ok: false, reason: 'not_connected' }),
    read: async () => ({ ok: false, reason: 'not_connected' }),
  };
}

export interface RegistryDeps {
  /** null when the service-role client is unavailable. */
  localFiles: LocalFilesStore | null;
  /** The research_context_files table exists (schema probe). */
  filesTableReady: boolean;
}

export function localFilesProvider(deps: RegistryDeps): ConnectorProvider {
  const store = deps.localFiles;
  const usable = !!store && deps.filesTableReady;
  return {
    id: 'local_files',
    label: 'Local files',
    status: (): ConnectorStatus => (usable ? 'ready' : 'unavailable'),
    // Nothing to connect: the files are uploaded straight into the user's own list.
    connect: async () => (usable ? { ok: true } : { ok: false, reason: 'not_available' }),
    async listFiles(userId) {
      if (!usable) return { ok: false, reason: 'unavailable' };
      try {
        return { ok: true, files: await store!.list(userId) };
      } catch {
        return { ok: false, reason: 'failed' };
      }
    },
    async read(userId, fileId) {
      if (!usable) return { ok: false, reason: 'unavailable' };
      const out = await store!.loadForRun(userId, [fileId]);
      if (!out.ok) return { ok: false, reason: out.code === 'invalid_file' ? 'not_found' : 'unavailable' };
      const f = out.files[0];
      return f ? { ok: true, name: f.name, text: f.text } : { ok: false, reason: 'not_found' };
    },
  };
}

export function connectorRegistry(deps: RegistryDeps): ConnectorProvider[] {
  return [localFilesProvider(deps), ...SOON_CONNECTORS.map((c) => soonProvider(c.id, c.label))];
}

/** The states the API returns: status per provider, and the file count for Local files. No tokens, no account data. */
export async function connectorStates(userId: string | null, providers: ConnectorProvider[]): Promise<ConnectorState[]> {
  const out: ConnectorState[] = [];
  for (const p of providers) {
    const status = await p.status();
    const state: ConnectorState = { id: p.id, label: p.label, status };
    if (p.id === 'local_files' && status === 'ready' && userId) {
      const listed = await p.listFiles(userId);
      if (listed.ok) state.fileCount = listed.files.length;
    }
    out.push(state);
  }
  return out;
}

export type { ConnectorFile };
