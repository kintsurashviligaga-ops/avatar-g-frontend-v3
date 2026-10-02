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
    expect(chrome).toMatch(/<SkeletonList count=\{3\} locale=\{lang\} rowClassName="h-11 w-full rounded-lg \[@media\(pointer:fine\)\]:h-\[38px\]"/);
    // The real rows: 44 px on touch, 38 px with a mouse — the skeleton matches, so nothing jumps when they land.
    expect(chrome).toContain('min-h-[44px] [@media(pointer:fine)]:min-h-[38px] w-full items-center truncate rounded-lg');
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
