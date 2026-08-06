import { computeCloudAdditions, type SyncConversation, type ServerSession } from './conversationSync';

const local = (id: string, title: string, updatedAt: number, serverSid?: string): SyncConversation => ({ id, title, updatedAt, ...(serverSid ? { serverSid } : {}) });
const srv = (session_id: string, title: string | null, updated_at: string): ServerSession => ({ session_id, title, updated_at });

describe('computeCloudAdditions — cross-device sidebar hydration', () => {
  it('adds server sessions that are not represented locally, newest-first', () => {
    const out = computeCloudAdditions(
      [local('c_1', 'Local chat', 1000)],
      [srv('s_a', 'Older server chat', '2026-01-01T00:00:00Z'), srv('s_b', 'Newer server chat', '2026-06-01T00:00:00Z')],
    );
    expect(out.map((c) => c.serverSid)).toEqual(['s_b', 's_a']); // newest-first
    expect(out[0]!.id).toBe('cloud:s_b');
    expect(out[0]!.title).toBe('Newer server chat');
  });

  it('dedupes by serverSid (a local conversation already tagged with the session id)', () => {
    const out = computeCloudAdditions(
      [local('c_1', 'Tagged', 1000, 's_a')],
      [srv('s_a', 'Same session', '2026-01-01T00:00:00Z'), srv('s_b', 'New one', '2026-02-01T00:00:00Z')],
    );
    expect(out.map((c) => c.serverSid)).toEqual(['s_b']); // s_a already local → skipped
  });

  it('dedupes by TITLE so a same-device conversation never doubles', () => {
    const out = computeCloudAdditions(
      [local('c_1', 'Make me a WWII film', 1000)], // synced to server but not serverSid-tagged
      [srv('s_a', 'Make me a WWII film', '2026-01-01T00:00:00Z'), srv('s_b', 'Different chat', '2026-01-02T00:00:00Z')],
    );
    expect(out.map((c) => c.serverSid)).toEqual(['s_b']); // title match → s_a skipped
  });

  it('does NOT dedup generic placeholder titles (real distinct chats survive)', () => {
    const out = computeCloudAdditions(
      [local('c_1', 'ახალი ჩატი', 1000)],
      [srv('s_a', 'ახალი ჩატი', '2026-01-01T00:00:00Z')],
    );
    expect(out.map((c) => c.serverSid)).toEqual(['s_a']); // generic title is not a dedup key
  });

  it('is fail-safe on garbage/empty input and never mutates local', () => {
    expect(computeCloudAdditions([], [])).toEqual([]);
    expect(computeCloudAdditions(null as unknown as SyncConversation[], null as unknown as ServerSession[])).toEqual([]);
    const out = computeCloudAdditions([], [srv('', 'x', 'z'), { session_id: 5 as unknown as string, title: 'y', updated_at: '' }, srv('s_ok', null, 'not-a-date')]);
    expect(out).toHaveLength(1);
    expect(out[0]!.serverSid).toBe('s_ok');
    expect(out[0]!.title).toBe('Chat'); // null title → fallback
    expect(out[0]!.updatedAt).toBe(0);  // unparseable date → 0
  });
});

describe('a deleted chat stays deleted', () => {
  const server = [
    { session_id: 's1', title: 'Trip to Kazbegi', updated_at: '2026-08-06T10:00:00Z' },
    { session_id: 's2', title: 'Logo ideas', updated_at: '2026-08-06T11:00:00Z' },
  ];

  it('re-imports a server session the device has never seen', () => {
    expect(computeCloudAdditions([], server).map((c) => c.id)).toEqual(['cloud:s2', 'cloud:s1']);
  });

  it('does NOT re-import a session the user deleted', () => {
    // ⚠️ THE WHOLE BUG. knownSids comes from the LOCAL list, so deleting the conversation also deleted
    // the only proof the device had already seen that server session — and the next sync pulled it back.
    // Deleting one chat resurrected exactly that chat.
    expect(computeCloudAdditions([], server, ['s1']).map((c) => c.id)).toEqual(['cloud:s2']);
  });

  it('does NOT re-import anything after "clear all"', () => {
    // The worst case: clearing wiped every serverSid at once, so the next sync restored the account's
    // entire history and the button read as doing nothing.
    expect(computeCloudAdditions([], server, ['s1', 's2'])).toEqual([]);
  });

  it('tombstones win over a still-present local row', () => {
    // Checked first and independently of the local list — the local row being gone is precisely the
    // condition that caused the bug, so the tombstone must not depend on it.
    const local = [{ id: 'c1', title: 'Trip to Kazbegi', serverSid: 's1', updatedAt: 1 }];
    expect(computeCloudAdditions(local, server, ['s2'])).toEqual([]);
  });

  it('ignores junk in the tombstone list', () => {
    expect(computeCloudAdditions([], server, ['', null as unknown as string]).length).toBe(2);
  });
});
