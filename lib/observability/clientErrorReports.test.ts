/** @jest-environment node */
import { CLIENT_REPORTS_MAX, clientReportsEnabled, installClientErrorReports, type ReportTarget } from './clientErrorReports';

function fakeTarget() {
  const handlers: Record<string, Array<(ev: unknown) => void>> = { error: [], unhandledrejection: [] };
  const beacons: Array<{ url: string; body: Record<string, unknown> }> = [];
  const target: ReportTarget = {
    addEventListener: (t, fn) => { handlers[t]!.push(fn); },
    removeEventListener: (t, fn) => { handlers[t] = handlers[t]!.filter((f) => f !== fn); },
    location: { pathname: '/ka/studio' },
    navigator: { userAgent: 'jest', sendBeacon: (url, body) => { beacons.push({ url, body: JSON.parse(body) }); return true; } },
  };
  const fire = (t: 'error' | 'unhandledrejection', ev: unknown) => handlers[t]!.forEach((f) => f(ev));
  return { target, fire, beacons, handlers };
}

test('off unless the flag is exactly 1', () => {
  expect(clientReportsEnabled(undefined)).toBe(false);
  expect(clientReportsEnabled('true')).toBe(false);
  expect(clientReportsEnabled('1')).toBe(true);
});

test('an unhandled rejection and an uncaught error reach /api/log-error with the path only', () => {
  const w = fakeTarget();
  installClientErrorReports(w.target, () => 0);
  w.fire('unhandledrejection', { reason: new TypeError('x is undefined') });
  w.fire('error', { error: new Error('boom'), message: 'boom' });
  expect(w.beacons.map((b) => b.url)).toEqual(['/api/log-error', '/api/log-error']);
  expect(w.beacons[0]!.body).toMatchObject({ message: 'unhandledrejection: TypeError: x is undefined', url: '/ka/studio' });
  expect(w.beacons[1]!.body.message).toBe('error: Error: boom');
});

test('the same message once, browser noise never, and at most a few per page', () => {
  const w = fakeTarget();
  installClientErrorReports(w.target);
  for (let i = 0; i < 3; i++) w.fire('unhandledrejection', { reason: new Error('same') });
  w.fire('error', { message: 'ResizeObserver loop limit exceeded' });
  w.fire('unhandledrejection', { reason: new DOMException('The user aborted a request.', 'AbortError') });
  expect(w.beacons).toHaveLength(1);
  for (let i = 0; i < 20; i++) w.fire('unhandledrejection', { reason: new Error(`e${i}`) });
  expect(w.beacons).toHaveLength(CLIENT_REPORTS_MAX);
});

test('a listener that cannot send, or an odd event, never throws; stopping removes the listeners', () => {
  const w = fakeTarget();
  w.target.navigator = { sendBeacon: () => { throw new Error('blocked'); } };
  const stop = installClientErrorReports(w.target);
  expect(() => { w.fire('unhandledrejection', null); w.fire('error', { error: { circular: 1 } }); w.fire('unhandledrejection', { reason: new Error('x') }); }).not.toThrow();
  stop();
  expect(w.handlers.error).toHaveLength(0);
  expect(w.handlers.unhandledrejection).toHaveLength(0);
});
