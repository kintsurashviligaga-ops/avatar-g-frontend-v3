import { render, screen } from '@testing-library/react';
import { NotFoundView, localeFromPath } from './NotFoundView';

// Production 2026-10-16: /ka/does-not-exist showed the English root 404 ("Return to Base"). The root not-found now
// takes the language from the path.
describe('NotFoundView', () => {
  it('takes the language from the first path segment', () => {
    expect(localeFromPath('/ka/does-not-exist')).toBe('ka');
    expect(localeFromPath('/en/x/y')).toBe('en');
    expect(localeFromPath('/ru')).toBe('ru');
    expect(localeFromPath('/constructor/x')).toBe('ka');
    expect(localeFromPath('/xx')).toBe('ka');
    expect(localeFromPath(null)).toBe('ka');
  });

  it('renders Georgian on a /ka path and links back to /ka', () => {
    render(<NotFoundView locale={localeFromPath('/ka/does-not-exist')} />);
    expect(screen.getByText('გვერდი ვერ მოიძებნა')).toBeTruthy();
    expect(screen.getByText('მთავარზე').closest('a')?.getAttribute('href')).toBe('/ka');
  });

  it('renders Russian on a /ru path', () => {
    render(<NotFoundView locale="ru" />);
    expect(screen.getByText('Страница не найдена')).toBeTruthy();
  });
});
