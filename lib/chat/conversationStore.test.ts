/**
 * Unit tests for the client conversation store + chat preferences.
 * Runs in the default jsdom environment (real localStorage).
 */
import {
  bucketFor,
  deriveTitle,
  deleteConversation,
  getConversation,
  groupConversationsByTime,
  loadConversations,
  loadActiveConversations,
  loadTrashedConversations,
  softDeleteConversation,
  restoreConversation,
  purgeConversation,
  purgeExpiredTrash,
  renameConversation,
  sanitizeMessageForStore,
  sanitizeMessagesForStore,
  upsertConversation,
  type StoredConversation,
  type StoredMessage,
} from './conversationStore';
import {
  DEFAULT_PREFERENCES,
  MAX_CUSTOM_INSTRUCTIONS,
  loadPreferences,
  normalizePreferences,
  savePreferences,
} from './preferences';

const DAY = 86_400_000;

function makeConvo(id: string, updatedAt: number, firstPrompt = 'hello world'): StoredConversation {
  const msg: StoredMessage = { id: `${id}_m`, role: 'user', text: firstPrompt, timestamp: updatedAt };
  return { id, title: deriveTitle(firstPrompt), createdAt: updatedAt, updatedAt, messages: [msg] };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('deriveTitle', () => {
  test('empty / whitespace → fallback', () => {
    expect(deriveTitle('')).toBe('New chat');
    expect(deriveTitle('   \n  ')).toBe('New chat');
  });

  test('short text preserved, whitespace collapsed', () => {
    expect(deriveTitle('  make   a  video ')).toBe('make a video');
  });

  test('long text truncated with ellipsis at 48 chars', () => {
    const long = 'A'.repeat(80);
    const title = deriveTitle(long);
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(49); // 48 chars + ellipsis
  });
});

describe('bucketFor', () => {
  // Fixed "now": 2026-05-29 12:00:00 local.
  const now = new Date(2026, 4, 29, 12, 0, 0).getTime();

  test('earlier today → today', () => {
    const earlierToday = new Date(2026, 4, 29, 1, 0, 0).getTime();
    expect(bucketFor(earlierToday, now)).toBe('today');
  });

  test('yesterday → previous7', () => {
    expect(bucketFor(now - 1 * DAY, now)).toBe('previous7');
  });

  test('5 days ago → previous7', () => {
    expect(bucketFor(now - 5 * DAY, now)).toBe('previous7');
  });

  test('20 days ago → previous30', () => {
    expect(bucketFor(now - 20 * DAY, now)).toBe('previous30');
  });

  test('100 days ago → older', () => {
    expect(bucketFor(now - 100 * DAY, now)).toBe('older');
  });
});

describe('groupConversationsByTime', () => {
  const now = new Date(2026, 4, 29, 12, 0, 0).getTime();

  test('orders buckets and omits empty ones', () => {
    const convos = [
      makeConvo('a', new Date(2026, 4, 29, 9, 0, 0).getTime()), // today
      makeConvo('b', now - 3 * DAY), // previous7
      makeConvo('c', now - 100 * DAY), // older
    ];
    const groups = groupConversationsByTime(convos, now);
    expect(groups.map((g) => g.bucket)).toEqual(['today', 'previous7', 'older']);
    // previous30 is omitted (no member)
    expect(groups.find((g) => g.bucket === 'previous30')).toBeUndefined();
  });

  test('within a bucket, most-recent first', () => {
    const older1 = makeConvo('o1', now - 40 * DAY);
    const older2 = makeConvo('o2', now - 50 * DAY);
    const groups = groupConversationsByTime([older2, older1], now);
    const olderGroup = groups.find((g) => g.bucket === 'older')!;
    expect(olderGroup.conversations.map((c) => c.id)).toEqual(['o1', 'o2']);
  });
});

describe('sanitize / asset eviction', () => {
  test('oversized data: URL is evicted, message text kept', () => {
    const big = `data:video/mp4;base64,${'A'.repeat(200_001)}`;
    const m: StoredMessage = { id: 'm1', role: 'assistant', text: 'here is your clip', timestamp: 1, assetUrl: big, assetType: 'video' };
    const out = sanitizeMessageForStore(m);
    expect(out.assetUrl).toBeNull();
    expect(out.assetEvicted).toBe(true);
    expect(out.text).toBe('here is your clip');
  });

  test('blob: URL is evicted', () => {
    const m: StoredMessage = { id: 'm2', role: 'assistant', text: '', timestamp: 1, assetUrl: 'blob:https://x/abc', assetType: 'audio' };
    expect(sanitizeMessageForStore(m).assetUrl).toBeNull();
    expect(sanitizeMessageForStore(m).assetEvicted).toBe(true);
  });

  test('remote http(s) URL is preserved', () => {
    const url = 'https://cdn.example.com/render.mp4';
    const m: StoredMessage = { id: 'm3', role: 'assistant', text: '', timestamp: 1, assetUrl: url, assetType: 'video' };
    expect(sanitizeMessageForStore(m).assetUrl).toBe(url);
    expect(sanitizeMessageForStore(m).assetEvicted).toBeUndefined();
  });

  test('small data: URL (e.g. tiny image) is preserved', () => {
    const small = `data:image/png;base64,${'A'.repeat(100)}`;
    const m: StoredMessage = { id: 'm4', role: 'user', text: '', timestamp: 1, assetUrl: small, assetType: 'image' };
    expect(sanitizeMessageForStore(m).assetUrl).toBe(small);
  });

  test('sanitizeMessagesForStore maps across a list', () => {
    const big = `data:video/mp4;base64,${'A'.repeat(200_001)}`;
    const out = sanitizeMessagesForStore([
      { id: 'a', role: 'user', text: 'hi', timestamp: 1 },
      { id: 'b', role: 'assistant', text: 'clip', timestamp: 2, assetUrl: big, assetType: 'video' },
    ]);
    expect(out[0].assetUrl).toBeUndefined();
    expect(out[1].assetUrl).toBeNull();
  });
});

describe('CRUD round-trip (localStorage)', () => {
  test('upsert inserts then updates the same id', () => {
    upsertConversation(makeConvo('x', 1000, 'first'));
    expect(loadConversations()).toHaveLength(1);
    upsertConversation({ ...makeConvo('x', 2000, 'first'), title: 'renamed-by-upsert' });
    const list = loadConversations();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('renamed-by-upsert');
    expect(list[0].updatedAt).toBe(2000);
  });

  test('loadConversations returns most-recent first', () => {
    upsertConversation(makeConvo('old', 1000));
    upsertConversation(makeConvo('new', 5000));
    expect(loadConversations().map((c) => c.id)).toEqual(['new', 'old']);
  });

  test('renameConversation updates the title only', () => {
    upsertConversation(makeConvo('r', 1000, 'original'));
    renameConversation('r', '  Custom Title  ');
    expect(getConversation('r')?.title).toBe('Custom Title');
  });

  test('rename to blank keeps the previous title', () => {
    upsertConversation({ ...makeConvo('r', 1000), title: 'keep me' });
    renameConversation('r', '   ');
    expect(getConversation('r')?.title).toBe('keep me');
  });

  test('deleteConversation removes it', () => {
    upsertConversation(makeConvo('d', 1000));
    upsertConversation(makeConvo('keep', 2000));
    deleteConversation('d');
    expect(loadConversations().map((c) => c.id)).toEqual(['keep']);
    expect(getConversation('d')).toBeNull();
  });

  test('oversized assets are evicted at the persistence boundary', () => {
    const big = `data:video/mp4;base64,${'A'.repeat(200_001)}`;
    upsertConversation({
      id: 'media',
      title: 't',
      createdAt: 1,
      updatedAt: 1,
      messages: [{ id: 'm', role: 'assistant', text: 'clip', timestamp: 1, assetUrl: big, assetType: 'video' }],
    });
    const restored = getConversation('media');
    expect(restored?.messages[0].assetUrl).toBeNull();
    expect(restored?.messages[0].assetEvicted).toBe(true);
  });

  test('malformed JSON in storage degrades to empty', () => {
    window.localStorage.setItem('myavatar.conversations.v1', '{not json');
    expect(loadConversations()).toEqual([]);
  });
});

describe('Trash Bin (soft delete / restore / purge) — VECTOR 8', () => {
  test('soft delete hides from active, shows in trash, but survives raw storage', () => {
    upsertConversation(makeConvo('t', 1000));
    upsertConversation(makeConvo('keep', 2000));
    const active = softDeleteConversation('t');
    expect(active.map((c) => c.id)).toEqual(['keep']);           // sidebar hides it
    expect(loadActiveConversations().map((c) => c.id)).toEqual(['keep']);
    expect(loadTrashedConversations().map((c) => c.id)).toEqual(['t']);
    expect(loadConversations().map((c) => c.id).sort()).toEqual(['keep', 't']); // raw keeps both (persistence-safe)
  });

  test('restore returns a chat to the active list', () => {
    upsertConversation(makeConvo('r', 1000));
    softDeleteConversation('r');
    expect(loadActiveConversations()).toHaveLength(0);
    const trash = restoreConversation('r');
    expect(trash).toHaveLength(0);                                // trash now empty
    expect(loadActiveConversations().map((c) => c.id)).toEqual(['r']);
  });

  test('purge permanently removes a trashed chat', () => {
    upsertConversation(makeConvo('p', 1000));
    softDeleteConversation('p');
    purgeConversation('p');
    expect(loadTrashedConversations()).toHaveLength(0);
    expect(loadConversations()).toHaveLength(0);                 // gone from raw storage too
  });

  test('purgeExpiredTrash drops chats trashed >30 days ago, keeps recent ones', () => {
    upsertConversation(makeConvo('old', 1000));
    upsertConversation(makeConvo('fresh', 2000));
    softDeleteConversation('old');
    softDeleteConversation('fresh');
    // Backdate 'old' beyond the 30-day retention.
    const raw = loadConversations().map((c) => (c.id === 'old' ? { ...c, deletedAt: 1_000 } : c));
    window.localStorage.setItem('myavatar.conversations.v1', JSON.stringify(raw));
    const now = 1_000 + 31 * DAY;
    purgeExpiredTrash(now);
    expect(loadTrashedConversations().map((c) => c.id)).toEqual(['fresh']); // recent survives
    expect(loadConversations().map((c) => c.id).sort()).toEqual(['fresh']);
  });

  test('30-day boundary: exactly 30d is KEPT, 30d+1ms is purged', () => {
    const trashedAt = 100_000;
    upsertConversation(makeConvo('edge', 5000));
    softDeleteConversation('edge');
    window.localStorage.setItem('myavatar.conversations.v1',
      JSON.stringify(loadConversations().map((c) => ({ ...c, deletedAt: trashedAt }))));
    purgeExpiredTrash(trashedAt + 30 * DAY);       // exactly 30 days → NOT past retention
    expect(loadTrashedConversations().map((c) => c.id)).toEqual(['edge']);
    purgeExpiredTrash(trashedAt + 30 * DAY + 1);    // one ms over → purged
    expect(loadTrashedConversations()).toHaveLength(0);
  });
});

describe('Trash Bin — the 60-cap edge (VECTOR 8 hardening)', () => {
  // MAX_CONVERSATIONS is 60 in conversationStore.ts.
  const seedActive = (n: number) => { for (let i = 0; i < n; i++) upsertConversation(makeConvo(`a${i}`, 1000 + i)); };

  test('60 active + 5 trashed: adding a NEW active preserves ALL trashed and evicts only the oldest active', () => {
    seedActive(60);
    for (const id of ['a0', 'a1', 'a2', 'a3', 'a4']) softDeleteConversation(id); // trash 5 (now 55 active, 5 trashed)
    // Top the active list back up to 60 so the next insert forces the cap.
    for (let i = 60; i < 65; i++) upsertConversation(makeConvo(`a${i}`, 1000 + i)); // 60 active, 5 trashed
    expect(loadActiveConversations()).toHaveLength(60);
    expect(loadTrashedConversations()).toHaveLength(5);

    upsertConversation(makeConvo('brand_new', 999_999)); // newest → forces one active eviction
    const active = loadActiveConversations();
    const trashed = loadTrashedConversations();
    expect(active).toHaveLength(60);                                   // active still capped at 60
    expect(active.some((c) => c.id === 'brand_new')).toBe(true);       // the new chat is present
    expect(trashed).toHaveLength(5);                                   // NONE of the trashed were evicted
    expect(trashed.map((c) => c.id).sort()).toEqual(['a0', 'a1', 'a2', 'a3', 'a4']);
    // No corruption: every stored row is a valid, uniquely-id'd conversation.
    const raw = loadConversations();
    expect(new Set(raw.map((c) => c.id)).size).toBe(raw.length);
    expect(raw.every((c) => typeof c.id === 'string' && Array.isArray(c.messages))).toBe(true);
  });

  test('under the cap (55 active + 5 trashed): adding an active evicts NO active and keeps all trash', () => {
    seedActive(55);
    for (const id of ['a0', 'a1', 'a2', 'a3', 'a4']) softDeleteConversation(id); // 50 active, 5 trashed
    upsertConversation(makeConvo('n', 999_999));
    expect(loadActiveConversations()).toHaveLength(51); // 50 + 1, well under 60 → nothing evicted
    expect(loadTrashedConversations()).toHaveLength(5);
  });
});

describe('preferences', () => {
  test('normalize fills defaults from partial / garbage input', () => {
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences({ submitOnEnter: false })).toEqual({
      ...DEFAULT_PREFERENCES,
      submitOnEnter: false,
    });
  });

  test('custom instructions are clamped to the max length', () => {
    const huge = 'x'.repeat(MAX_CUSTOM_INSTRUCTIONS + 500);
    expect(normalizePreferences({ customInstructions: huge }).customInstructions.length).toBe(
      MAX_CUSTOM_INSTRUCTIONS,
    );
  });

  test('save → load round-trip', () => {
    savePreferences({ submitOnEnter: false, autoplayMedia: true, customInstructions: 'be concise' });
    expect(loadPreferences()).toEqual({
      submitOnEnter: false,
      autoplayMedia: true,
      customInstructions: 'be concise',
    });
  });

  test('load with no stored value returns defaults', () => {
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
  });
});
