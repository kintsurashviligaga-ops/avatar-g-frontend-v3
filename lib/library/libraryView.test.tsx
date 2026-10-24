/**
 * lib/library/libraryView — where a Library screen was left (§4.2.6): kept per account in this tab's sessionStorage,
 * checked on the way back in, and the scroll put back once the screen's first read is on screen.
 */
import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { readLibraryView, saveLibraryView, scrollParentOf, useKeptScroll } from './libraryView';

const KEY = 'myavatar:library-view';
beforeEach(() => { window.sessionStorage.clear(); });

describe('read and save', () => {
  test('nothing kept reads as null', () => {
    expect(readLibraryView('page', 'user-a')).toBeNull();
  });

  test('a view comes back for the same account and screen only', () => {
    saveLibraryView('page', 'user-a', { tab: 'music', page: 2, q: 'sea' });
    expect(readLibraryView('page', 'user-a')).toEqual({ tab: 'music', page: 2, q: 'sea', scroll: undefined });
    expect(readLibraryView('page', 'user-b')).toBeNull();
    expect(readLibraryView('slideover', 'user-a')).toBeNull();
    expect(readLibraryView('page', '')).toBeNull();
  });

  test('a save merges into the same account\'s view and replaces another account\'s', () => {
    saveLibraryView('page', 'user-a', { tab: 'music', q: 'sea' });
    saveLibraryView('page', 'user-a', { scroll: 640 });
    expect(readLibraryView('page', 'user-a')).toMatchObject({ tab: 'music', q: 'sea', scroll: 640 });
    saveLibraryView('page', 'user-b', { page: 1 });
    expect(readLibraryView('page', 'user-b')).toEqual({ tab: undefined, page: 1, q: undefined, scroll: undefined });
    expect(readLibraryView('page', 'user-a')).toBeNull();
  });

  test('the two screens keep their own views', () => {
    saveLibraryView('page', 'user-a', { tab: 'image' });
    saveLibraryView('slideover', 'user-a', { tab: 'soundtracks', scroll: 90 });
    expect(readLibraryView('page', 'user-a')?.tab).toBe('image');
    expect(readLibraryView('slideover', 'user-a')).toMatchObject({ tab: 'soundtracks', scroll: 90 });
  });

  test('stored values are checked on the way back in', () => {
    window.sessionStorage.setItem(KEY, JSON.stringify({
      page: { owner: 'user-a', tab: 'x'.repeat(41), page: -1, q: 'q'.repeat(500), scroll: 12.5 },
      slideover: { owner: 'user-a', tab: 7, page: 1001, q: { evil: true }, scroll: '300' },
    }));
    expect(readLibraryView('page', 'user-a')).toEqual({ tab: undefined, page: undefined, q: 'q'.repeat(200), scroll: undefined });
    expect(readLibraryView('slideover', 'user-a')).toEqual({ tab: undefined, page: undefined, q: undefined, scroll: undefined });
  });

  test('unreadable storage reads as nothing kept, and a save starts it over', () => {
    for (const raw of ['{not json', '[1,2]', 'null', '"text"']) {
      window.sessionStorage.setItem(KEY, raw);
      expect(readLibraryView('page', 'user-a')).toBeNull();
    }
    saveLibraryView('page', 'user-a', { tab: 'video' });
    expect(readLibraryView('page', 'user-a')?.tab).toBe('video');
  });

  test('a long search is cut when saved', () => {
    saveLibraryView('page', 'user-a', { q: 'w'.repeat(300) });
    expect(JSON.parse(window.sessionStorage.getItem(KEY) ?? '{}').page.q).toHaveLength(200);
  });

  test('blocked storage never throws', () => {
    const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    try {
      expect(() => saveLibraryView('page', 'user-a', { tab: 'video' })).not.toThrow();
      expect(readLibraryView('page', 'user-a')).toBeNull();
    } finally { set.mockRestore(); get.mockRestore(); }
  });
});

describe('scroll', () => {
  test('the scroll box is the nearest ancestor that scrolls', () => {
    const outer = document.createElement('div');
    outer.style.overflowY = 'auto';
    const middle = document.createElement('div');
    const el = document.createElement('div');
    middle.appendChild(el); outer.appendChild(middle); document.body.appendChild(outer);
    expect(scrollParentOf(el)).toBe(outer);
    outer.remove();
  });

  function Screen({ owner, settled }: { owner: string | null; settled: boolean }) {
    const root = useRef<HTMLDivElement | null>(null);
    useKeptScroll(root, 'page', owner, settled);
    return <div data-testid="box" style={{ overflowY: 'auto' }}><div ref={root} /></div>;
  }
  const frame = () => act(() => new Promise<void>((done) => requestAnimationFrame(() => done())));

  test('put back once the first read is on screen, and not before', () => {
    saveLibraryView('page', 'user-a', { scroll: 480 });
    const { getByTestId, rerender } = render(<Screen owner="user-a" settled={false} />);
    const box = getByTestId('box');
    expect(box.scrollTop).toBe(0);
    rerender(<Screen owner="user-a" settled />);
    expect(box.scrollTop).toBe(480);
    // Once only: a later read does not pull the person back.
    box.scrollTop = 100;
    rerender(<Screen owner="user-a" settled={false} />);
    rerender(<Screen owner="user-a" settled />);
    expect(box.scrollTop).toBe(100);
  });

  test('a scroll before the screen is back (a route change\'s scroll to the top) is not saved', async () => {
    saveLibraryView('page', 'user-a', { scroll: 480 });
    const { getByTestId, rerender } = render(<Screen owner="user-a" settled={false} />);
    const box = getByTestId('box');
    box.scrollTop = 0;
    box.dispatchEvent(new Event('scroll'));
    await frame();
    expect(readLibraryView('page', 'user-a')?.scroll).toBe(480);
    rerender(<Screen owner="user-a" settled />);
    expect(box.scrollTop).toBe(480);
  });

  test('a scroll after it is saved for the account', async () => {
    const { getByTestId, rerender } = render(<Screen owner="user-a" settled={false} />);
    rerender(<Screen owner="user-a" settled />);
    const box = getByTestId('box');
    box.scrollTop = 333;
    box.dispatchEvent(new Event('scroll'));
    await frame();
    expect(readLibraryView('page', 'user-a')?.scroll).toBe(333);
    expect(readLibraryView('page', 'user-b')).toBeNull();
  });

  test('another account starts at the top', () => {
    saveLibraryView('page', 'user-a', { scroll: 480 });
    const { getByTestId } = render(<Screen owner="user-b" settled />);
    expect(getByTestId('box').scrollTop).toBe(0);
  });

  test('nothing is read or saved before the account is known', async () => {
    saveLibraryView('page', 'user-a', { scroll: 480 });
    const { getByTestId, rerender } = render(<Screen owner={null} settled />);
    const box = getByTestId('box');
    box.scrollTop = 50;
    box.dispatchEvent(new Event('scroll'));
    await frame();
    expect(readLibraryView('page', 'user-a')?.scroll).toBe(480);
    rerender(<Screen owner="user-a" settled />);
    expect(box.scrollTop).toBe(480);
  });
});
