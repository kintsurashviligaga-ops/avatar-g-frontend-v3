/**
 * ModelPicker — the studio's one model chooser: a chip (or the surface's own row) → the BottomSheet of the catalogue's rows
 * for a service. Pinned: name · badge · "best for" on every row; rows this surface cannot run are present, dimmed, say why
 * in the UI language and do nothing on a tap; a radio group with one Tab stop and arrows that skip the dimmed rows; a pick
 * closes the sheet; the server's availability is asked only once the sheet opens; and never a price.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { ModelPicker, blockLabel, type ModelPickerProps } from './ModelPicker';
import { __resetCatalogueStatusCache, parseCatalogueStatus } from './useCatalogueStatus';
import { pickerRows } from '@/lib/studio/modelPick';

const realFetch = global.fetch;
let fetchMock: jest.Mock;

beforeEach(() => {
  __resetCatalogueStatusCache();
  // Unanswered by default: the rows a test checks are the ones the picker shows BEFORE the server says anything.
  fetchMock = jest.fn(() => new Promise(() => { /* never settles */ }));
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => { global.fetch = realFetch; });

function Harness(over: Partial<ModelPickerProps> & { initial?: string; onPick?: (id: string) => void }) {
  const [value, setValue] = useState(over.initial ?? 'google/veo-3.1-fast');
  return (
    <ModelPicker service="video" locale="en" runners={['film']} {...over} value={value}
      onChange={(id) => { setValue(id); over.onPick?.(id); }} />
  );
}

const dialog = () => screen.getByRole('dialog', { name: 'Model' });
const radios = () => within(dialog()).getAllByRole('radio');
const radio = (id: string) => radios().find((r) => r.getAttribute('data-model') === id)!;

describe('the chip', () => {
  test('a compact button with the current model; it opens the sheet as a dialog', () => {
    render(<Harness />);
    const chip = screen.getByTestId('model-picker-chip');
    expect(chip.textContent).toContain('Veo 3.1 Fast');
    expect(chip.getAttribute('aria-haspopup')).toBe('dialog');
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect(chip.getAttribute('aria-label')).toBe('Model: Veo 3.1 Fast');
    fireEvent.click(chip);
    expect(dialog().getAttribute('aria-modal')).toBe('true');
  });

  test('Georgian first: the chip, the title, the rows and the reasons speak the UI language', () => {
    render(<Harness locale="ka" />);
    fireEvent.click(screen.getByTestId('model-picker-chip'));
    const sheet = screen.getByRole('dialog', { name: 'მოდელი' });
    expect(sheet.textContent).toContain('ყოველდღიური Reels და რეკლამა');
    expect(sheet.textContent).toContain('ჯერ არ არის ჩართული');
    expect(sheet.textContent).toContain('სხვა მოდელები');
  });
});

describe('the rows', () => {
  test('name, a speed/quality badge and one line on what it is for; the current one checked', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('model-picker-chip'));
    expect(radio('google/veo-3.1-fast').getAttribute('aria-checked')).toBe('true');
    expect(radio('google/veo-3.1-fast').textContent).toContain('Everyday Reels and ads');
    expect(radio('google/veo-3.1-lite').querySelector('[data-tier]')!.textContent).toBe('Fast');
    expect(radio('google/veo-3.1').querySelector('[data-tier]')!.textContent).toBe('Max quality');
    for (const r of radios()) expect(r.className).toContain('min-h-[64px]'); // ≥ 44 px targets
  });

  test('⚠️ never a price — no credits, no currency, no number from a quote', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('model-picker-chip'));
    expect(dialog().textContent).not.toMatch(/credit|кредит|კრედიტ|₾|\$|✦/i);
  });

  test('a row this surface cannot run is in the list, dimmed, says why, and a tap on it does nothing', () => {
    const onPick = jest.fn();
    render(<Harness onPick={onPick} />);
    fireEvent.click(screen.getByTestId('model-picker-chip'));
    const kling = radio('hf/kling-3-std-t2v');
    expect(kling.getAttribute('aria-disabled')).toBe('true');
    expect(kling.getAttribute('data-blocked')).toBe('not_enabled');
    expect(within(kling).getByTestId('model-block').textContent).toBe('Not enabled yet');
    fireEvent.click(kling);
    expect(onPick).not.toHaveBeenCalled();
    expect(dialog()).toBeTruthy();
    // The dimmed rows sit after the open ones, under "Other models".
    const order = radios().map((r) => r.getAttribute('aria-disabled') === 'true');
    expect(order).toEqual([...order].sort((a, b) => Number(a) - Number(b)));
    expect(dialog().textContent).toContain('Other models');
  });

  test('a pick is one tap: onChange with the id, the sheet closes, the chip reads the new model', () => {
    const onPick = jest.fn();
    render(<Harness onPick={onPick} />);
    fireEvent.click(screen.getByTestId('model-picker-chip'));
    fireEvent.click(radio('google/veo-3.1'));
    expect(onPick).toHaveBeenCalledWith('google/veo-3.1');
    expect(screen.queryByRole('dialog', { name: 'Model' })).toBeNull();
    expect(screen.getByTestId('model-picker-chip').textContent).toContain('Veo 3.1');
  });

  test('keyboard: one Tab stop (the checked row); arrows, Home and End move among the rows a tap may choose', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('model-picker-chip'));
    const all = radios();
    const open = all.filter((r) => r.getAttribute('aria-disabled') !== 'true');
    expect(all.filter((r) => r.tabIndex === 0)).toEqual([radio('google/veo-3.1-fast')]);
    open[1]!.focus();
    fireEvent.keyDown(open[1]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(open[2]);
    fireEvent.keyDown(open[2]!, { key: 'ArrowDown' }); // wraps past the dimmed rows
    expect(document.activeElement).toBe(open[0]);
    fireEvent.keyDown(open[0]!, { key: 'End' });
    expect(document.activeElement).toBe(open[2]);
    fireEvent.keyDown(open[2]!, { key: 'Home' });
    expect(document.activeElement).toBe(open[0]);
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(screen.queryByRole('dialog', { name: 'Model' })).toBeNull();
  });
});

describe('what the server says', () => {
  test('asked only once the sheet opens; its answer opens a row that is enabled elsewhere as "In Studio β"', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ models: [
        { id: 'google/veo-3.1-fast', available: true, reason: null },
        { id: 'hf/kling-3-std-t2v', available: true, reason: null },
        { id: 'hf/kling-3-pro-t2v', available: false, reason: 'studio_off' },
      ] }),
    }));
    render(<Harness />);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('model-picker-chip'));
    expect(fetchMock).toHaveBeenCalledWith('/api/studio/catalogue?service=video', expect.anything());
    await waitFor(() => expect(within(radio('hf/kling-3-std-t2v')).getByTestId('model-block').textContent).toBe('In Studio β'));
    expect(radio('hf/kling-3-std-t2v').getAttribute('aria-disabled')).toBe('true'); // still not runnable HERE
    expect(within(radio('hf/kling-3-pro-t2v')).getByTestId('model-block').textContent).toBe('Not enabled yet');
  });

  test('a surface that knows its own availability (Studio β) passes it and asks nothing; it lists only its own rows', () => {
    render(<Harness runners={['studio']} include="runnable" initial="hf/kling-3-std-t2v"
      status={{ 'hf/kling-3-std-t2v': { available: true, reason: null }, 'hf/seedance-2.5-t2v': { available: true, reason: null } }} />);
    fireEvent.click(screen.getByTestId('model-picker-chip'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(radios().every((r) => r.getAttribute('data-model')!.startsWith('hf/'))).toBe(true);
    expect(radios().filter((r) => r.getAttribute('aria-disabled') !== 'true').map((r) => r.getAttribute('data-model')))
      .toEqual(['hf/kling-3-std-t2v', 'hf/seedance-2.5-t2v']);
  });

  test('controlled by the surface\'s own trigger: no chip, open / onOpenChange, and a header slot above the list', () => {
    const onOpenChange = jest.fn();
    render(<Harness trigger="none" open onOpenChange={onOpenChange} header={<p data-testid="slot">mode</p>} />);
    expect(screen.queryByTestId('model-picker-chip')).toBeNull();
    expect(within(dialog()).getByTestId('slot')).toBeTruthy();
    fireEvent.click(radio('google/veo-3.1-lite'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test('a malformed answer is dropped row by row, never trusted', () => {
    expect(parseCatalogueStatus(null)).toBeNull();
    expect(parseCatalogueStatus({ models: 'x' })).toBeNull();
    expect(parseCatalogueStatus({ models: [{ id: 1 }, { id: 'a', available: 'yes', reason: 'pwned' }, { id: 'b', available: true, reason: 'busy' }] }))
      .toEqual({ a: { available: false, reason: 'not_enabled' }, b: { available: true, reason: null } });
  });

  test('every reason has words in every language', () => {
    for (const block of ['unverified', 'not_enabled', 'studio_off', 'not_configured', 'busy', 'checking'] as const) {
      const row = { ...pickerRows('video', { runners: ['film'], status: null })[0]!, selectable: false, block };
      for (const locale of ['ka', 'en', 'ru']) expect(blockLabel(row, locale)!.length).toBeGreaterThan(2);
    }
  });
});
