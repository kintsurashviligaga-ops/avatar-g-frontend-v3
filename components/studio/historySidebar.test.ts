/** @jest-environment node */
/**
 * The sidebar's history list ("ბოლო") while it loads and while it is empty — read from the source, like the other
 * ChatChrome / OmniStudio suites (both are thousands of lines behind auth and dynamic imports):
 *  · a signed-in studio shows skeleton rows of the rows' own height until OmniStudio's cross-device sync answers —
 *    never "no conversations yet" for an account whose chats are still on their way;
 *  · the sync says it answered in EVERY case (a finally: guest, empty account, error), on <html> and as an event;
 *  · a cap ends the skeleton anyway (no studio on the surface, a hung request);
 *  · an empty history is the shared EmptyState with one next step — the chat, caret in the composer — in ka/en/ru.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const chrome = readFileSync(join(__dirname, 'ChatChrome.tsx'), 'utf8');
const omni = readFileSync(join(__dirname, 'OmniStudio.tsx'), 'utf8');

describe('while the history loads', () => {
  it('a signed-in studio shows skeleton rows, sized like the rows, until the sync has answered', () => {
    expect(chrome).toContain('{authed && onStudioHome && !historySynced && conversations.length === 0 ? (');
    expect(chrome).toMatch(/<SkeletonList count=\{3\} locale=\{lang\} rowClassName="h-11 w-full rounded-lg"/);
    // Both targets and their skeleton reserve 44 px on every pointer type.
    expect(chrome).toContain('group flex min-h-11 items-center');
    expect(chrome).toContain('min-h-[44px] min-w-0 flex-1 items-center truncate rounded-lg');
  });

  it('listens for the sync and caps the wait', () => {
    expect(chrome).toContain("document.documentElement.dataset.historySync === 'done'");
    expect(chrome).toContain("window.addEventListener('myavatar:history-synced', read);");
    expect(chrome).toMatch(/const cap = window\.setTimeout\(\(\) => setHistorySynced\(true\), 8000\);/);
  });

  it('OmniStudio publishes the answer from a finally — whatever the answer was', () => {
    const sync = omni.slice(omni.indexOf('// CROSS-DEVICE SIDEBAR SYNC'), omni.indexOf('// VECTOR 1 — run the generation'));
    expect(sync).toMatch(/\} finally \{[\s\S]*document\.documentElement\.dataset\.historySync = 'done';[\s\S]*new Event\('myavatar:history-synced'\)/);
  });
});

describe('an empty history', () => {
  it('is the shared EmptyState with one next step: the chat, with the caret in its composer', () => {
    expect(chrome).toContain('<EmptyState compact icon={ChatIcon} line={tNoHistory} actionLabel={tStartChat} onAction={startChat} testId="history-empty" />');
    expect(chrome).toMatch(/const startChat = useCallback\(\(\) => \{\s*selectTool\('chat'\);\s*window\.setTimeout\(\(\) => \{ focusComposer\(\); \}, 250\);/);
  });

  it('says it in all three languages', () => {
    expect(chrome).toContain("const tStartChat = locale === 'en' ? 'Start a chat' : locale === 'ru' ? 'Начать чат' : 'დაიწყე ჩატი';");
  });
});

describe('a delete hands focus on (Phase 2 PR 8; the browser half is tests/delete-x.spec.ts)', () => {
  it('each row\'s title is marked for the hand-off, inside the one list', () => {
    expect(chrome).toContain('<div data-testid="history-list" className="space-y-2 pb-2">');
    expect(chrome).toContain('title={c.title} data-conv-open={c.id}');
  });

  it('the X that had focus gives it to the next row, the previous at the end, the empty list\'s action when none is left', () => {
    const at = chrome.indexOf('const handleDeleteConversation = useCallback(');
    expect(at).toBeGreaterThan(0);
    const body = chrome.slice(at, at + 1800);
    expect(body).toContain('if (document.activeElement === x) {');
    expect(body).toContain('(titles[at + 1] ?? titles[at - 1])');
    expect(body).toContain(`'[data-testid="history-empty"] button'`);
    // Read while the row is still on the page: the optimistic removal comes after.
    expect(body.indexOf('document.activeElement === x')).toBeLessThan(body.indexOf('setConversations((prev) => prev.filter'));
  });
});
