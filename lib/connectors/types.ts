/**
 * lib/connectors/types.ts — the shape of a "connector": a source of the user's OWN documents that research (and, later,
 * the chat) may read besides the open web. Isomorphic: types and constants only.
 *
 * THE HONEST STATE OF EACH CONNECTOR IS PART OF THE CONTRACT. `status` says what works today:
 *   'ready'        wired end to end and usable now (the user's local files)
 *   'soon'         PREPARED on the server (a provider object exists, the listing API answers) but NOT connectable — no OAuth
 *                  flow, no token store. The UI shows "Connect — coming soon" and must never claim more.
 *   'unavailable'  would work but the deployment is missing something (the table is not migrated) — shown as "opening soon".
 *
 * ⚠️ NOTHING BELOW STORES, REQUESTS OR PRETENDS TO HOLD A THIRD-PARTY TOKEN. `connect()` on a 'soon' provider answers
 * `{ ok: false, reason: 'not_available' }`; `listFiles()` / `read()` on it answer `not_connected`. When Google Drive is wired
 * later it implements this same interface (the OAuth flow, the encrypted token storage and the Drive scopes are that
 * project's work — lib/connectors/registry.ts lists what it must provide).
 */

export type ConnectorId = 'local_files' | 'google_drive' | 'onedrive' | 'notion' | 'dropbox';

export type ConnectorStatus = 'ready' | 'soon' | 'unavailable';

/** A file a connector can list (and, once read, hand to research as text). */
export interface ConnectorFile {
  id: string;
  name: string;
  mimeType: string | null;
  /** Characters of extracted text (what a run would fold in), when known. */
  chars: number | null;
  bytes: number | null;
  truncated: boolean;
  createdAt: string | null;
}

export type ConnectResult =
  | { ok: true }
  | { ok: false; reason: 'not_available' | 'not_signed_in' | 'failed' };

export type ListResult =
  | { ok: true; files: ConnectorFile[] }
  | { ok: false; reason: 'not_connected' | 'unavailable' | 'failed' };

export type ReadResult =
  | { ok: true; name: string; text: string }
  | { ok: false; reason: 'not_connected' | 'not_found' | 'unavailable' | 'failed' };

/** What every provider implements. A 'soon' provider answers honestly instead of throwing. */
export interface ConnectorProvider {
  readonly id: ConnectorId;
  /** English name (the UI localizes titles itself). */
  readonly label: string;
  status(): ConnectorStatus | Promise<ConnectorStatus>;
  /** Starts the connection (an OAuth redirect for a cloud drive). Local files need none. */
  connect(userId: string): Promise<ConnectResult>;
  listFiles(userId: string): Promise<ListResult>;
  read(userId: string, fileId: string): Promise<ReadResult>;
}

/** What GET /api/connectors says about each provider — and ONLY this: no tokens, no account data, no scopes. */
export interface ConnectorState {
  id: ConnectorId;
  label: string;
  status: ConnectorStatus;
  /** Files currently held (local files only). */
  fileCount?: number;
}
