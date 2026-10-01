/** @jest-environment node */
import { frontDoor, hasSessionCookie, isStudioPath } from './landing';

describe('front doors (docs/DESIGN.md §9)', () => {
  test('`/`: guests → the chat in their language; signed in → the dashboard, as before', () => {
    expect(frontDoor('/', false, 'ka')).toEqual({ redirect: '/ka' });
    expect(frontDoor('/', false, 'en')).toEqual({ redirect: '/en' });
    expect(frontDoor('/', true, 'ru')).toEqual({ redirect: '/ru/dashboard' });
    expect(frontDoor('/', false, 'xx')).toEqual({ redirect: '/ka' });
  });
  test('`/{lang}`: guests get the studio (it opens on the chat); signed in → the dashboard', () => {
    expect(frontDoor('/ka', false, 'ka')).toEqual({ render: 'studio' });
    expect(frontDoor('/en/', false, 'ka')).toEqual({ render: 'studio' });
    expect(frontDoor('/ru', true, 'ka')).toEqual({ redirect: '/ru/dashboard' });
  });
  test('/{lang}/landing renders the marketing landing for everyone (no redirect loop to the chat)', () => {
    expect(frontDoor('/ka/landing', false, 'ka')).toEqual({ render: 'landing' });
    expect(frontDoor('/en/landing', true, 'ka')).toEqual({ render: 'landing' });
  });
  test('every other path is not a front door — the dashboard and friends are untouched', () => {
    for (const p of ['/ka/dashboard', '/ka/pricing', '/ka/chat', '/ka/agent', '/ka/services/video', '/ka/studio', '/pricing', '/xx']) {
      expect(frontDoor(p, false, 'ka')).toBeNull();
      expect(frontDoor(p, true, 'ka')).toBeNull();
    }
  });
});

describe('session cookie presence (routing only, not security)', () => {
  test('recognises the Supabase SSR cookie, chunked or not', () => {
    expect(hasSessionCookie([{ name: 'sb-zwksnayknzggdcenqqxy-auth-token', value: 'base64-…' }])).toBe(true);
    expect(hasSessionCookie([{ name: 'sb-zwksnayknzggdcenqqxy-auth-token.0', value: 'x' }])).toBe(true);
  });
  test('ignores other cookies and empty values', () => {
    expect(hasSessionCookie([{ name: 'NEXT_LOCALE', value: 'ka' }, { name: 'sb-abc-auth-token', value: '' }])).toBe(false);
    expect(hasSessionCookie([{ name: 'sb-abc-auth-token-code-verifier', value: 'x' }])).toBe(false);
  });
});

describe('isStudioPath — where the studio is mounted', () => {
  test('the dashboard and, since the chat took it, the home page', () => {
    for (const p of ['/ka', '/en/', '/ru', '/ka/dashboard', '/en/dashboard/', '/ka/dashboard?tool=video']) expect(isStudioPath(p)).toBe(true);
  });
  test('everything else navigates', () => {
    for (const p of ['/', '/ka/landing', '/ka/library', '/ka/pricing', '/xx', '', null, undefined]) expect(isStudioPath(p)).toBe(false);
  });
});
