/**
 * @jest-environment jsdom
 *
 * AppShell — a new deploy's service worker taking over the tab must not reload it under the user's hands.
 *
 * ⚠️ 2026-10-16: Production b53c2df landed while the Video panel was being filled for a paid ad test; AppShell's
 * controllerchange handler reloaded at once and the panel was gone. With a typed prompt on the page the takeover now
 * waits, and the reload runs when the tab is hidden with nothing in progress (lib/pwa/updateReload).
 *
 * jsdom cannot navigate: location.reload() reports "Not implemented: navigation" to the console, which is how a reload
 * is seen here.
 */
import { render } from '@testing-library/react';

jest.mock('next/navigation', () => ({ usePathname: () => '/en/dashboard' }));
jest.mock('./ui/PageEnvironment', () => ({ PageEnvironment: () => null }));
jest.mock('./CookieConsent', () => ({ __esModule: true, default: () => null }));
jest.mock('./presence/PresenceHeartbeat', () => ({ __esModule: true, default: () => null }));
jest.mock('./ClientErrorBoundary', () => ({ ClientErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import { AppShell } from './AppShell';

const env = process.env as Record<string, string | undefined>;
const realNodeEnv = env.NODE_ENV;
let takeover: (() => void) | null = null;
let visibility: DocumentVisibilityState = 'visible';
let consoleError: jest.SpyInstance;

const reloads = () => consoleError.mock.calls.filter((c) => String(c[0]?.message ?? c[0]).includes('navigation')).length;

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }),
  });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  // A returning visitor: the previous deploy's worker controls this tab.
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller: {},
      addEventListener: (type: string, fn: () => void) => { if (type === 'controllerchange') takeover = fn; },
      register: () => Promise.resolve({ update: () => Promise.resolve() }),
    },
  });
});
beforeEach(() => {
  env.NODE_ENV = 'production';
  takeover = null;
  visibility = 'visible';
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  env.NODE_ENV = realNodeEnv;
  consoleError.mockRestore();
});

it('a half-filled Video panel keeps the tab until it is hidden with nothing typed', () => {
  const { getByLabelText } = render(<AppShell><textarea aria-label="Video prompt" defaultValue="A presenter on a black stage" /></AppShell>);
  expect(takeover).not.toBeNull();
  takeover!();
  expect(reloads()).toBe(0);

  (getByLabelText('Video prompt') as HTMLTextAreaElement).value = '';
  visibility = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  expect(reloads()).toBe(1);
});

it('an idle tab still swaps onto the new deploy at once', () => {
  render(<AppShell><textarea aria-label="Video prompt" /></AppShell>);
  takeover!();
  expect(reloads()).toBe(1);
});
