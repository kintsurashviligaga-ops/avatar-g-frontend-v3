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

  test('onDark keeps a light name and the brand cyan whatever the theme', () => {
    render(<Wordmark tone="onDark" />);
    const mark = screen.getByRole('img', { name: 'MyAvatar.ge' });
    const ge = [...mark.querySelectorAll('span')].find((s) => s.textContent === '.ge')!;
    expect(ge.className).toContain('text-[#00E5FF]');
    expect(mark.innerHTML).not.toContain('var(--color-text)');
  });
});

describe('the brand tokens the wordmark relies on', () => {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');
  const tw = readFileSync(join(process.cwd(), 'tailwind.config.ts'), 'utf8');

  test('the four sheet colours exist as tokens', () => {
    expect(css).toContain('--brand-primary: 0 229 255;'); // #00E5FF
    expect(css).toContain('--brand-lime: 197 255 0;'); // #C5FF00
    expect(css).toContain('--brand-gold: 212 175 55;'); // #D4AF37
    expect(css).toContain('--brand-ink: 10 10 10;'); // #0A0A0A
    expect(tw).toContain("lime: 'rgb(var(--brand-lime) / <alpha-value>)'");
  });

  test('dark accent is the brand cyan; the light theme keeps a readable cyan-600', () => {
    const dark = css.slice(css.indexOf(":root,\n[data-theme='dark']"), css.indexOf("[data-theme='light'] {"));
    const light = css.slice(css.indexOf("[data-theme='light'] {"));
    expect(dark).toContain('--app-accent: 0 229 255;');
    expect(light).toContain('--app-accent: 8 145 178;');
  });

  test('display = Montserrat, text = Inter; no stack names a family next/font renamed', () => {
    const layout = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8');
    expect(layout).toMatch(/Montserrat\(\{[^}]*variable: "--font-display"/s);
    expect(layout).not.toMatch(/\bSyne\(|DM_Sans\(/);
    expect(css).not.toMatch(/font-family:\s*'Inter'/);
  });
});
