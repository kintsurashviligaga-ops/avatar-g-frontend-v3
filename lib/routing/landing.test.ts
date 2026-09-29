/** @jest-environment node */
import { frontDoor, hasSessionCookie } from './landing';

describe('front doors (docs/DESIGN.md §9)', () => {
  test('`/`: guests → the landing in their language; signed in → the dashboard, as before', () => {
    expect(frontDoor('/', false, 'ka')).toEqual({ redirect: '/ka' });
    expect(frontDoor('/', false, 'en')).toEqual({ redirect: '/en' });
    expect(frontDoor('/', true, 'ru')).toEqual({ redirect: '/ru/dashboard' });
    expect(frontDoor('/', false, 'xx')).toEqual({ redirect: '/ka' });
  });
  test('`/{lang}`: guests see the landing; signed in → the dashboard', () => {
    expect(frontDoor('/ka', false, 'ka')).toEqual({ render: 'landing' });
    expect(frontDoor('/en/', false, 'ka')).toEqual({ render: 'landing' });
    expect(frontDoor('/ru', true, 'ka')).toEqual({ redirect: '/ru/dashboard' });
  });
  test('the retired /{lang}/landing → /{lang}', () => {
    expect(frontDoor('/ka/landing', false, 'ka')).toEqual({ redirect: '/ka' });
    expect(frontDoor('/en/landing', true, 'ka')).toEqual({ redirect: '/en' });
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
