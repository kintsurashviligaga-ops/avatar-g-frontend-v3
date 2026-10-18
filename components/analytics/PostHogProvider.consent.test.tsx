/* eslint-disable @typescript-eslint/no-require-imports -- jest.isolateModules needs a fresh require per case */
/**
 * Production 2026-10-16: an anonymous first visit with no cookie choice called us.i.posthog.com/flags, because PostHog
 * initialised at module load. The banner promises analytics only with consent; PostHog now starts only after "all".
 */
const init = jest.fn();
const optIn = jest.fn();
const optOut = jest.fn();
const capture = jest.fn();
const fakePosthog: Record<string, unknown> = { __loaded: false, init, opt_in_capturing: optIn, opt_out_capturing: optOut, capture, identify: jest.fn() };
init.mockImplementation(() => { fakePosthog.__loaded = true; });

jest.mock('posthog-js', () => ({ __esModule: true, default: fakePosthog }));
jest.mock('posthog-js/react', () => ({ PostHogProvider: ({ children }: { children: unknown }) => children, usePostHog: () => fakePosthog }));
jest.mock('next/navigation', () => ({ usePathname: () => '/ka', useSearchParams: () => new URLSearchParams() }));

function load() {
  let mod: typeof import('./PostHogProvider') | undefined;
  jest.isolateModules(() => { mod = require('./PostHogProvider'); });
  return mod!;
}

describe('PostHog waits for analytics consent', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test';
    localStorage.clear();
    fakePosthog.__loaded = false;
    jest.clearAllMocks();
  });

  it('does not start without a stored choice', () => {
    load();
    expect(init).not.toHaveBeenCalled();
  });

  it('does not start on "necessary only"', () => {
    localStorage.setItem('myavatar-cookie-consent', 'necessary');
    load();
    expect(init).not.toHaveBeenCalled();
  });

  it('starts on a stored "all"', () => {
    localStorage.setItem('myavatar-cookie-consent', 'all');
    load();
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('starts when the visitor accepts, and stops capturing when they later choose necessary', () => {
    const { applyAnalyticsConsent, analytics } = load();
    const { saveConsent } = require('../../lib/analytics/consent');
    saveConsent('all');
    applyAnalyticsConsent(true);
    expect(init).toHaveBeenCalledTimes(1);
    analytics.auth('login');
    expect(capture).toHaveBeenCalledWith('user_login', undefined);

    saveConsent('necessary');
    applyAnalyticsConsent(false);
    expect(optOut).toHaveBeenCalled();
    capture.mockClear();
    analytics.auth('logout');
    expect(capture).not.toHaveBeenCalled();
  });
});
