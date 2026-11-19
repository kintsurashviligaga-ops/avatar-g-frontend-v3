/**
 * lib/connectors/registry.ts — the list of connectors and the honest state of each. GET /api/connectors answers from here.
 *
 *   Local files    WORKS. Upload → extract text → stored per user → attachable to a Deep Research run. (localFiles.ts)
 *   Google Drive   WIRED when configured (Phase 4, lib/connectors/google/*): scope drive.file, only the files the user
 *                  picks. Without GOOGLE_OAUTH_CLIENT_ID/SECRET + CONNECTOR_TOKEN_KEY it stays the honest 'soon' provider.
 *   OneDrive · Notion · Dropbox   the same — "soon", named so the Connectors view can show where this is heading.
 *
 * ⚠️ DRIVE CONNECTS ONLY WHEN FULLY CONFIGURED (lib/connectors/google/oauth driveOAuthConfig), the connector_accounts
 * table exists (migration 20261101a) and CONNECTORS_DRIVE opens it to this user. Refresh tokens are sealed with
 * AES-256-GCM; no access token is stored; disconnect revokes at Google. Never a fake "connected", never a fake file list.
 */
import type { ConnectorFile, ConnectorId, ConnectorProvider, ConnectorState, ConnectorStatus } from './types';
import type { LocalFilesStore } from './localFiles';
import { driveProvider, type DriveDeps } from './google/drive';

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
  /** Google Drive (Phase 4). Absent or unconfigured = the old honest 'soon' provider. */
  drive?: DriveDeps;
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
  return [
    localFilesProvider(deps),
    ...SOON_CONNECTORS.map((c) => (c.id === 'google_drive' && deps.drive?.cfg ? driveProvider(deps.drive) : soonProvider(c.id, c.label))),
  ];
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
    if (status === 'connectable' && p.isLinked) state.linked = userId ? await p.isLinked(userId).catch(() => false) : false;
    out.push(state);
  }
  return out;
}

export type { ConnectorFile };
