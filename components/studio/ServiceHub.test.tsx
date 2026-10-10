// An old link to a retired surface (#film, #lipsync, #hub) opens the studio on the tool that does that job, whether
// or not the studio is already mounted when the shell reads the hash. On a production build its chunk is often ready
// at hydration, so it mounts WITH the shell and its effects run first: it has already read `?tool=` by then, and
// `#film` used to land on the chat (Playwright, simplified-studio.spec on `next start`, 2026-10-10).

import { render, act } from '@testing-library/react';

let mockStudioListens = true;
const mockHeard: unknown[] = [];
jest.mock('next/dynamic', () => {
  const React = jest.requireActual('react');
  // A stand-in for OmniStudio: when „mounted", it answers `omni:set-tool` by cancelling it, like the real one.
  function Studio() {
    React.useEffect(() => {
      if (!mockStudioListens) return undefined;
      const on = (e: Event) => { mockHeard.push((e as CustomEvent).detail); e.preventDefault(); };
      window.addEventListener('omni:set-tool', on);
      return () => window.removeEventListener('omni:set-tool', on);
    }, []);
    return null;
  }
  let n = 0;
  return () => { n += 1; return n === 1 ? Studio : () => null; };
});
jest.mock('./ChatChrome', () => ({ ChatChrome: ({ children }: { children: unknown }) => children }));
jest.mock('../ErrorBoundary', () => ({ __esModule: true, default: ({ children }: { children: unknown }) => children }));
import { ServiceHub } from './ServiceHub';

const at = (path: string) => window.history.replaceState(null, '', path);
const here = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;

beforeEach(() => {
  mockHeard.length = 0;
  mockStudioListens = true;
});

describe('ServiceHub: the retired addresses', () => {
  it.each([['film', 'video'], ['lipsync', 'avatar']])('#%s on first load, studio already mounted: switched in place to %s, nothing left in the address', (hash, tool) => {
    at(`/en/dashboard#${hash}`);
    const { unmount } = render(<ServiceHub locale="en" />);
    expect(mockHeard).toEqual([tool]);
    expect(here()).toBe('/en/dashboard');
    unmount();
  });

  it('#film on first load while the studio is still loading: the tool waits in the address for its mount', () => {
    mockStudioListens = false;
    at('/en/dashboard#film');
    const { unmount } = render(<ServiceHub locale="en" />);
    expect(here()).toBe('/en/dashboard?tool=video');
    unmount();
  });

  it('#hub goes to the chat, which the studio opens on anyway: no ?tool= either way', () => {
    mockStudioListens = false;
    at('/en/dashboard#hub');
    const { unmount } = render(<ServiceHub locale="en" />);
    expect(here()).toBe('/en/dashboard');
    unmount();
  });

  it('a later #lipsync (a hash change on the open studio) switches it in place', () => {
    at('/en/dashboard');
    const { unmount } = render(<ServiceHub locale="en" />);
    expect(mockHeard).toEqual([]);
    act(() => {
      at('/en/dashboard#lipsync');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(mockHeard).toEqual(['avatar']);
    expect(here()).toBe('/en/dashboard');
    unmount();
  });
});
