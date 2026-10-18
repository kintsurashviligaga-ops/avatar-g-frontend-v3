/**
 * @jest-environment jsdom
 *
 * lib/chat/tabChat — what a reload of the tab brings back (the owner's PRD of 2026-10-18, 2.5): the chat it had open and
 * the text not yet sent, per account, in sessionStorage only, and nothing when storage is unavailable.
 */
import { TAB_DRAFT_MAX, readTabChat, readTabDraft, writeTabChat, writeTabDraft } from './tabChat';

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

test('a tab with nothing written has no chat and no draft', () => {
  expect(readTabChat('u1')).toBeNull();
  expect(readTabDraft('u1')).toBe('');
});

test('the chat and the draft come back for the same account, and only in sessionStorage', () => {
  writeTabChat('u1', 'c_abc');
  writeTabDraft('u1', 'half a thought');
  expect(readTabChat('u1')).toBe('c_abc');
  expect(readTabDraft('u1')).toBe('half a thought');
  expect(window.localStorage.length).toBe(0); // a new tab or visit starts fresh
});

test('another account on this tab sees none of it; a signed-out tab has its own', () => {
  writeTabChat('u1', 'c_abc');
  writeTabDraft('u1', 'mine');
  expect(readTabChat('u2')).toBeNull();
  expect(readTabDraft('u2')).toBe('');
  writeTabChat(null, 'c_guest');
  expect(readTabChat(undefined)).toBe('c_guest');
  expect(readTabChat('u1')).toBe('c_abc');
});

test('an emptied composer leaves no draft; a very long one is cut, not refused', () => {
  writeTabDraft('u1', 'something');
  writeTabDraft('u1', '   ');
  expect(readTabDraft('u1')).toBe('');
  expect(window.sessionStorage.length).toBe(0);
  writeTabDraft('u1', 'x'.repeat(TAB_DRAFT_MAX + 50));
  expect(readTabDraft('u1')).toHaveLength(TAB_DRAFT_MAX);
});

test('storage that throws (private mode, quota) reads as nothing and never throws', () => {
  const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(() => writeTabChat('u1', 'c_abc')).not.toThrow();
  expect(() => writeTabDraft('u1', 'text')).not.toThrow();
  expect(readTabChat('u1')).toBeNull();
  expect(readTabDraft('u1')).toBe('');
  get.mockRestore();
  set.mockRestore();
});
