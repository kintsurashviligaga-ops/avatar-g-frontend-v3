/** @jest-environment jsdom */
/**
 * The Create screen's saved lyrics and styles: per-user, survives sign-out, robust against every way localStorage can
 * fail or be edited, bounded.
 */
import { isAppSessionKey } from '@/lib/auth/sessionCleanup';
import {
  LIBRARY_MAX_ITEMS, LIBRARY_TEXT_MAX, libraryKey, readLibrary, removeFromLibrary, saveToLibrary,
} from './musicLibrary';

beforeEach(() => window.localStorage.clear());

test('save → read back, newest first, each with an id', () => {
  expect(saveToLibrary('lyrics', { text: 'first verse' }, 'u1').ok).toBe(true);
  expect(saveToLibrary('lyrics', { text: 'second verse' }, 'u1').ok).toBe(true);
  const items = readLibrary('lyrics', 'u1');
  expect(items.map((i) => i.text)).toEqual(['second verse', 'first verse']);
  expect(items.every((i) => i.id.length > 0 && i.savedAt > 0)).toBe(true);
});

test('lyrics and styles are separate lists, and styles keep their chips (cleaned, at most three)', () => {
  saveToLibrary('lyrics', { text: 'la la' }, 'u1');
  saveToLibrary('styles', { text: 'dreamy, slow', chips: ['jazz', 'lo-fi', 'pop', 'rock'] }, 'u1');
  expect(readLibrary('lyrics', 'u1')).toHaveLength(1);
  const styles = readLibrary('styles', 'u1');
  expect(styles).toHaveLength(1);
  expect(styles[0]).toMatchObject({ text: 'dreamy, slow', chips: ['jazz', 'lo-fi', 'pop'] });
  expect(readLibrary('lyrics', 'u1')[0]!.chips).toBeUndefined();
});

test('a style entry may be chips only; an entry with nothing in it is refused', () => {
  expect(saveToLibrary('styles', { text: '  ', chips: ['jazz'] }, 'u1').ok).toBe(true);
  expect(saveToLibrary('styles', { text: '  ', chips: [] }, 'u1')).toEqual({ ok: false, reason: 'empty' });
  expect(saveToLibrary('lyrics', { text: '   ' }, 'u1')).toEqual({ ok: false, reason: 'empty' });
});

test('saving the same thing twice does not duplicate it — it moves to the top and says so', () => {
  saveToLibrary('lyrics', { text: 'chorus' }, 'u1');
  saveToLibrary('lyrics', { text: 'verse' }, 'u1');
  const again = saveToLibrary('lyrics', { text: ' chorus ' }, 'u1');
  expect(again.ok && again.duplicate).toBe(true);
  expect(readLibrary('lyrics', 'u1').map((i) => i.text)).toEqual(['chorus', 'verse']);
});

test('delete removes one entry and leaves the rest; an unknown id changes nothing', () => {
  saveToLibrary('lyrics', { text: 'a' }, 'u1');
  saveToLibrary('lyrics', { text: 'b' }, 'u1');
  const [b, a] = readLibrary('lyrics', 'u1');
  expect(removeFromLibrary('lyrics', b!.id, 'u1').map((i) => i.text)).toEqual(['a']);
  expect(removeFromLibrary('lyrics', 'nope', 'u1').map((i) => i.id)).toEqual([a!.id]);
  expect(readLibrary('lyrics', 'u1')).toHaveLength(1);
});

test('per user: another account (or a guest) on this browser reads nothing of it', () => {
  saveToLibrary('lyrics', { text: 'mine' }, 'u1');
  expect(readLibrary('lyrics', 'u2')).toEqual([]);
  expect(readLibrary('lyrics', null)).toEqual([]);
  expect(libraryKey('lyrics', 'u1')).not.toBe(libraryKey('lyrics', 'u2'));
});

test('signing out does not delete it (it sits under the archive prefix the wipe keeps)', () => {
  expect(isAppSessionKey(libraryKey('lyrics', 'u1'))).toBe(false);
  expect(isAppSessionKey(libraryKey('styles', null))).toBe(false);
});

test('bounded: text is capped per kind and the list keeps the newest MAX entries', () => {
  saveToLibrary('lyrics', { text: 'x'.repeat(5000) }, 'u1');
  expect(readLibrary('lyrics', 'u1')[0]!.text).toHaveLength(LIBRARY_TEXT_MAX.lyrics);
  window.localStorage.clear();
  for (let i = 0; i < LIBRARY_MAX_ITEMS + 8; i++) saveToLibrary('lyrics', { text: `song ${i}` }, 'u1');
  const items = readLibrary('lyrics', 'u1');
  expect(items).toHaveLength(LIBRARY_MAX_ITEMS);
  expect(items[0]!.text).toBe(`song ${LIBRARY_MAX_ITEMS + 7}`);
});

test('corrupt, hostile or edited storage reads as the valid part only — never a throw', () => {
  const key = libraryKey('lyrics', 'u1');
  for (const junk of ['not json', '{"a":1}', 'null', '[1,"x",null,{"id":7},{"id":"ok","text":"fine","savedAt":5},{"id":"","text":"no id"},{"id":"e","text":"   "}]']) {
    window.localStorage.setItem(key, junk);
    expect(() => readLibrary('lyrics', 'u1')).not.toThrow();
  }
  expect(readLibrary('lyrics', 'u1').map((i) => i.id)).toEqual(['ok']);
});

test('storage that throws (private mode, quota) degrades: reads are empty, a save reports it, nothing throws', () => {
  const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(readLibrary('lyrics', 'u1')).toEqual([]);
  get.mockRestore();
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(saveToLibrary('lyrics', { text: 'x' }, 'u1')).toEqual({ ok: false, reason: 'storage' });
  set.mockRestore();
  expect(saveToLibrary('lyrics', { text: 'x' }, 'u1', null)).toEqual({ ok: false, reason: 'storage' });
});
