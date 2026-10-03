/**
 * @jest-environment jsdom
 *
 * lib/voice/liveUi — what a voice call may see and press. The guards are the point: nothing here may spend, pay,
 * delete, open a file picker or touch the call's own screen.
 */
import { findControl, guardOf, linkKind, snapshotControls, submitField, typeInto } from './liveUi';

function page(html: string) {
  document.body.innerHTML = html;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('snapshotControls', () => {
  it('lists the visible, named controls with a stable id, their role, state and guard — nothing hidden, nothing of the call', () => {
    page(`
      <button aria-pressed="true">ვიდეო</button>
      <button aria-label="ხელსაწყოები">+</button>
      <button hidden>secret</button>
      <div aria-hidden="true"><button>behind</button></div>
      <span class="sr-only"><button>sr</button></span>
      <button></button>
      <input type="search" placeholder="ძებნა…" value="cats" />
      <button data-price="25">შექმნა ✦ 25</button>
      <div data-live-status="listening"><button>დასრულება</button></div>
    `);
    const first = snapshotControls(document);
    expect(first.controls.map((c) => c.name)).toEqual(['ვიდეო', 'ხელსაწყოები', 'ძებნა…', 'შექმნა ✦ 25']);
    expect(first.controls[0]).toMatchObject({ role: 'button', state: 'pressed' });
    expect(first.controls[2]).toMatchObject({ role: 'textbox', state: 'text: "cats"' });
    expect(first.controls[3]).toMatchObject({ guard: 'spend' });
    // The same element keeps its id across snapshots (the model clicks by it).
    const again = snapshotControls(document);
    expect(again.controls.map((c) => c.id)).toEqual(first.controls.map((c) => c.id));
    expect(first.controls[0]!.id).toMatch(/^c\d+$/);
  });

  it('an open sheet takes the screen: only its controls are listed, and it is named', () => {
    page(`
      <button>behind the sheet</button>
      <div role="dialog" aria-modal="true" aria-label="პარამეტრები"><button>9:16</button><button>16:9</button></div>
    `);
    const s = snapshotControls(document);
    expect(s.sheet).toBe('პარამეტრები');
    expect(s.controls.map((c) => c.name)).toEqual(['9:16', '16:9']);
  });

  it('is bounded', () => {
    page(Array.from({ length: 80 }, (_, i) => `<button>b${i}</button>`).join(''));
    expect(snapshotControls(document, 10).controls).toHaveLength(10);
  });
});

describe('findControl', () => {
  it('by id, then by name: exact, starts-with, contains — ignoring quotes and case', () => {
    page('<button>ვიდეო</button><button>„მუსიკა“ სტუდია</button><button>Video settings</button>');
    const { controls } = snapshotControls(document);
    expect(findControl(controls[0]!.id, document)?.textContent).toBe('ვიდეო');
    expect(findControl('ვიდეო', document)?.textContent).toBe('ვიდეო');
    expect(findControl('მუსიკა', document)?.textContent).toBe('„მუსიკა“ სტუდია');
    expect(findControl('video SETTINGS', document)?.textContent).toBe('Video settings');
    expect(findControl('nothing like it', document)).toBeNull();
  });

  it('never reaches the call\'s own buttons', () => {
    page('<div data-live-status="speaking"><button>End</button></div>');
    expect(findControl('End', document)).toBeNull();
  });
});

describe('guardOf — what a voice never presses', () => {
  const el = (html: string, sel = 'button,input,a') => { page(html); return document.querySelector(sel)!; };
  it.each([
    ['<button data-price="25">Create</button>', 'spend'],
    ['<button data-live-guard="spend">Run</button>', 'spend'],
    ['<button>შექმნა ✦ 75</button>', 'spend'],
    ['<button>Render — 12 credits</button>', 'spend'],
    ['<div data-live-guard="pay"><button>₾ 20</button></div>', 'pay'],
    ['<button>Buy 500 credits</button>', 'pay'],
    ['<button>ჩატის წაშლა</button>', 'destructive'],
    ['<button>Sign out</button>', 'destructive'],
    ['<input type="file" />', 'file'],
    ['<label><input type="file" hidden /><button>Upload</button></label>', 'file'],
    ['<input type="password" />', 'password'],
    ['<div data-live-status="listening"><button>Mute</button></div>', 'call'],
  ])('%s → %s', (html, guard) => {
    expect(guardOf(el(html))).toBe(guard);
  });

  it.each([
    '<button data-price="free">Export</button>',
    '<div data-live-guard="pay"><button aria-label="Close">✕</button></div>',
    '<button>შევსება</button>', // top-up only OPENS the credits sheet
    '<button>ვიდეო</button>',
  ])('%s → free to press', (html) => {
    expect(guardOf(el(html))).toBeNull();
  });
});

describe('typeInto / submitField', () => {
  it('sets the value through the native setter and fires input + change (what React listens to)', () => {
    page('<input id="q" />');
    const input = document.getElementById('q') as HTMLInputElement;
    const seen: string[] = [];
    input.addEventListener('input', () => seen.push(`input:${input.value}`));
    input.addEventListener('change', () => seen.push('change'));
    expect(typeInto(input, 'წითელი მელია')).toBe(true);
    expect(input.value).toBe('წითელი მელია');
    expect(seen).toEqual(['input:წითელი მელია', 'change']);
  });

  it('a button is not a field', () => {
    page('<button>x</button>');
    expect(typeInto(document.querySelector('button')!, 'x')).toBe(false);
  });

  it('submits the form when there is one, otherwise presses Enter in the field', () => {
    page('<form><input id="a" /></form><textarea id="b"></textarea>');
    const form = document.querySelector('form')!;
    const submitted = jest.fn((e: Event) => e.preventDefault());
    form.addEventListener('submit', submitted);
    form.requestSubmit = function requestSubmit() { this.dispatchEvent(new Event('submit', { cancelable: true })); };
    submitField(document.getElementById('a') as HTMLElement);
    expect(submitted).toHaveBeenCalledTimes(1);
    const keys: string[] = [];
    document.getElementById('b')!.addEventListener('keydown', (e) => keys.push((e as KeyboardEvent).key));
    submitField(document.getElementById('b') as HTMLElement);
    expect(keys).toEqual(['Enter']);
  });
});

describe('linkKind', () => {
  const loc = { href: 'https://myavatar.ge/ka/dashboard', origin: 'https://myavatar.ge', pathname: '/ka/dashboard' } as Location;
  it.each([
    ['<a href="https://youtube.com/x">yt</a>', 'external'],
    ['<a href="/ka/library">lib</a>', 'other_page'],
    ['<a href="/ka/dashboard?tool=video">v</a>', 'same_page'],
    ['<a href="/ka/library" target="_blank">lib</a>', 'external'],
    ['<button>not a link</button>', null],
  ])('%s → %s', (html, kind) => {
    page(html);
    expect(linkKind(document.querySelector('a,button')!, loc)).toBe(kind);
  });
});
