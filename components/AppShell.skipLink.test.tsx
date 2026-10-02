/**
 * @jest-environment jsdom
 *
 * "Skip to main content" (AppShell) — the first Tab stop of every page, in the page's language:
 *  · it is the first focusable element, ahead of everything the page renders;
 *  · it lands on the page's own main region when one is marked (the studio's session column, past the sidebar; the
 *    landing's headline), else on <main id="main-content">;
 *  · it never writes "#main-content" into the address bar (the studio reads the hash to pick its surface);
 *  · the target is focusable only for the jump — a permanently focusable region would steal every click into it.
 */
import { fireEvent, render, screen } from '@testing-library/react';

let mockPath = '/en/dashboard';
jest.mock('next/navigation', () => ({ usePathname: () => mockPath }));
jest.mock('./ui/PageEnvironment', () => ({ PageEnvironment: () => null }));
jest.mock('./CookieConsent', () => ({ __esModule: true, default: () => null }));
jest.mock('./presence/PresenceHeartbeat', () => ({ __esModule: true, default: () => null }));
jest.mock('./ClientErrorBoundary', () => ({ ClientErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { AppShell } from './AppShell';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }),
  });
});

function Studio() {
  return (
    <div>
      <aside><button type="button">New session</button><button type="button">Video</button></aside>
      <div id="studio-main" data-skip-target="">
        <textarea aria-label="prompt" />
      </div>
    </div>
  );
}

describe('the skip link', () => {
  it.each([
    ['/en/dashboard', 'Skip to main content'],
    ['/ka/dashboard', 'მთავარ შინაარსზე გადასვლა'],
    ['/ru/landing', 'Перейти к основному содержимому'],
    ['/', 'მთავარ შინაარსზე გადასვლა'],
  ])('is the first focusable element on %s, in the page language', (path, label) => {
    mockPath = path;
    const { container } = render(<AppShell><Studio /></AppShell>);
    const first = container.querySelector<HTMLElement>(FOCUSABLE)!;
    expect(first).toBe(screen.getByTestId('skip-link'));
    expect(first.textContent).toBe(label);
    expect(first.getAttribute('href')).toBe('#main-content');
  });

  it("lands on the page's marked main region (past the sidebar), without touching the address bar", () => {
    mockPath = '/en/dashboard';
    window.location.hash = '';
    render(<AppShell><Studio /></AppShell>);
    const target = document.getElementById('studio-main')!;
    expect(target.hasAttribute('tabindex')).toBe(false); // not focusable until the jump
    fireEvent.click(screen.getByTestId('skip-link'));
    expect(document.activeElement).toBe(target);
    expect(target.closest('main')?.id).toBe('main-content');
    expect(window.location.hash).toBe('');
    // Handed back on blur: the region does not keep stealing clicks.
    (screen.getByLabelText('prompt') as HTMLElement).focus();
    expect(target.hasAttribute('tabindex')).toBe(false);
  });

  it('without a marked region it lands on <main id="main-content">', () => {
    mockPath = '/en/terms';
    render(<AppShell><p>Terms</p></AppShell>);
    fireEvent.click(screen.getByTestId('skip-link'));
    expect(document.activeElement?.id).toBe('main-content');
    expect(document.activeElement?.tagName).toBe('MAIN');
  });

  it('the studio and the landing mark their main regions; the landing no longer nests a second <main>', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { join } = require('node:path') as typeof import('node:path');
    /** Source without comments, so a note that NAMES a <main> does not count as one. */
    const code = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const chrome = code(readFileSync(join(__dirname, 'studio', 'ChatChrome.tsx'), 'utf8'));
    const landing = code(readFileSync(join(__dirname, 'landing', 'Landing.tsx'), 'utf8'));
    expect(chrome).toContain('<div id="studio-main" data-skip-target=""');
    expect(chrome.match(/data-skip-target/g)).toHaveLength(1);
    expect(landing).toContain('id="landing-main" data-skip-target=""');
    expect(landing).not.toMatch(/<main[\s>]/);
  });

  it('is readable when it shows: ink on the accent, a 44 px target', () => {
    mockPath = '/en/dashboard';
    render(<AppShell><Studio /></AppShell>);
    const cls = screen.getByTestId('skip-link').className;
    expect(cls).toContain('sr-only');
    expect(cls).toContain('focus:not-sr-only');
    expect(cls).toContain('focus:text-app-bg');
    expect(cls).toContain('focus:bg-app-accent');
    expect(cls).toContain('focus:min-h-[44px]');
  });
});
