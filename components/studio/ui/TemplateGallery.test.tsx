import { fireEvent, render, screen } from '@testing-library/react';
import { Film } from 'lucide-react';
import { TemplateGallery, type TemplateCardItem } from './TemplateGallery';

const items: TemplateCardItem[] = [
  { id: 'reel', label: 'Cinematic Reel', hint: '24s vertical', thumb: '/templates/video/reel.jpg', palette: ['#0B1A2C', '#338FE8'], meta: '9:16 · 24s' },
  { id: 'anime', label: 'Anime', hint: 'Anime look', thumb: null, palette: ['#1B0F2E', '#FF7AB6'], Icon: Film },
];

test('a radiogroup of cards: the derived active one is checked, the others are not', () => {
  render(<TemplateGallery label="Templates" items={items} activeId="reel" onPick={jest.fn()} testId="g" />);
  const group = screen.getByRole('radiogroup', { name: 'Templates' });
  expect(group).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Cinematic Reel' }).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('radio', { name: 'Anime' }).getAttribute('aria-checked')).toBe('false');
  expect(screen.getByText('9:16 · 24s')).toBeTruthy();
});

test('a thumbnail renders as a decorative image; a card without one paints its palette (no broken <img>)', () => {
  const { container } = render(<TemplateGallery label="T" items={items} activeId={null} onPick={jest.fn()} />);
  const imgs = container.querySelectorAll('img');
  expect(imgs).toHaveLength(1);
  expect(imgs[0]!.getAttribute('src')).toBe('/templates/video/reel.jpg');
  expect(imgs[0]!.getAttribute('alt')).toBe('');
  const anime = container.querySelector('[data-template="anime"]') as HTMLElement;
  expect(anime.style.backgroundImage).toContain('linear-gradient');
  expect(anime.style.backgroundImage).toContain('rgba(255, 122, 182, 0.33)');
});

test('picking a card calls onPick; picking the selected one again is a no-op (it never un-picks the panel)', () => {
  const onPick = jest.fn();
  render(<TemplateGallery label="T" items={items} activeId="reel" onPick={onPick} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Anime' }));
  expect(onPick).toHaveBeenCalledWith('anime');
  fireEvent.click(screen.getByRole('radio', { name: 'Cinematic Reel' }));
  expect(onPick).toHaveBeenCalledTimes(1);
});
