/**
 * @jest-environment jsdom
 *
 * ModelSwitcher — the Gemini-style model picker at the top-left of the chat (docs/DESIGN.md §12).
 *
 * What it must do, because the send path depends on it: a choice lands in lib/chat/chatModeStore (read by
 * OmniStudio.streamChat AT SEND TIME), so a switch mid-conversation applies to the very next turn. And it must behave
 * like a menu button — keyboard, Escape back to the trigger, an outside tap closes it — in both headers at once.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { ModelSwitcher, OPEN_PERSONA_EVENT, PERSONA_CHANGED_EVENT, selectPersona, useActivePersona } from './ModelSwitcher';
import { CHAT_MODES, CHAT_MODE_STORAGE_KEY } from '@/lib/chat/chatModes';
import { __resetChatModeMemo, getChatMode } from '@/lib/chat/chatModeStore';
import { PERSONA_STORAGE_KEY } from '@/components/studio/PersonaPicker';

const trigger = () => screen.getAllByTestId('model-switcher')[0]!;
const menu = () => screen.queryByRole('menu');
const radios = () => within(menu()!).getAllByRole('menuitemradio');

beforeEach(() => {
  window.localStorage.clear();
  __resetChatModeMemo();
});

describe('ModelSwitcher — the trigger', () => {
  it('desktop: a muted „Gemini“, the current mode and a closed menu button', () => {
    render(<ModelSwitcher variant="desktop" locale="ka" />);
    const t = trigger();
    expect(t.textContent).toBe('Gemini3.8 Flash');
    expect(t.getAttribute('aria-haspopup')).toBe('menu');
    expect(t.getAttribute('aria-expanded')).toBe('false');
    expect(t.getAttribute('aria-label')).toBe('მოდელის არჩევა, ამჟამად: Gemini 3.8 Flash');
    expect(menu()).toBeNull();
  });

  it('phone: the wordmark and the mode in the accent; the wordmark classes come from the header', () => {
    render(<ModelSwitcher variant="phone" locale="ka" brandClassName="max-[359px]:hidden md:hidden" />);
    const t = trigger();
    expect(within(t).getByRole('img', { hidden: true }).getAttribute('aria-label')).toBe('MyAvatar.ge');
    expect(within(t).getByText('3.8 Flash').className).toContain('text-app-accent');
    expect(t.querySelector('.md\\:hidden')).not.toBeNull();
  });

  it('shows the saved mode on first paint', () => {
    window.localStorage.setItem(CHAT_MODE_STORAGE_KEY, 'pro');
    render(<ModelSwitcher variant="desktop" locale="en" />);
    expect(trigger().textContent).toBe('Gemini3.1 Pro');
    expect(trigger().getAttribute('aria-label')).toBe('Choose a model, current: Gemini 3.1 Pro');
  });
});

describe('ModelSwitcher — choosing a model', () => {
  it('lists every mode as a radio item with the current one checked', () => {
    render(<ModelSwitcher variant="desktop" locale="ka" />);
    fireEvent.click(trigger());
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(radios()).toHaveLength(CHAT_MODES.length);
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual(CHAT_MODES.map((m) => String(m.id === 'fast')));
    // The check mark is drawn only on the chosen row.
    expect(radios()[0]!.querySelector('svg')).not.toBeNull();
    expect(radios()[1]!.querySelector('svg')).toBeNull();
  });

  it('a pick is saved to the store the send path reads, closes the menu and returns focus to the trigger', () => {
    render(<ModelSwitcher variant="desktop" locale="ka" />);
    fireEvent.click(trigger());
    fireEvent.click(within(menu()!).getByRole('menuitemradio', { name: /3\.1 Pro/ }));
    expect(getChatMode()).toBe('pro');
    expect(window.localStorage.getItem(CHAT_MODE_STORAGE_KEY)).toBe('pro');
    expect(menu()).toBeNull();
    expect(trigger().textContent).toBe('Gemini3.1 Pro');
    expect(document.activeElement).toBe(trigger());
  });

  it('two switchers (the phone header and the desktop bar) never disagree', () => {
    render(<><ModelSwitcher variant="phone" locale="ka" /><ModelSwitcher variant="desktop" locale="ka" /></>);
    const [phone, desktop] = screen.getAllByTestId('model-switcher');
    fireEvent.click(desktop!);
    fireEvent.click(within(menu()!).getByRole('menuitemradio', { name: /Thinking/ }));
    expect(within(phone!).getByText('3.8 Flash Thinking')).toBeTruthy();
  });

  it('describes each mode in the UI language', () => {
    const { unmount } = render(<ModelSwitcher variant="desktop" locale="en" />);
    fireEvent.click(trigger());
    expect(within(menu()!).getByText('Fast all-around help')).toBeTruthy();
    expect(menu()!.getAttribute('aria-label')).toBe('Model');
    unmount();
    render(<ModelSwitcher variant="desktop" locale="ru" />);
    fireEvent.click(trigger());
    expect(within(menu()!).getByText('Быстрая помощь на каждый день')).toBeTruthy();
    expect(within(menu()!).getByText('Персона')).toBeTruthy();
  });

  it('Georgian descriptions keep 16 px on a 1.6 line; Latin ones take Gemini’s quieter size', () => {
    const { unmount } = render(<ModelSwitcher variant="desktop" locale="ka" />);
    fireEvent.click(trigger());
    expect(within(menu()!).getByText('სწრაფი პასუხები ყოველდღიური კითხვებისთვის').className).toContain('text-[16px] leading-[1.6]');
    unmount();
    render(<ModelSwitcher variant="desktop" locale="en" />);
    fireEvent.click(trigger());
    expect(within(menu()!).getByText('Fast all-around help').className).toContain('text-[13px]');
  });
});

describe('ModelSwitcher — keyboard and dismissal', () => {
  it('ArrowDown on the trigger opens the menu on the checked item; arrows, Home and End move; Enter picks', () => {
    window.localStorage.setItem(CHAT_MODE_STORAGE_KEY, 'thinking');
    render(<ModelSwitcher variant="desktop" locale="ka" />);
    trigger().focus();
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    const items = [...radios(), within(menu()!).getByRole('menuitem')];
    expect(document.activeElement).toBe(items[1]); // Thinking — the checked one
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement).toBe(items[items.length - 1]); // the persona row
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[0]); // wraps
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(items[0]);
    // Enter on a native button activates it.
    fireEvent.click(document.activeElement!);
    expect(getChatMode()).toBe('fast');
    expect(menu()).toBeNull();
  });

  it('ArrowUp on the trigger opens on the last item', () => {
    render(<ModelSwitcher variant="desktop" locale="ka" />);
    fireEvent.keyDown(trigger(), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(within(menu()!).getByRole('menuitem'));
  });

  it('Escape closes the menu, gives the focus back to the trigger and goes no further', () => {
    const outer = jest.fn();
    document.addEventListener('keydown', outer);
    render(<ModelSwitcher variant="desktop" locale="ka" />);
    fireEvent.click(trigger());
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger());
    // A drawer or dialog underneath (they listen on the document) must not close on the same key.
    expect(outer).not.toHaveBeenCalled();
    document.removeEventListener('keydown', outer);
  });

  it('a tap outside closes it; a tap inside does not', () => {
    render(<><button type="button">elsewhere</button><ModelSwitcher variant="desktop" locale="ka" /></>);
    fireEvent.click(trigger());
    fireEvent.pointerDown(menu()!);
    expect(menu()).not.toBeNull();
    fireEvent.pointerDown(screen.getByText('elsewhere'));
    expect(menu()).toBeNull();
  });

  it('Tab leaves the menu closed', () => {
    render(<ModelSwitcher variant="desktop" locale="ka" />);
    fireEvent.click(trigger());
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(menu()).toBeNull();
  });
});

describe('ModelSwitcher — the persona row', () => {
  it('names the default when no persona is chosen, and opens the picker through ChatChrome', () => {
    const opened = jest.fn();
    window.addEventListener(OPEN_PERSONA_EVENT, opened);
    render(<ModelSwitcher variant="desktop" locale="ka" />);
    fireEvent.click(trigger());
    const row = within(menu()!).getByRole('menuitem');
    expect(row.textContent).toContain('პერსონა');
    expect(row.textContent).toContain('ნაგულისხმევი');
    fireEvent.click(row);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
    window.removeEventListener(OPEN_PERSONA_EVENT, opened);
  });

  it('names the active persona in the accent, and follows a change made elsewhere', () => {
    window.localStorage.setItem(PERSONA_STORAGE_KEY, 'film-director');
    render(<ModelSwitcher variant="desktop" locale="en" />);
    fireEvent.click(trigger());
    const name = () => within(within(menu()!).getByRole('menuitem')).getAllByText(/./).find((el) => el.className.includes('truncate'))!;
    expect(name().className).toContain('text-app-accent');
    expect(name().textContent).not.toBe('Default');
    act(() => { selectPersona(''); });
    expect(window.localStorage.getItem(PERSONA_STORAGE_KEY)).toBe('');
    expect(name().textContent).toBe('Default');
    expect(name().className).toContain('text-app-muted');
  });
});

describe('useActivePersona / selectPersona', () => {
  function Probe() {
    const p = useActivePersona('ka');
    return <span data-testid="probe">{p.id}|{p.name}</span>;
  }

  it('resolves built-in and custom personas to a name, and announces every change', () => {
    const heard: unknown[] = [];
    const on = (e: Event) => heard.push((e as CustomEvent).detail);
    window.addEventListener(PERSONA_CHANGED_EVENT, on);
    window.localStorage.setItem('myavatar:personas:custom', JSON.stringify([{ id: 'custom:x', name: { ka: 'ჩემი', en: 'Mine', ru: 'Моя' }, directive: 'd' }]));
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('|');
    act(() => { selectPersona('custom:x'); });
    expect(screen.getByTestId('probe').textContent).toBe('custom:x|ჩემი');
    act(() => { selectPersona(''); });
    expect(screen.getByTestId('probe').textContent).toBe('|');
    expect(heard).toEqual(['custom:x', '']);
    window.removeEventListener(PERSONA_CHANGED_EVENT, on);
  });

  it('an unknown id has no name (no invented label)', () => {
    window.localStorage.setItem(PERSONA_STORAGE_KEY, 'gone');
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('gone|');
  });
});
