import { fireEvent, render } from '@testing-library/react';
import { GenerateButton } from './GenerateButton';
import { track } from '../../../lib/analytics/track';
import { __resetServiceEvents } from '../../../lib/analytics/serviceEvents';

jest.mock('../../../lib/analytics/track', () => ({ track: jest.fn() }));
const mockTrack = track as jest.MockedFunction<typeof track>;
beforeEach(() => {
  mockTrack.mockClear();
  __resetServiceEvents();
});

const setup = (props: Partial<React.ComponentProps<typeof GenerateButton>> = {}) => {
  const onClick = jest.fn();
  // Query inside this render's own container: a test that sets up twice must not see the first button too.
  const { container } = render(<GenerateButton label="Generate" locale="en" onClick={onClick} {...props} />);
  return { onClick, btn: container.querySelector('button') as HTMLButtonElement };
};

test('shows the price ON the button and names it for screen readers', () => {
  const { btn } = setup({ credits: 60 });
  expect(btn.textContent).toContain('Generate');
  expect(btn.textContent).toContain('60');
  expect(btn.getAttribute('aria-label')).toBe('Generate — 60 credits');
  expect(btn.getAttribute('data-price')).toBe('60');
});

test('thousands are grouped; the label is in the language (ka / ru plural)', () => {
  const { btn } = setup({ credits: 1250 });
  expect(btn.textContent).toContain('1,250');
  expect(btn.getAttribute('aria-label')).toBe('Generate — 1250 credits');
});

test('a free action shows "Free" instead of a number', () => {
  const { btn } = setup({ credits: 25, free: true });
  expect(btn.textContent).toContain('Free');
  expect(btn.textContent).not.toContain('25');
  expect(btn.getAttribute('aria-label')).toBe('Generate — Free');
});

test('no price (0 / null / undefined) → just the label', () => {
  for (const credits of [0, null, undefined]) {
    const { btn } = setup({ credits });
    expect(btn.getAttribute('aria-label')).toBe('Generate');
    expect(btn.hasAttribute('data-price')).toBe(false);
  }
});

test('click fires; disabled and loading do not', () => {
  const a = setup({ credits: 5 });
  fireEvent.click(a.btn);
  expect(a.onClick).toHaveBeenCalledTimes(1);
  const b = setup({ credits: 5, disabled: true });
  fireEvent.click(b.btn);
  expect(b.onClick).not.toHaveBeenCalled();
});

test('loading keeps the button, swaps in the busy label and marks aria-busy', () => {
  const { btn } = setup({ credits: 5, loading: true, loadingLabel: 'Rendering…' });
  expect(btn.disabled).toBe(true);
  expect(btn.getAttribute('aria-busy')).toBe('true');
  expect(btn.textContent).toContain('Rendering…');
});

test('insufficient balance: the price stays, the call to action becomes top-up, and it is still clickable', () => {
  const { btn, onClick } = setup({ credits: 60, insufficient: true });
  expect(btn.textContent).toContain('Top up');
  expect(btn.textContent).toContain('60');
  expect(btn.getAttribute('aria-label')).toBe('Top up — 60 credits');
  fireEvent.click(btn);
  expect(onClick).toHaveBeenCalledTimes(1);
});

test('an optional leading icon is decorative: shown before the label, never part of the accessible name', () => {
  const { btn } = setup({ credits: 5, icon: <svg data-testid="lead" /> });
  const lead = btn.querySelector('[data-testid="lead"]') as SVGElement;
  expect(lead).toBeTruthy();
  expect(lead.parentElement!.getAttribute('aria-hidden')).toBe('true');
  expect(btn.firstElementChild).toBe(lead.parentElement); // before the label
  expect(btn.getAttribute('aria-label')).toBe('Generate — 5 credits');
  const { btn: plain } = setup({ credits: 5 });
  expect(plain.querySelector('[aria-hidden="true"] svg[data-testid="lead"]')).toBeNull();
});

test('§50: a shown price is reported once under its catalog service; a free or unpriced button reports nothing', () => {
  const { container } = render(<GenerateButton label="Generate" locale="en" onClick={jest.fn()} credits={60} service="image.generate" />);
  expect(container.querySelector('button')).not.toBeNull();
  expect(mockTrack.mock.calls).toEqual([['service_quote_shown', { service: 'image.generate', credits: 60, surface: 'panel' }]]);
  mockTrack.mockClear();
  setup({ credits: 60, free: true, service: 'video.generate' });
  setup({ credits: 0, service: 'music.generate' });
  setup({ credits: 60 });
  expect(mockTrack).not.toHaveBeenCalled();
});
