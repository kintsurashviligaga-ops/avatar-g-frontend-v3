/**
 * ModelPicker — the studio's one model chooser: a chip (or the surface's own row) → the BottomSheet of the catalogue's rows
 * for a service. Pinned: name · badge · "best for" on every row; rows this surface cannot run are present, dimmed, say why
 * in the UI language and do nothing on a tap; a radio group with one Tab stop and arrows that skip the dimmed rows; a pick
 * closes the sheet; the server's availability is asked only once the sheet opens; and never a price.
 *
 * v32 (lib/providers/policy): the catalogue holds Google rows only (Veo for video), so the dimmed rows here are Google rows the
 * server says cannot run right now — and no answer from the server can add a retired provider's row.
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
/** The server answers (once the sheet opens) with these availabilities. */
const answer = (models: Array<{ id: string; available: boolean; reason: string | null }>) =>
  fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ models }) }));
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

  test('Georgian first: the chip, the title, the rows and the reasons speak the UI language', async () => {
    answer([{ id: 'google/veo-3.1', available: false, reason: 'not_enabled' }]);
    render(<Harness locale="ka" />);
    fireEvent.click(screen.getByTestId('model-picker-chip'));
    const sheet = screen.getByRole('dialog', { name: 'მოდელი' });
    expect(sheet.textContent).toContain('ყოველდღიური Reels და რეკლამა');
    await waitFor(() => expect(sheet.textContent).toContain('ჯერ არ არის ჩართული'));
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

  test('a row that cannot run right now is in the list, dimmed, says why, and a tap on it does nothing', async () => {
    answer([{ id: 'google/veo-3.1', available: false, reason: 'not_configured' }]);
    const onPick = jest.fn();
    render(<Harness onPick={onPick} />);
    fireEvent.click(screen.getByTestId('model-picker-chip'));
    // v32: the video list is the three Veo rows — no retired provider is listed, dimmed or otherwise.
    expect(radios().map((r) => r.getAttribute('data-model')).sort()).toEqual(['google/veo-3.1', 'google/veo-3.1-fast', 'google/veo-3.1-lite']);
    await waitFor(() => expect(radio('google/veo-3.1').getAttribute('aria-disabled')).toBe('true'));
    const veo = radio('google/veo-3.1');
    expect(veo.getAttribute('data-blocked')).toBe('not_configured');
    expect(within(veo).getByTestId('model-block').textContent).toBe('Unavailable right now');
    fireEvent.click(veo);
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
  test('asked only once the sheet opens; on another surface its answer names where a row runs ("In the Video tool") — and it cannot add a retired row', async () => {
    answer([
      { id: 'google/veo-3.1-fast', available: true, reason: null },
      { id: 'google/veo-3.1', available: false, reason: 'busy' },
      // A stale server still naming retired Higgsfield models: dropped — the list is the catalogue's.
      { id: 'hf/kling-3-std-t2v', available: true, reason: null },
      { id: 'hf/kling-3-pro-t2v', available: false, reason: 'studio_off' },
    ]);
    render(<Harness runners={['studio']} />);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('model-picker-chip'));
    expect(fetchMock).toHaveBeenCalledWith('/api/studio/catalogue?service=video', expect.anything());
    await waitFor(() => expect(within(radio('google/veo-3.1-fast')).getByTestId('model-block').textContent).toBe('In the Video tool'));
    expect(radio('google/veo-3.1-fast').getAttribute('aria-disabled')).toBe('true'); // still not runnable HERE
    expect(within(radio('google/veo-3.1')).getByTestId('model-block').textContent).toBe('Busy — try again shortly');
    expect(radios().some((r) => r.getAttribute('data-model')!.startsWith('hf/'))).toBe(false);
  });

  test('a surface that knows its own availability (Studio β) passes it and asks nothing; it lists only its own rows — none under v32', () => {
    render(<Harness runners={['studio']} include="runnable" initial="hf/kling-3-std-t2v"
      status={{ 'hf/kling-3-std-t2v': { available: true, reason: null }, 'hf/seedance-2.5-t2v': { available: true, reason: null } }} />);
    fireEvent.click(screen.getByTestId('model-picker-chip'));
    expect(fetchMock).not.toHaveBeenCalled();
    // The surface's own status says two Higgsfield models run; the catalogue has no Studio β row, so nothing is listed.
    expect(within(dialog()).queryAllByRole('radio')).toEqual([]);
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
