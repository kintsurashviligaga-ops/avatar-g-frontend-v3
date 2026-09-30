/** @jest-environment node */
/**
 * lib/auth/generationGate — the ONE server-side rule for who may start a paid generation.
 *
 * ⚠️ Why this is worth pinning: every paid route derives `userId` from the verified session and the routes that had no
 * session at all used to fall back to the literal string 'anonymous'. A gate that only checked `=== 'anonymous'` would
 * wave through '' (an empty id), '   ' (a whitespace id) or null — each of which is still nobody. And the one switch that
 * re-opens anonymous generation (FILM_ALLOW_ANONYMOUS, for demo deployments) must accept the natural spellings an
 * operator types in a hosting dashboard ('true', 'yes', 'on') while staying OFF for everything else — a flag read as
 * `=== '1'` silently leaves a demo closed; a flag read as "any non-empty value" silently opens production on '0'.
 */
import {
  anonymousGenerationAllowed,
  isAnonymousUser,
  mustSignInToGenerate,
  signInToGenerateBody,
  signInToGenerateMessage,
} from './generationGate';

const ORIGINAL_FLAG = process.env.FILM_ALLOW_ANONYMOUS;

afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.FILM_ALLOW_ANONYMOUS;
  else process.env.FILM_ALLOW_ANONYMOUS = ORIGINAL_FLAG;
});

describe('isAnonymousUser — every shape of "nobody"', () => {
  it.each([
    ['the routes’ anonymous sentinel', 'anonymous'],
    ['an empty id', ''],
    ['a whitespace-only id', '   '],
    ['a tab/newline id', '\t\n'],
    ['null', null],
    ['undefined', undefined],
  ])('%s is anonymous', (_label, id) => {
    expect(isAnonymousUser(id)).toBe(true);
  });

  it('a real session id is not anonymous', () => {
    expect(isAnonymousUser('3f0c1e2a-9b7d-4c8e-a1f2-000000000001')).toBe(false);
  });

  it('the sentinel is matched exactly — a user id that merely CONTAINS the word is a real user', () => {
    expect(isAnonymousUser('anonymous-fan-42')).toBe(false);
    expect(isAnonymousUser('Anonymous')).toBe(false);
  });
});

describe('mustSignInToGenerate — refused unless FILM_ALLOW_ANONYMOUS re-opens it', () => {
  it('refuses every anonymous shape by default (flag unset)', () => {
    delete process.env.FILM_ALLOW_ANONYMOUS;
    for (const id of ['anonymous', '', '   ', null, undefined]) {
      expect(mustSignInToGenerate(id)).toBe(true);
    }
    expect(anonymousGenerationAllowed()).toBe(false);
  });

  it('never refuses a signed-in user, whatever the flag says', () => {
    for (const flag of [undefined, '0', '1']) {
      if (flag === undefined) delete process.env.FILM_ALLOW_ANONYMOUS;
      else process.env.FILM_ALLOW_ANONYMOUS = flag;
      expect(mustSignInToGenerate('user-123')).toBe(false);
    }
  });

  it.each(['1', 'true', 'TRUE', 'yes', 'on', ' On ', ' 1 '])('FILM_ALLOW_ANONYMOUS=%p re-opens anonymous generation', (value) => {
    process.env.FILM_ALLOW_ANONYMOUS = value;
    expect(anonymousGenerationAllowed()).toBe(true);
    expect(mustSignInToGenerate('anonymous')).toBe(false);
    expect(mustSignInToGenerate('')).toBe(false);
    expect(mustSignInToGenerate(null)).toBe(false);
  });

  it.each(['', '0', 'false', 'no', 'off', 'enabled', '2'])('FILM_ALLOW_ANONYMOUS=%p keeps it closed', (value) => {
    // ⚠️ '0' / 'false' must CLOSE the gate: a truthy-string read ("any non-empty value") would open production on '0'.
    process.env.FILM_ALLOW_ANONYMOUS = value;
    expect(anonymousGenerationAllowed()).toBe(false);
    expect(mustSignInToGenerate('anonymous')).toBe(true);
  });
});

describe('the refusal copy — per locale, Georgian by default', () => {
  it('speaks English and Russian when asked', () => {
    expect(signInToGenerateMessage('en')).toBe('Sign in to create — generation needs an account.');
    expect(signInToGenerateMessage('ru')).toBe('Войдите, чтобы создавать — для генерации нужен аккаунт.');
  });

  it('falls back to Georgian (the platform language) for ka, an unknown locale, or none at all', () => {
    const ka = signInToGenerateMessage('ka');
    expect(ka).toMatch(/[Ⴀ-ჿ]/); // Georgian script
    expect(signInToGenerateMessage(undefined)).toBe(ka);
    expect(signInToGenerateMessage(null)).toBe(ka);
    expect(signInToGenerateMessage('fr')).toBe(ka);
    expect(signInToGenerateMessage('')).toBe(ka);
  });

  it('the 401 body carries authRequired so the studio can open the sign-in sheet, plus the localized message', () => {
    expect(signInToGenerateBody('en')).toEqual({
      success: false,
      error: 'auth_required',
      authRequired: true,
      message: 'Sign in to create — generation needs an account.',
    });
    expect(signInToGenerateBody().message).toBe(signInToGenerateMessage('ka'));
    expect(signInToGenerateBody('ru').message).toBe(signInToGenerateMessage('ru'));
  });
});
