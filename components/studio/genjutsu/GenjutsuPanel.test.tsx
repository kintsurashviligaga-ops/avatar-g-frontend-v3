/**
 * The VFX panel, with its network mocked: a preset tap enables Generate with NOTHING typed, the price on the button IS
 * lib/genjutsu/pricing, a mode that is not open is not offered, a shut mode is inert (no request can leave it), a guest is sent to sign-in, and a balance that
 * cannot pay turns the tap into "top up". The money itself is pinned by the route tests.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { genjutsuCredits } from '@/lib/genjutsu/pricing';

jest.mock('./api', () => ({
  ...jest.requireActual('./api'),
  fetchCapabilities: jest.fn(),
  fetchBalanceCredits: jest.fn(async () => 500),
  requestQuote: jest.fn(),
  startGeneration: jest.fn(),
  fetchStatus: jest.fn(async () => ({ ok: true, done: false, state: 'processing' })),
}));

import { GenjutsuPanel } from './GenjutsuPanel';
import { fetchBalanceCredits, fetchCapabilities, fetchStatus, startGeneration } from './api';

const OPEN = { scene: { open: true, state: 'open' }, motion: { open: false, state: 'soon' }, swap: { open: false, state: 'soon' } };
const generate = () => screen.getByTestId('vfx-generate') as HTMLButtonElement;

beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:x') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
});
beforeEach(() => {
  jest.clearAllMocks();
  document.documentElement.dataset.authed = '1';
  window.sessionStorage.clear();
  (fetchCapabilities as jest.Mock).mockResolvedValue(OPEN);
  (fetchBalanceCredits as jest.Mock).mockResolvedValue(500);
});

async function mount(locale = 'en') {
  render(<GenjutsuPanel locale={locale} />);
  await waitFor(() => expect(fetchCapabilities).toHaveBeenCalled());
  await act(async () => { await Promise.resolve(); });
}

test('before a preset is chosen the button names what is missing and is off', async () => {
  await mount();
  expect(generate().disabled).toBe(true);
  expect(generate().textContent).toContain('Pick an effect');
  expect(screen.getByTestId('vfx-hero').getAttribute('data-preset')).toBe('');
});

test('one tap on a preset enables Generate with NOTHING typed — and the price on the button is the pricing function\'s', async () => {
  await mount();
  fireEvent.click(document.querySelector('[data-preset="fire"]')!);
  expect(screen.getByTestId('vfx-hero').getAttribute('data-preset')).toBe('fire');
  expect((screen.getByTestId('vfx-prompt') as HTMLTextAreaElement).value).toBe('');
  expect(generate().disabled).toBe(false);
  expect(generate().getAttribute('data-price')).toBe(String(genjutsuCredits({ op: 'scene', refsUsed: 0, quality: 'fast' })));
  fireEvent.click(screen.getByRole('radio', { name: 'Standard' }));
  expect(generate().getAttribute('data-price')).toBe(String(genjutsuCredits({ op: 'scene', refsUsed: 0, quality: 'standard' })));
});

test('there are at least fourteen presets to tap', async () => {
  await mount();
  expect(document.querySelectorAll('[data-testid="vfx-presets"] [role="radio"]').length).toBeGreaterThanOrEqual(14);
});

test('Generate sends the contract: the preset id, the format, the price it displayed — and no prompt', async () => {
  (startGeneration as jest.Mock).mockResolvedValue({ ok: true, job: { jobId: 'j1', credits: 25, gel: null, refsUsed: 0, refsTotal: 0, engine: 'Veo 3.1 Fast', seconds: null } });
  await mount();
  fireEvent.click(document.querySelector('[data-preset="portal"]')!);
  await act(async () => { fireEvent.click(generate()); });
  await waitFor(() => expect(startGeneration).toHaveBeenCalledTimes(1));
  expect((startGeneration as jest.Mock).mock.calls[0]![0]).toMatchObject({ op: 'scene', preset: 'portal', quality: 'fast', aspect: '9:16', expectedCredits: 25, references: [], referencesTotal: 0 });
  expect((startGeneration as jest.Mock).mock.calls[0]![0].prompt).toBeUndefined();
  await waitFor(() => expect(screen.getByTestId('vfx-job')).toBeTruthy());
});

test('a mode that is not open is not offered: no Motion or Swap tab, no tab bar, no engine row for them', async () => {
  await mount();
  expect(screen.queryByTestId('vfx-modes')).toBeNull();
  expect(screen.queryByRole('radio', { name: /Motion|Swap/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Engines & prices/ }));
  expect(document.querySelectorAll('[data-engine^="scene-"]').length).toBe(2);
  expect(document.querySelectorAll('[data-engine^="motion-"], [data-engine^="swap-"]').length).toBe(0);
});

test('once Motion and Swap open, the three tabs are offered', async () => {
  (fetchCapabilities as jest.Mock).mockResolvedValue({ scene: OPEN.scene, motion: { open: true, state: 'open' }, swap: { open: true, state: 'open' } });
  await mount();
  expect(screen.getByTestId('vfx-modes').querySelectorAll('[role="radio"]').length).toBe(3);
  fireEvent.click(screen.getByRole('radio', { name: /Motion/ }));
  expect(screen.getByTestId('vfx-video-input')).toBeTruthy();
  expect(screen.queryByTestId('vfx-locked')).toBeNull();
});

test('a shut mode is shown with a plain "soon" line, its inputs are inert and its button cannot send anything', async () => {
  (fetchCapabilities as jest.Mock).mockResolvedValue({ ...OPEN, scene: { open: false, state: 'soon' } });
  await mount();
  fireEvent.click(document.querySelector('[data-preset="ice"]')!);
  expect(screen.getByTestId('vfx-locked').textContent).toContain('Soon');
  expect(generate().disabled).toBe(true);
  expect(generate().hasAttribute('data-price')).toBe(false);
  expect((screen.getByTestId('vfx-prompt') as HTMLTextAreaElement).disabled).toBe(true);
  fireEvent.click(generate());
  expect(startGeneration).not.toHaveBeenCalled();
});

test('a guest is asked to sign in at the moment of Generate — nothing is requested', async () => {
  document.documentElement.dataset.authed = '0';
  const seen = jest.fn();
  window.addEventListener('myavatar:auth-required', seen);
  await mount();
  fireEvent.click(document.querySelector('[data-preset="smoke"]')!);
  await act(async () => { fireEvent.click(generate()); });
  expect(seen).toHaveBeenCalledTimes(1);
  expect(startGeneration).not.toHaveBeenCalled();
  window.removeEventListener('myavatar:auth-required', seen);
});

test('a balance that cannot pay turns the tap into "Top up" and opens the top-up — not a request', async () => {
  (fetchBalanceCredits as jest.Mock).mockResolvedValue(10);
  const seen = jest.fn();
  window.addEventListener('myavatar:open-credits', seen);
  await mount();
  fireEvent.click(document.querySelector('[data-preset="glitch"]')!);
  await waitFor(() => expect(generate().textContent).toContain('Top up'));
  expect(generate().getAttribute('data-price')).toBe('25');
  await act(async () => { fireEvent.click(generate()); });
  expect(seen).toHaveBeenCalledTimes(1);
  expect(startGeneration).not.toHaveBeenCalled();
  window.removeEventListener('myavatar:open-credits', seen);
});

test('a stale price is corrected from the server\'s answer and the user is told', async () => {
  (startGeneration as jest.Mock).mockResolvedValue({ ok: false, status: 409, error: 'price_changed', credits: 30 });
  await mount();
  fireEvent.click(document.querySelector('[data-preset="fire"]')!);
  await act(async () => { fireEvent.click(generate()); });
  await waitFor(() => expect(generate().getAttribute('data-price')).toBe('30'));
  expect(screen.getByTestId('vfx-notice').textContent).toContain('now 30 credits');
});

test('a finished effect is handed to the chat once: onDelivered gets the video and its format', async () => {
  (startGeneration as jest.Mock).mockResolvedValue({ ok: true, job: { jobId: 'j2', credits: 25, gel: null, refsUsed: 0, refsTotal: 0, engine: 'Veo 3.1 Fast', seconds: null } });
  (fetchStatus as jest.Mock).mockResolvedValue({ ok: true, done: true, state: 'ready', videoUrl: 'https://cdn.example/vfx.mp4' });
  const onDelivered = jest.fn();
  const { rerender } = render(<GenjutsuPanel locale="en" onDelivered={onDelivered} />);
  await waitFor(() => expect(fetchCapabilities).toHaveBeenCalled());
  await act(async () => { await Promise.resolve(); });
  fireEvent.click(document.querySelector('[data-preset="fire"]')!);
  await act(async () => { fireEvent.click(generate()); });
  await waitFor(() => expect(onDelivered).toHaveBeenCalledTimes(1), { timeout: 6_000 });
  expect(onDelivered).toHaveBeenCalledWith('https://cdn.example/vfx.mp4', '9:16');
  // A re-render (a new callback identity from the parent) does not post the same video twice.
  const again = jest.fn();
  rerender(<GenjutsuPanel locale="en" onDelivered={again} />);
  await act(async () => { await Promise.resolve(); });
  expect(again).not.toHaveBeenCalled();
}, 10_000);

test('the panel speaks Georgian and Russian', async () => {
  const { unmount } = render(<GenjutsuPanel locale="ka" />);
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByTestId('vfx-hero').textContent).toContain('აირჩიე ეფექტი');
  unmount();
  render(<GenjutsuPanel locale="ru" />);
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByTestId('vfx-hero').textContent).toContain('Выберите эффект');
});
