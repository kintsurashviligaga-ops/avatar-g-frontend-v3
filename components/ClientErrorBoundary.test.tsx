/** Phase 8.15: the crash screen speaks the page language (it was English only) and its button is a real 44 px button. */
import { render, screen } from '@testing-library/react';
import { ClientErrorBoundary } from './ClientErrorBoundary';

function Boom(): JSX.Element {
  throw new Error('boom');
}

let errSpy: jest.SpyInstance;
beforeEach(() => { errSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { errSpy.mockRestore(); document.documentElement.lang = ''; });

test('Georgian by default', () => {
  render(<ClientErrorBoundary><Boom /></ClientErrorBoundary>);
  expect(screen.getByTestId('client-error-fallback')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'რაღაც ვერ ჩაიტვირთა' })).toBeTruthy();
  const btn = screen.getByRole('button', { name: 'თავიდან ცდა' });
  expect(btn.getAttribute('type')).toBe('button');
  expect(btn.className).toContain('min-h-[44px]');
});

test('English and Russian follow <html lang>', () => {
  document.documentElement.lang = 'en';
  const { unmount } = render(<ClientErrorBoundary><Boom /></ClientErrorBoundary>);
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  unmount();
  document.documentElement.lang = 'ru';
  render(<ClientErrorBoundary><Boom /></ClientErrorBoundary>);
  expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy();
});
