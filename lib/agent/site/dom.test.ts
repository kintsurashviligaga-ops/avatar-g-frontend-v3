/**
 * @jest-environment jsdom
 */
import { actOnPage, removeCursor, snapshotPage } from './dom';

beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () { return { x: 10, y: 10, left: 10, top: 10, width: 80, height: 20, right: 90, bottom: 30, toJSON() {} } as DOMRect; };
  Element.prototype.scrollIntoView = function () {};
  (window as unknown as { requestAnimationFrame: (f: () => void) => number }).requestAnimationFrame = (f) => { f(); return 0; };
  (global as unknown as { CSS: { escape: (s: string) => string } }).CSS = { escape: (s: string) => s };
});

function page() {
  document.title = 'MyAvatar';
  document.body.innerHTML = `
    <main><h1>სტუდია</h1>
      <a href="/ka/library">ბიბლიოთეკა</a>
      <a href="https://evil.com">გარე</a>
      <label for="q">ძებნა</label><input id="q" value="">
      <input type="password" id="pw">
      <button aria-label="შექმნა ✦28">+</button>
      <button disabled>გამორთული</button>
      <select id="s" name="ხარისხი"><option value="720">720p</option><option value="1080">1080p</option></select>
    </main>
    <aside data-agent-ignore><button>Agent G panel</button></aside>`;
}

describe('the site agent on a page', () => {
  beforeEach(page);
  afterEach(() => removeCursor());

  test('lists what the user can use, numbered; never a password field, never its own panel', () => {
    const s = snapshotPage();
    expect(s.title).toBe('MyAvatar');
    expect(s.text).toContain('სტუდია');
    const labels = s.els.map((e) => `${e.ref}:${e.kind}:${e.label}`);
    expect(labels).toEqual(['1:link:ბიბლიოთეკა', '2:link:გარე', '3:input:ძებნა', '4:button:შექმნა ✦28', '5:button:გამორთული', '6:select:ხარისხი']);
    expect(s.els[0]!.href).toBe('/ka/library');
    expect(s.els[1]!.href).toBeUndefined(); // another site's address is not offered
    expect(s.els[4]!.disabled).toBe(true);
    expect(JSON.stringify(s)).not.toContain('Agent G panel');
    expect(document.querySelector('#pw')!.hasAttribute('data-agent-ref')).toBe(false);
  });

  test('types so the app sees it, clicks with the cursor, chooses an option, goes through the router', async () => {
    jest.useFakeTimers();
    try {
      snapshotPage();
      const q = document.querySelector('#q') as HTMLInputElement;
      const seen: string[] = [];
      q.addEventListener('input', () => seen.push(q.value));
      const typing = actOnPage({ op: 'type', ref: 3, text: 'ზღვის ვიდეო' }, () => {});
      await jest.runAllTimersAsync();
      expect(await typing).toBe(true);
      expect(q.value).toBe('ზღვის ვიდეო');
      expect(seen[seen.length - 1]).toBe('ზღვის ვიდეო');

      const clicked = jest.fn();
      document.querySelector('a')!.addEventListener('click', (e) => { e.preventDefault(); clicked(); });
      const click = actOnPage({ op: 'click', ref: 1 }, () => {});
      await jest.runAllTimersAsync();
      expect(await click).toBe(true);
      expect(clicked).toHaveBeenCalled();
      expect(document.getElementById('agent-g-cursor')).not.toBeNull();

      const sel = actOnPage({ op: 'select', ref: 6, value: '1080p' }, () => {});
      await jest.runAllTimersAsync();
      expect(await sel).toBe(true);
      expect((document.querySelector('#s') as HTMLSelectElement).value).toBe('1080');

      const go = jest.fn();
      expect(await actOnPage({ op: 'go', path: '/ka/library' }, go)).toBe(true);
      expect(go).toHaveBeenCalledWith('/ka/library');
      expect(await actOnPage({ op: 'click', ref: 99 }, () => {})).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
