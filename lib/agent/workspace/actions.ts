/**
 * lib/agent/workspace/actions.ts — every workspace action a signed-in user (or Agent G for them) can take, as one pure
 * function over injected effects; /api/agent/workspace and Agent G's tools both go through it.
 *
 *   list                                 the user's workspaces
 *   create   {title}                     a new workspace
 *   files    {workspaceId}               its live files (path, size, version, who wrote it)
 *   read     {workspaceId, path, v?}     a text file's text (cut at READ_TEXT_MAX), or a download link for any other
 *   write    {workspaceId, path, text | base64}   a new version (the old one stays)
 *   delete   {workspaceId, path}         marks it deleted; its versions stay
 *   restore  {workspaceId, path, v}      brings version v back as the newest
 *   history  {workspaceId, path}         its kept versions, newest first
 *   link     {workspaceId, path}         a download link for 7 days
 *   export   {workspaceId, path}         a copy in the Library (pictures → Images, everything else → Docs)
 *
 * The user id always comes from the session (the route) or the agent's context, never from the body.
 */
import { isTextPath, wsContentType, WS_MAX_FILE_BYTES } from './paths';
import type { WorkspaceStore, WsError } from './store';

/** Text handed back by `read` (the agent's context and the UI both stay small); longer files say they were cut. */
export const READ_TEXT_MAX = 200 * 1024;
/** A body the route can take (Vercel's request limit is 4.5 MB; base64 is 4/3 of the bytes). */
export const WRITE_BODY_MAX_BYTES = 3 * 1024 * 1024;

export interface ExportDeps {
  /** Copy bytes into the Library's storage and file them; returns the Library item's id, or null. */
  toLibrary(input: { userId: string; path: string; bytes: Buffer; contentType: string; kind: 'image' | 'document' }): Promise<string | null>;
}

export type ActionResult = { status: number; body: Record<string, unknown> };

const STATUS: Record<WsError, number> = { bad_input: 400, not_found: 404, too_large: 413, too_many: 409, storage_failed: 503 };
const bad = (message: string): ActionResult => ({ status: 400, body: { ok: false, error: 'bad_input', message } });
function out<T extends Record<string, unknown>>(r: ({ ok: true } & T) | { ok: false; error: WsError; message: string }): ActionResult {
  return r.ok ? { status: 200, body: r } : { status: STATUS[r.error], body: r };
}

function bytesOf(body: Record<string, unknown>): Buffer | string {
  if (typeof body.text === 'string') return Buffer.from(body.text, 'utf8');
  if (typeof body.base64 === 'string') {
    if (!/^[A-Za-z0-9+/=\s]*$/.test(body.base64)) return 'base64: not base64';
    return Buffer.from(body.base64, 'base64');
  }
  return 'text or base64 is needed';
}

export async function workspaceAction(
  store: WorkspaceStore,
  exp: ExportDeps | null,
  userId: string,
  body: Record<string, unknown>,
  by: 'user' | 'agent' = 'user',
): Promise<ActionResult> {
  const ws = typeof body.workspaceId === 'string' ? body.workspaceId : '';
  const v = typeof body.v === 'number' && Number.isInteger(body.v) && body.v > 0 ? body.v : undefined;
  switch (body.action) {
    case 'list': return out(await store.list(userId));
    case 'create': return out(await store.create(userId, body.title));
    case 'files': return out(await store.files(userId, ws));
    case 'history': return out(await store.history(userId, ws, body.path));
    case 'link': return out(await store.link(userId, ws, body.path));
    case 'delete': return out(await store.remove(userId, ws, body.path, by));
    case 'restore':
      if (!v) return bad('v: the version to bring back');
      return out(await store.restore(userId, ws, body.path, v, by));
    case 'write': {
      const b = bytesOf(body);
      if (typeof b === 'string') return bad(b);
      if (b.length > Math.min(WS_MAX_FILE_BYTES, WRITE_BODY_MAX_BYTES)) {
        return { status: 413, body: { ok: false, error: 'too_large', message: 'At most 3 MB per upload here.' } };
      }
      return out(await store.write(userId, ws, body.path, b, by));
    }
    case 'read': {
      const r = await store.read(userId, ws, body.path, v);
      if (!r.ok) return out(r);
      const meta = { path: r.path, version: r.version, type: wsContentType(r.path) };
      if (isTextPath(r.path)) {
        const cut = r.bytes.length > READ_TEXT_MAX;
        return { status: 200, body: { ok: true, ...meta, text: r.bytes.subarray(0, READ_TEXT_MAX).toString('utf8'), cut } };
      }
      // Not text: its size and a link, never raw bytes in a JSON answer.
      const link = v === undefined ? await store.link(userId, ws, r.path) : null;
      return { status: 200, body: { ok: true, ...meta, bytes: r.bytes.length, ...(link?.ok ? { url: link.url } : {}) } };
    }
    case 'export': {
      if (!exp) return { status: 503, body: { ok: false, error: 'not_configured', message: 'The Library is not configured.' } };
      const r = await store.read(userId, ws, body.path);
      if (!r.ok) return out(r);
      const type = wsContentType(r.path);
      if (type.startsWith('audio/') || type.startsWith('video/')) {
        return bad('Sound and video files are shared by their download link, not filed in the Library.');
      }
      const kind = type.startsWith('image/') && type !== 'image/svg+xml' ? 'image' : 'document';
      const id = await exp.toLibrary({ userId, path: r.path, bytes: r.bytes, contentType: type, kind }).catch(() => null);
      if (!id) return { status: 503, body: { ok: false, error: 'storage_failed', message: 'The Library did not take the file.' } };
      return { status: 200, body: { ok: true, path: r.path, libraryId: id, kind } };
    }
    default:
      return bad('action: list, create, files, read, write, delete, restore, history, link or export');
  }
}
