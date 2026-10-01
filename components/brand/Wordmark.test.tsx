/**
 * The wordmark as the 2026-09-29 brand sheet sets it: "MyAvatar" + ".ge" (cyan), Montserrat, optional
 * letter-spaced tagline — and never allowed to shrink, which is how it used to be cut to "MyAvata".
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { Wordmark } from './Wordmark';

describe('Wordmark', () => {
  test('reads as one name to assistive tech, with ".ge" as its own accent span', () => {
    render(<Wordmark />);
    const mark = screen.getByRole('img', { name: 'MyAvatar.ge' });
    expect(mark.textContent).toBe('MyAvatar.ge');
    const ge = [...mark.querySelectorAll('span')].find((s) => s.textContent === '.ge')!;
    expect(ge.className).toContain('text-app-accent');
  });

  test('set in the display face, bold', () => {
    render(<Wordmark />);
    const name = screen.getByRole('img', { name: 'MyAvatar.ge' }).firstElementChild!;
    expect(name.className).toContain('font-display');
    expect(name.className).toContain('font-bold');
  });

  test('never shrinks or wraps — the "MyAvata" bug was a flex child allowed to', () => {
    render(<Wordmark size="sm" />);
    const cls = screen.getByRole('img', { name: 'MyAvatar.ge' }).className;
    expect(cls).toContain('shrink-0');
    expect(cls).toContain('whitespace-nowrap');
    expect(cls).not.toMatch(/\btruncate\b/);
  });

  test('the tagline is opt-in', () => {
    const { rerender } = render(<Wordmark />);
    expect(screen.getByRole('img', { name: 'MyAvatar.ge' }).textContent).not.toContain('AI Creative Studio');
    rerender(<Wordmark tagline />);
    expect(screen.getByRole('img', { name: 'MyAvatar.ge' }).textContent).toContain('AI Creative Studio');
  });

  test('`mark` puts the transparent rocket inside the one lockup — decorative, never a second name', () => {
    const { rerender } = render(<Wordmark />);
    expect(screen.queryByTestId('rocket-mark')).toBeNull();
    rerender(<Wordmark mark />);
    const lockup = screen.getByRole('img', { name: 'MyAvatar.ge' });
    const img = screen.getByTestId('rocket-mark') as HTMLImageElement;
    expect(lockup.contains(img)).toBe(true);
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('src')).toBe('/brand/rocket-mark.png');
    expect(lockup.querySelector('source')?.getAttribute('srcset')).toBe('/brand/rocket-mark.webp');
    expect(screen.getAllByRole('img', { name: 'MyAvatar.ge' })).toHaveLength(1);
  });

  test('the rocket mark files are real cut-outs: PNG with an alpha channel (colour type 6), WebP present', () => {
    const png = readFileSync(join(process.cwd(), 'public/brand/rocket-mark.png'));
    expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(png[25]).toBe(6); // IHDR colour type 6 = truecolour + alpha (the old rocket rasters were type 2: no alpha)
    expect(readFileSync(join(process.cwd(), 'public/brand/rocket-mark.webp')).subarray(8, 12).toString('latin1')).toBe('WEBP');
  });

  test('onDark keeps a light name and the rocket blue whatever the theme', () => {
    render(<Wordmark tone="onDark" />);
    const mark = screen.getByRole('img', { name: 'MyAvatar.ge' });
    const ge = [...mark.querySelectorAll('span')].find((s) => s.textContent === '.ge')!;
    expect(ge.className).toContain('text-[#338FE8]');
    expect(mark.innerHTML).not.toContain('var(--color-text)');
  });
});

describe('the brand tokens the wordmark relies on', () => {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
  const tw = readFileSync(join(process.cwd(), 'tailwind.config.ts'), 'utf8');

  test('the four sheet colours exist as tokens', () => {
    expect(css).toContain('--brand-primary: 51 143 232;'); // #338FE8 — the rocket blue (docs/DESIGN.md §13)
    expect(css).toContain('--brand-lime: 197 255 0;'); // #C5FF00
    expect(css).toContain('--brand-gold: 212 175 55;'); // #D4AF37
    expect(css).toContain('--brand-ink: 0 0 0;'); // true black
    expect(tw).toContain("lime: 'rgb(var(--brand-lime) / <alpha-value>)'");
  });

  test('dark accent is the rocket blue on true black; the light theme uses the rocket body blue (readable on white)', () => {
    const dark = css.slice(css.indexOf(":root,\n[data-theme='dark']"), css.indexOf("[data-theme='light'] {"));
    const light = css.slice(css.indexOf("[data-theme='light'] {"));
    expect(dark).toContain('--app-accent: 51 143 232;');
    expect(dark).toContain('--app-bg: 0 0 0;');
    expect(light).toContain('--app-accent: 24 115 202;');
  });

  test('display = Montserrat, text = Inter; no stack names a family next/font renamed', () => {
    const layout = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8');
    expect(layout).toMatch(/Montserrat\(\{[^}]*variable: "--font-display"/s);
    expect(layout).not.toMatch(/\bSyne\(|DM_Sans\(/);
    expect(css).not.toMatch(/font-family:\s*'Inter'/);
  });
});
