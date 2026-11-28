/**
 * lib/profile/displayName.ts — Phase 8.25: the display name a person types in "Edit profile", checked and saved honestly.
 *
 * ⚠️ THE OLD SAVE COULD NOT FAIL. supabase-js `auth.updateUser` does not throw: it RETURNS `{ error }`. The dialog awaited
 * it inside try/catch, so an expired session (AuthSessionMissingError), a network drop or a rejected payload all looked
 * like success: the dialog closed and the header showed the new name, which was never stored. `saveDisplayName` reads the
 * returned error and says which one it was, so the dialog stays open with a sentence the person can act on.
 *
 * Rules for the name: trimmed; inner whitespace runs collapsed to one space; control and zero-width characters removed
 * (they break the header and can hide text); 1..60 characters after that. An empty or whitespace-only name is refused:
 * the field's placeholder (the e-mail) is what shows when no name is set, so "clear my name" is not a save.
 *
 * Client-safe (no server imports). Used by ChatChrome only while NEXT_PUBLIC_SETTINGS_825=1 (flag off by default).
 */

export const DISPLAY_NAME_MAX = 60;

type Lang = 'ka' | 'en' | 'ru';
const lang = (l: string | null | undefined): Lang => (l === 'en' || l === 'ru' ? l : 'ka');

export type DisplayNameProblem = 'empty' | 'too_long';
export type SaveProblem = DisplayNameProblem | 'session' | 'network' | 'failed';

/** Exact '1' turns it on (the project's flag vocabulary for new launch flags). Read literally so Next inlines it. */
export function settings825On(raw: string | undefined = process.env.NEXT_PUBLIC_SETTINGS_825): boolean {
  return raw === '1';
}

// C0/C1 controls, zero-width space/joiners, word joiner, BOM, bidi overrides/isolates.
// eslint-disable-next-line no-control-regex
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/gu;

export function cleanDisplayName(raw: unknown): string {
  return String(raw ?? '')
    .replace(INVISIBLE, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function checkDisplayName(raw: unknown): { ok: true; value: string } | { ok: false; problem: DisplayNameProblem } {
  const value = cleanDisplayName(raw);
  if (!value) return { ok: false, problem: 'empty' };
  // Count code points, not UTF-16 units, so an emoji is one character like the input's own counter.
  if ([...value].length > DISPLAY_NAME_MAX) return { ok: false, problem: 'too_long' };
  return { ok: true, value };
}

/** The slice of the Supabase browser client this needs (so tests can pass a fake). */
export interface UpdateUserClient {
  auth: { updateUser: (attrs: { data: Record<string, unknown> }) => Promise<{ error: { name?: string; status?: number; message?: string } | null }> };
}

function problemOf(error: { name?: string; status?: number; message?: string }): SaveProblem {
  const name = String(error.name ?? '');
  const msg = String(error.message ?? '').toLowerCase();
  if (name === 'AuthSessionMissingError' || error.status === 401 || error.status === 403 || /session|jwt|expired|not authenticated/.test(msg)) return 'session';
  if (name === 'AuthRetryableFetchError' || /fetch|network/.test(msg)) return 'network';
  return 'failed';
}

export async function saveDisplayName(client: UpdateUserClient, raw: unknown): Promise<{ ok: true; value: string } | { ok: false; problem: SaveProblem }> {
  const checked = checkDisplayName(raw);
  if (!checked.ok) return checked;
  try {
    const { error } = await client.auth.updateUser({ data: { name: checked.value } });
    if (error) return { ok: false, problem: problemOf(error) };
    return { ok: true, value: checked.value };
  } catch {
    return { ok: false, problem: 'network' };
  }
}

const COPY: Record<Lang, Record<SaveProblem, string>> = {
  ka: {
    empty: 'სახელი ცარიელია. ჩაწერე ერთი სიმბოლო მაინც.',
    too_long: `სახელი ძალიან გრძელია. მაქსიმუმ ${DISPLAY_NAME_MAX} სიმბოლო.`,
    session: 'სესიას ვადა გაუვიდა. შედი თავიდან და შემდეგ შეინახე.',
    network: 'კავშირი გაწყდა, სახელი ვერ შევინახეთ. შეამოწმე ინტერნეტი და სცადე თავიდან.',
    failed: 'სახელი ვერ შევინახეთ. სცადე ცოტა ხანში.',
  },
  en: {
    empty: 'The name is empty. Type at least one character.',
    too_long: `The name is too long. ${DISPLAY_NAME_MAX} characters at most.`,
    session: 'Your session expired. Sign in again, then save.',
    network: 'The connection dropped and the name was not saved. Check your internet and try again.',
    failed: 'The name could not be saved. Please try again shortly.',
  },
  ru: {
    empty: 'Имя пустое. Введите хотя бы один символ.',
    too_long: `Имя слишком длинное. Не больше ${DISPLAY_NAME_MAX} символов.`,
    session: 'Сессия истекла. Войдите снова и сохраните.',
    network: 'Соединение прервалось, имя не сохранено. Проверьте интернет и попробуйте снова.',
    failed: 'Не удалось сохранить имя. Попробуйте чуть позже.',
  },
};

export function displayNameProblemText(problem: SaveProblem, locale: string | null | undefined): string {
  return COPY[lang(locale)][problem];
}
