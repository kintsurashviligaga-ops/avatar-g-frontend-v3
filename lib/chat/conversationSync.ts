/**
 * lib/chat/conversationSync.ts — pure reconciliation for cross-device chat-sidebar hydration (P: chat sync).
 *
 * The OmniStudio chat already writes every turn to Supabase (saveMessage) and resumes the ACTIVE
 * transcript cross-device. The remaining gap: a device with its own localStorage conversations never
 * pulls the OTHER conversations the account made elsewhere. This computes the "cloud" sidebar entries
 * to ADD — one per server session not already represented locally — so the sidebar mirrors the account
 * across PC / iPad / iPhone. Additive + non-destructive by construction (it only returns ADDITIONS;
 * the caller unions them with local, never deletes). Pure + unit-tested (no I/O).
 *
 * Dedup, so a conversation made on THIS device (which is also on the server) never doubles:
 *   1. by `serverSid` — a local conversation already tagged with the server session id, and
 *   2. by title — a local conversation whose title (first user message) matches the server session's
 *      (same first message ⇒ same conversation), ignoring the generic "new chat" placeholder titles.
 */

export interface SyncConversation {
  id: string;
  title: string;
  updatedAt: number;
  /** The Supabase chat_sessions.session_id this conversation maps to (set once persisted / hydrated). */
  serverSid?: string;
}

export interface ServerSession {
  session_id: string;
  title: string | null;
  updated_at: string;
}

const GENERIC_TITLES = new Set(['new chat', 'ახალი ჩატი', 'новый чат', 'chat', 'chat…', '']);

const norm = (t: string | null | undefined) => (t || '').trim().replace(/\s+/g, ' ').toLowerCase();

/** The server session a row stands for: its `serverSid`, or the id of a `cloud:` row. */
function sidOf(c: { id?: string; serverSid?: string } | null | undefined): string | null {
  if (!c) return null;
  if (typeof c.serverSid === 'string' && c.serverSid) return c.serverSid;
  if (typeof c.id === 'string' && c.id.startsWith('cloud:')) return c.id.slice('cloud:'.length) || null;
  return null;
}

/**
 * One first line, cut two ways: the sidebar keeps 52 characters and an ellipsis, the server title 80. A long first message
 * never matched itself, so the title check below never caught it.
 */
function sameTitle(local: string, server: string): boolean {
  if (local === server) return true;
  const a = local.replace(/…$/, '').trimEnd();
  const b = server.replace(/…$/, '').trimEnd();
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  return short.length >= 24 && long.startsWith(short);
}

/** A row of the device's archive, as far as this module needs it. */
export interface ArchiveRow { id: string; updatedAt?: number; serverSid?: string; messages?: readonly unknown[]; tool?: string }

/**
 * The archive with each conversation once: one row per id, and one per server session. A device that already holds
 * copies (the re-import above) is healed on its next read. The row kept is the one with the transcript, then the newest;
 * it keeps the server session id and the service of the copies it replaces.
 */
export function dedupeConversations<T extends ArchiveRow>(list: readonly T[]): T[] {
  const rows = Array.isArray(list) ? list.filter((c) => !!c && typeof c.id === 'string') : [];
  // Union-find over the rows: two rows are one conversation when they share an id or a server session.
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const firstBy = new Map<string, number>();
  rows.forEach((c, i) => {
    for (const k of [`i:${c.id}`, ...(sidOf(c) ? [`s:${sidOf(c)}`] : [])]) {
      const j = firstBy.get(k);
      if (j === undefined) firstBy.set(k, i);
      else parent[find(i)] = find(j);
    }
  });
  const score = (c: T) => ((c.messages?.length ?? 0) > 0 ? 1 : 0);
  const better = (a: T, b: T) => (score(a) !== score(b) ? score(a) > score(b) : (a.updatedAt ?? 0) > (b.updatedAt ?? 0));
  const groups = new Map<number, T[]>();
  rows.forEach((c, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), c]); });
  const out: T[] = [];
  rows.forEach((_, i) => {
    const g = groups.get(i);
    if (!g) return;
    let keep = g[0]!;
    for (const x of g) if (better(x, keep)) keep = x;
    const sid = g.map(sidOf).find((v): v is string => !!v);
    const tool = keep.tool ?? g.map((x) => x.tool).find((t): t is string => !!t);
    out.push({ ...keep, ...(sid && !keep.serverSid ? { serverSid: sid } : {}), ...(tool && !keep.tool ? { tool } : {}) });
  });
  return out;
}

/**
 * Given the device's local conversations + the account's server sessions, return the "cloud" entries to
 * ADD to the sidebar (server sessions not already present locally). Newest-first. The caller maps each
 * to its full conversation shape (empty `messages`, lazy-loaded on open) and unions with the local list.
 */
export function computeCloudAdditions(
  local: readonly SyncConversation[],
  server: readonly ServerSession[],
  deletedSids: readonly string[] = [],
): SyncConversation[] {
  const localList = Array.isArray(local) ? local : [];
  // ⚠️ A `cloud:<sid>` ROW IS THAT SESSION EVEN WITHOUT ITS `serverSid` FIELD. Opening a cloud row rewrote it without the
  // field, so the next mount saw the session as "not here" and imported it again under the SAME id — two sidebar rows,
  // then more, each one a click on the history away from the next (owner's report 2026-10-09 18:26Z).
  const knownSids = new Set(localList.map((c) => sidOf(c)).filter((s): s is string => !!s));
  const localTitles = localList.map((c) => norm(c?.title)).filter((t) => t && !GENERIC_TITLES.has(t));
  // ⚠️ DELETING A CHAT USED TO BRING IT STRAIGHT BACK, AND THIS IS WHERE. `knownSids` is built from the
  // LOCAL list, so removing a conversation also removed its serverSid from that set — which made its
  // server session "not known here" and re-imported it as a fresh `cloud:` row on the very next sync.
  // Deleting one chat resurrected exactly that chat. "Clear all" wiped the whole local key, so it
  // resurrected EVERYTHING. The delete was working; this was undoing it.
  //
  // Tombstones are the memory of what the user deleted, and they are consulted FIRST — independently of
  // the local list — because the local row being gone is precisely the condition that caused the bug.
  const tombstoned = new Set(
    (Array.isArray(deletedSids) ? deletedSids : []).filter((s): s is string => typeof s === 'string' && !!s),
  );

  const out: SyncConversation[] = [];
  const seen = new Set<string>();
  for (const s of Array.isArray(server) ? server : []) {
    if (!s || typeof s.session_id !== 'string' || !s.session_id) continue;
    if (tombstoned.has(s.session_id)) continue;
    if (knownSids.has(s.session_id) || seen.has(s.session_id)) continue;
    const tkey = norm(s.title);
    if (tkey && !GENERIC_TITLES.has(tkey) && localTitles.some((t) => sameTitle(t, tkey))) continue; // same-device duplicate by title
    seen.add(s.session_id);
    const parsed = Date.parse(s.updated_at);
    out.push({
      id: `cloud:${s.session_id}`,
      serverSid: s.session_id,
      title: (s.title || '').trim() || 'Chat',
      updatedAt: Number.isFinite(parsed) ? parsed : 0,
    });
  }
  return out.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}
