/**
 * @jest-environment jsdom
 *
 * The chat home's four quick buttons (GG's UI plan, 2026-10-18): video, image, music, avatar, in that order, named in the
 * page's language, and a tap names its tool (OmniStudio opens it with the typed text as the tool's description).
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { HomeQuickStart, QUICK_TOOLS } from './HomeQuickStart';

describe('HomeQuickStart', () => {
  it('is one named group of four buttons: video, image, music, avatar', () => {
    render(<HomeQuickStart locale="ka" onPick={() => {}} />);
    const group = screen.getByRole('group', { name: 'სწრაფი შექმნა' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['ვიდეო', 'სურათი', 'მუსიკა', 'ავატარი']);
    expect(QUICK_TOOLS).toEqual(['video', 'image', 'music', 'avatar']);
  });

  it.each([
    ['en', 'Quick create', ['Video', 'Image', 'Music', 'Avatar']],
    ['ru', 'Быстрое создание', ['Видео', 'Изображение', 'Музыка', 'Аватар']],
  ] as const)('speaks %s', (locale, group, names) => {
    render(<HomeQuickStart locale={locale} onPick={() => {}} />);
    expect(within(screen.getByRole('group', { name: group })).getAllByRole('button').map((b) => b.textContent)).toEqual([...names]);
  });

  it('a tap names its tool and nothing else', () => {
    const onPick = jest.fn();
    render(<HomeQuickStart locale="en" onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Music' }));
    fireEvent.click(screen.getByTestId('home-quick-avatar'));
    expect(onPick.mock.calls).toEqual([['music'], ['avatar']]);
  });
});
