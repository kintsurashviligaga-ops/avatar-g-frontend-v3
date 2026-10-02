import { fireEvent, render, screen } from '@testing-library/react';
import { Film } from 'lucide-react';
import { TEMPLATE_CARD_SIZES, TemplateGallery, TemplateThumbImage, type TemplateCardItem } from './TemplateGallery';
import { AVATAR_TEMPLATES, IMAGE_TEMPLATES, MUSIC_TEMPLATES, VIDEO_TEMPLATES, templateAddsLine } from '@/lib/studio/templates';
import { TEMPLATE_THUMB_META } from '@/lib/studio/templateThumbs.generated';

// The REAL next/image renders (its URLs, srcset and loading are asserted below); this wrapper only records the props it
// was given, because jsdom's CSS parser drops the blur placeholder's background-image from the rendered style.
const mockImageProps: Array<Record<string, unknown>> = [];
jest.mock('next/image', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require('react') as typeof import('react');
  const Actual = jest.requireActual('next/image').default;
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => {
      mockImageProps.push(props);
      return createElement(Actual, props);
    },
  };
});
beforeEach(() => { mockImageProps.length = 0; });

const items: TemplateCardItem[] = [
  { id: 'reel', label: 'Cinematic Reel', hint: '24s vertical', thumb: '/templates/video/reel.jpg', palette: ['#0B1A2C', '#338FE8'], meta: '9:16 · 24s' },
  { id: 'anime', label: 'Anime', hint: 'Anime look', thumb: null, palette: ['#1B0F2E', '#FF7AB6'], Icon: Film },
];

/** The site path an optimizer URL asks for (`/_next/image?url=…&w=…`). */
const optimizedPath = (src: string | null) => {
  expect(src).toMatch(/^\/_next\/image\?url=/);
  return new URLSearchParams(src!.slice(src!.indexOf('?') + 1)).get('url');
};
const card = (id: string, thumb: string | null): TemplateCardItem => ({ id, label: id, hint: id, thumb, palette: ['#0B1A2C', '#338FE8'] });
const renderCards = (cards: TemplateCardItem[]) => render(<TemplateGallery label="T" items={cards} activeId={null} onPick={jest.fn()} />);

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
  expect(imgs[0]!.getAttribute('alt')).toBe('');
  const anime = container.querySelector('[data-template="anime"]') as HTMLElement;
  expect(anime.style.backgroundImage).toContain('linear-gradient');
  expect(anime.style.backgroundImage).toContain('rgba(255, 122, 182, 0.33)');
  expect(anime.querySelector('svg')).toBeTruthy(); // the faint tool icon, so the tile never reads as a broken picture
});

test('a shipped thumbnail goes through next/image: content-versioned, sized for the 2-column grid, with its REAL blur', () => {
  const { container } = render(<TemplateGallery label="T" items={items} activeId={null} onPick={jest.fn()} />);
  const img = container.querySelector('img')!;
  const meta = TEMPLATE_THUMB_META['/templates/video/reel.jpg']!;
  expect(meta.v).toMatch(/^[0-9a-f]{10}$/);
  // Resized by the optimizer (AVIF/WebP), never the 600×800 original; the URL carries the file's version.
  expect(optimizedPath(img.getAttribute('src'))).toBe(`/templates/video/reel.jpg?v=${meta.v}`);
  expect(img.getAttribute('sizes')).toBe(TEMPLATE_CARD_SIZES);
  // Small candidates exist for a ~130 px desktop card (a bare `50vw` in `sizes` would have dropped everything < 384).
  expect(img.getAttribute('srcset')).toMatch(/&w=256&q=75 256w/);
  // Fills the card's own 3:4 box: absolutely positioned, so a picture arriving never moves the grid.
  expect(img.getAttribute('data-nimg')).toBe('fill');
  expect(img.style.position).toBe('absolute');
  // The placeholder is the generated ≤ 16 px WebP of THIS file — not a flat colour, not a shared stand-in.
  expect(mockImageProps[0]).toMatchObject({ placeholder: 'blur', blurDataURL: meta.blur, alt: '' });
  expect(meta.blur).toMatch(/^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/);
  // The palette sits under the picture too, so a slow or failed load shows the tile, never a hole.
  expect((container.querySelector('[data-template="reel"]') as HTMLElement).style.backgroundImage).toContain('linear-gradient');
});

test('the first row (on screen whenever a gallery mounts) loads with priority; every later card is lazy', () => {
  const { container } = renderCards([
    card('a', '/templates/video/reel.jpg'), card('b', '/templates/video/trailer.jpg'),
    card('c', '/templates/image/product.jpg'), card('d', '/templates/music/lofi-chill.jpg'),
  ]);
  const imgs = Array.from(container.querySelectorAll('img'));
  expect(imgs.map((i) => i.getAttribute('fetchpriority'))).toEqual(['high', 'high', null, null]);
  expect(imgs.map((i) => i.getAttribute('loading'))).toEqual([null, null, 'lazy', 'lazy']);
});

test('a REMOTE thumb (the twin\'s signed URL) stays a plain <img> — never handed to the /_next/image optimizer', () => {
  const signed = 'https://abc.supabase.co/storage/v1/object/sign/twins/u1/front.jpg?token=t0k3n';
  const { container } = renderCards([card('my-twin', signed)]);
  const img = container.querySelector('img')!;
  expect(img.getAttribute('src')).toBe(signed);
  expect(img.getAttribute('srcset')).toBeNull();
  expect(mockImageProps).toHaveLength(0);
});

test('a shipped file the blur map does not know yet still loads — unversioned and without a blur, never broken', () => {
  const { container } = renderCards([card('fresh', '/templates/video/not-in-the-map.jpg')]);
  expect(optimizedPath(container.querySelector('img')!.getAttribute('src'))).toBe('/templates/video/not-in-the-map.jpg');
  expect(mockImageProps[0]).not.toHaveProperty('placeholder');
  expect(mockImageProps[0]).not.toHaveProperty('blurDataURL');
});

describe('TemplateThumbImage — the lipsync panel\'s 48 px „chosen" face', () => {
  test('a shipped preset goes through the optimizer at 48/96 px — never the 1024² original (~650 KB)', () => {
    const { container } = render(<TemplateThumbImage src="/avatars/preset-4.jpg" size={48} className="h-12 w-12" />);
    const img = container.querySelector('img')!;
    const v = TEMPLATE_THUMB_META['/avatars/preset-4.jpg']!.v;
    expect(optimizedPath(img.getAttribute('src'))).toBe(`/avatars/preset-4.jpg?v=${v}`);
    expect(img.getAttribute('srcset')).toMatch(/&w=48&q=75 1x, .*&w=96&q=75 2x$/);
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('class')).toBe('h-12 w-12');
  });

  test('an upload\'s data: URL and the twin\'s signed URL stay plain <img> (no optimizer, no cache of a private face)', () => {
    for (const src of ['data:image/jpeg;base64,/9j/4AAQSkZJRg==', 'https://abc.supabase.co/storage/v1/object/sign/twins/u1/front.jpg?token=t']) {
      const { container, unmount } = render(<TemplateThumbImage src={src} size={48} />);
      expect(container.querySelector('img')!.getAttribute('src')).toBe(src);
      unmount();
    }
    expect(mockImageProps).toHaveLength(0);
  });
});

test('a card that adds context SAYS SO on its face — „Adds: …" — and in its accessible description', () => {
  const withAdds: TemplateCardItem[] = [
    { ...items[0]!, adds: 'Adds: A vertical reel look with a fast opening hook' },
    items[1]!, // no context → no line
  ];
  const { container } = render(<TemplateGallery label="T" items={withAdds} activeId={null} onPick={jest.fn()} />);
  expect(screen.getByText('Adds: A vertical reel look with a fast opening hook')).toBeTruthy();
  expect(container.querySelectorAll('[data-template-adds]')).toHaveLength(1);
  const reel = screen.getByRole('radio', { name: 'Cinematic Reel' });
  expect(reel.getAttribute('aria-description')).toBe('24s vertical. Adds: A vertical reel look with a fast opening hook');
  expect(reel.getAttribute('title')).toContain('Adds: A vertical reel look');
  expect(screen.getByRole('radio', { name: 'Anime' }).getAttribute('aria-description')).toBe('Anime look');
});

test('the real catalogue: every video/image/music card renders its localised „Adds" line; presenters render none', () => {
  for (const [lang, prefix] of [['ka', 'ამატებს: '], ['en', 'Adds: '], ['ru', 'Добавляет: ']] as const) {
    const cards = [...VIDEO_TEMPLATES, ...IMAGE_TEMPLATES, ...MUSIC_TEMPLATES, ...AVATAR_TEMPLATES].map((tp) => ({
      id: `${tp.tool}-${tp.id}`, label: tp.label[lang], hint: tp.hint[lang], thumb: null, palette: tp.palette,
      adds: templateAddsLine(tp, lang) ?? undefined,
    }));
    const { container, unmount } = render(<TemplateGallery label="T" items={cards} activeId={null} onPick={jest.fn()} />);
    const lines = Array.from(container.querySelectorAll('[data-template-adds]')).map((n) => n.textContent ?? '');
    expect(lines).toHaveLength(VIDEO_TEMPLATES.length + IMAGE_TEMPLATES.length + MUSIC_TEMPLATES.length);
    for (const l of lines) expect(l.startsWith(prefix)).toBe(true);
    for (const tp of AVATAR_TEMPLATES) {
      expect(container.querySelector(`[data-template="avatar-${tp.id}"] [data-template-adds]`)).toBeNull();
    }
    unmount();
  }
});

test('picking a card calls onPick; picking the selected one again is a no-op (it never un-picks the panel)', () => {
  const onPick = jest.fn();
  render(<TemplateGallery label="T" items={items} activeId="reel" onPick={onPick} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Anime' }));
  expect(onPick).toHaveBeenCalledWith('anime');
  fireEvent.click(screen.getByRole('radio', { name: 'Cinematic Reel' }));
  expect(onPick).toHaveBeenCalledTimes(1);
});
