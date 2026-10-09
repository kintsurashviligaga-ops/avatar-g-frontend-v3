import { computeCloudAdditions, dedupeConversations, type SyncConversation, type ServerSession } from './conversationSync';

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

describe('one History row per conversation (owner report 2026-10-09 18:26Z)', () => {
  const LONG = 'ექსტრაქტ გაუკეთე mp3 და დაადე მუსიკა ამ ვიდეოდან https://youtube.com/shorts/x?si=y';
  const server: ServerSession[] = [{ session_id: 'a36', title: LONG.slice(0, 80), updated_at: '2026-10-09T12:19:40Z' }];

  it('a cloud row that lost its serverSid field is still that session: no second import', () => {
    // Opening a cloud row used to rewrite it without `serverSid`; the next mount imported the session again, same id.
    const local = [{ id: 'cloud:a36', title: `${LONG.slice(0, 52)}…`, updatedAt: 5 }];
    expect(computeCloudAdditions(local, server)).toEqual([]);
  });

  it('the sidebar\'s 52-character title and the server\'s 80-character title are one first line', () => {
    const local = [{ id: 'c_1', title: `${LONG.slice(0, 52)}…`, updatedAt: 5 }];
    expect(computeCloudAdditions(local, server)).toEqual([]);
  });

  it('a short shared prefix is not enough to call two chats one', () => {
    const local = [{ id: 'c_1', title: 'ექსტრაქტ…', updatedAt: 5 }];
    expect(computeCloudAdditions(local, server).map((c) => c.id)).toEqual(['cloud:a36']);
  });

  it('heals an archive that already holds copies: one row per id and per server session, the transcript kept', () => {
    const rows = [
      { id: 'cloud:a36', title: 't', updatedAt: 9, messages: [{ role: 'user', text: 'x' }], tool: 'chat' },
      { id: 'cloud:a36', title: 't', updatedAt: 3, serverSid: 'a36', messages: [] },
      { id: 'c_2', title: 'u', updatedAt: 7, serverSid: 'a36', messages: [] },
      { id: 'c_3', title: 'other', updatedAt: 8, messages: [{ role: 'user', text: 'y' }] },
      { id: 'c_3', title: 'other', updatedAt: 1, messages: [] },
    ];
    const out = dedupeConversations(rows);
    expect(out.map((c) => c.id)).toEqual(['cloud:a36', 'c_3']);
    expect(out[0]).toMatchObject({ serverSid: 'a36', tool: 'chat', updatedAt: 9 });
    expect(out[0]!.messages).toHaveLength(1);
    expect(out[1]!.messages).toHaveLength(1);
  });

  it('leaves a clean archive as it is', () => {
    const rows = [{ id: 'a', title: 'a', updatedAt: 2, messages: [] }, { id: 'b', title: 'b', updatedAt: 1, serverSid: 's', messages: [] }];
    expect(dedupeConversations(rows)).toEqual(rows);
    expect(dedupeConversations(null as unknown as typeof rows)).toEqual([]);
  });
});
