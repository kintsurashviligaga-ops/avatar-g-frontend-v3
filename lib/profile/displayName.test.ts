/** Phase 8.25 — display name: validation, honest save (updateUser RETURNS its error), ka/en/ru copy. */
import {
  DISPLAY_NAME_MAX,
  checkDisplayName,
  cleanDisplayName,
  displayNameProblemText,
  saveDisplayName,
  settings825On,
  type UpdateUserClient,
} from './displayName';

const ZWSP = String.fromCharCode(0x200b);
const RLO = String.fromCharCode(0x202e);
const NUL = String.fromCharCode(0);

const fake = (result: Awaited<ReturnType<UpdateUserClient['auth']['updateUser']>> | Error) => {
  const updateUser = jest.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return { client: { auth: { updateUser } } as UpdateUserClient, updateUser };
};

describe('flag', () => {
  test('only the exact string 1 turns it on', () => {
    expect(settings825On('1')).toBe(true);
    for (const v of [undefined, '', '0', 'true', 'on', ' 1']) expect(settings825On(v)).toBe(false);
  });
});

describe('checkDisplayName', () => {
  test('empty and whitespace-only names are refused', () => {
    for (const v of ['', '   ', '\n\t', ZWSP + ZWSP, null, undefined]) expect(checkDisplayName(v)).toEqual({ ok: false, problem: 'empty' });
  });
  test('trims, collapses inner whitespace and strips invisible / bidi / control characters', () => {
    expect(cleanDisplayName(`  გიორგი   ${ZWSP}კ.${RLO}${NUL} `)).toBe('გიორგი კ.');
  });
  test('60 characters pass, 61 do not; an emoji counts as one character', () => {
    expect(checkDisplayName('ა'.repeat(DISPLAY_NAME_MAX)).ok).toBe(true);
    expect(checkDisplayName('ა'.repeat(DISPLAY_NAME_MAX + 1))).toEqual({ ok: false, problem: 'too_long' });
    expect(checkDisplayName('😀'.repeat(DISPLAY_NAME_MAX)).ok).toBe(true);
  });
  test('a 10 000-character paste is refused, not sent', () => {
    expect(checkDisplayName('x'.repeat(10_000))).toEqual({ ok: false, problem: 'too_long' });
  });
});

describe('saveDisplayName', () => {
  test('success saves the cleaned name', async () => {
    const { client, updateUser } = fake({ error: null });
    await expect(saveDisplayName(client, '  ნინო  ')).resolves.toEqual({ ok: true, value: 'ნინო' });
    expect(updateUser).toHaveBeenCalledWith({ data: { name: 'ნინო' } });
  });
  test('an invalid name never reaches Supabase', async () => {
    const { client, updateUser } = fake({ error: null });
    await expect(saveDisplayName(client, '   ')).resolves.toEqual({ ok: false, problem: 'empty' });
    expect(updateUser).not.toHaveBeenCalled();
  });
  test('an expired session is RETURNED by supabase-js (not thrown) and reported as session', async () => {
    const { client } = fake({ error: { name: 'AuthSessionMissingError', message: 'Auth session missing!' } });
    await expect(saveDisplayName(client, 'ნინო')).resolves.toEqual({ ok: false, problem: 'session' });
    const { client: c401 } = fake({ error: { status: 401, message: 'JWT expired' } });
    await expect(saveDisplayName(c401, 'ნინო')).resolves.toEqual({ ok: false, problem: 'session' });
  });
  test('network failures, thrown or returned, are reported as network', async () => {
    await expect(saveDisplayName(fake({ error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' } }).client, 'a')).resolves.toEqual({ ok: false, problem: 'network' });
    await expect(saveDisplayName(fake(new TypeError('Failed to fetch')).client, 'a')).resolves.toEqual({ ok: false, problem: 'network' });
  });
  test('any other returned error is failed', async () => {
    await expect(saveDisplayName(fake({ error: { status: 422, message: 'bad payload' } }).client, 'a')).resolves.toEqual({ ok: false, problem: 'failed' });
  });
});

test('every problem has Georgian, English and Russian copy, Georgian by default', () => {
  for (const p of ['empty', 'too_long', 'session', 'network', 'failed'] as const) {
    expect(displayNameProblemText(p, 'ka')).toMatch(/[ა-ჿ]/u);
    expect(displayNameProblemText(p, 'ru')).toMatch(/[Ѐ-ӿ]/u);
    expect(displayNameProblemText(p, 'en')).toMatch(/[a-z]/);
    expect(displayNameProblemText(p, undefined)).toBe(displayNameProblemText(p, 'ka'));
  }
});
