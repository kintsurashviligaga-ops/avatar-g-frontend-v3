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

const norm = (t: string | null | undefined) => (t || '').trim().toLowerCase();

/**
 * Given the device's local conversations + the account's server sessions, return the "cloud" entries to
 * ADD to the sidebar (server sessions not already present locally). Newest-first. The caller maps each
 * to its full conversation shape (empty `messages`, lazy-loaded on open) and unions with the local list.
 */
export function computeCloudAdditions(
  local: readonly SyncConversation[],
  server: readonly ServerSession[],
): SyncConversation[] {
  const localList = Array.isArray(local) ? local : [];
  const knownSids = new Set(localList.map((c) => c?.serverSid).filter((s): s is string => typeof s === 'string' && !!s));
  const localTitles = new Set(localList.map((c) => norm(c?.title)).filter((t) => t && !GENERIC_TITLES.has(t)));

  const out: SyncConversation[] = [];
  const seen = new Set<string>();
  for (const s of Array.isArray(server) ? server : []) {
    if (!s || typeof s.session_id !== 'string' || !s.session_id) continue;
    if (knownSids.has(s.session_id) || seen.has(s.session_id)) continue;
    const tkey = norm(s.title);
    if (tkey && !GENERIC_TITLES.has(tkey) && localTitles.has(tkey)) continue; // same-device duplicate by title
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
