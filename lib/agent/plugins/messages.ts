/**
 * lib/agent/plugins/messages.ts — what the plugins say. Two audiences:
 *   · the MODEL (English, plus a `next` telling it what to tell the user in the user's language), and
 *   · the USER (ka · en · ru): status words and the message for each OAuth return reason. Isomorphic: no server imports.
 */
export type Lang = 'ka' | 'en' | 'ru';
type PluginKey = 'notion' | 'github' | 'calendar';

const NAME: Record<PluginKey, string> = { notion: 'Notion', github: 'GitHub', calendar: 'The calendar' };

export function pluginToolMessage(p: PluginKey, reason: string): string {
  const n = NAME[p];
  switch (reason) {
    case 'not_connected': return `${n} is not connected, or the connection expired.`;
    case 'not_found': return `${n} has no such item, or it was not shared with MyAvatar.`;
    case 'forbidden': return `${n} refused: MyAvatar has no access to that item.`;
    case 'rate_limited': return `${n} asked us to slow down.`;
    case 'bad_input': return 'That input is not valid.';
    case 'bad_time_zone': return 'That is not a known time zone (use an IANA name like Asia/Tbilisi).';
    case 'bad_time': return 'That time does not exist in that time zone (or is malformed).';
    case 'in_the_past': return 'That time is already in the past.';
    default: return `${n} did not answer.`;
  }
}

export function pluginToolNext(p: PluginKey, reason: string): string {
  if (reason === 'not_connected') return `Tell the user, in their language, that ${NAME[p]} is not connected and that they can connect it with the Connectors button next to "+". Do not guess its content.`;
  if (reason === 'empty' && p === 'notion') return 'No pages are shared with MyAvatar. Tell the user to share a page with the MyAvatar integration in Notion (••• → Connections), then ask again.';
  if (reason === 'not_found' || reason === 'forbidden') return p === 'notion'
    ? 'Ask the user to share that page with the MyAvatar integration in Notion (••• → Connections), or call notion_search for an id.'
    : 'Check the owner/name and path (github_list_repos lists what the user can see). Do not guess file contents.';
  if (reason === 'bad_time_zone' || reason === 'bad_time' || reason === 'in_the_past' || reason === 'bad_input') return 'Ask the user for the exact date, time and time zone, then try again.';
  if (reason === 'rate_limited') return 'Say plainly that it is busy and offer to try again in a minute.';
  return `Say plainly that ${NAME[p]} did not answer and offer to try again later. Do not invent a result.`;
}

export type PluginStatus = 'ready' | 'partial' | 'not_connected' | 'needs_setup' | 'blocked_external' | 'off';

export const STATUS_WORD: Record<Lang, Record<PluginStatus, string>> = {
  ka: { ready: 'მუშაობს', partial: 'ნაწილობრივ', not_connected: 'არ არის დაკავშირებული', needs_setup: 'საჭიროებს გამართვას', blocked_external: 'ელოდება გარე ნებართვას', off: 'გამორთულია' },
  en: { ready: 'Working', partial: 'Partly', not_connected: 'Not connected', needs_setup: 'Needs setup', blocked_external: 'Waiting on approval', off: 'Off' },
  ru: { ready: 'Работает', partial: 'Частично', not_connected: 'Не подключено', needs_setup: 'Требует настройки', blocked_external: 'Ждёт одобрения', off: 'Выключено' },
};

/** Why a plugin is not fully working, said plainly. One code per external reason. */
export type Blocker = 'db_paused' | 'migration_pending' | 'provider_app_missing' | 'google_verification' | 'google_allowlist' | 'admins_only';

export const BLOCKER_TEXT: Record<Lang, Record<Blocker, string>> = {
  ka: {
    db_paused: 'მონაცემთა ბაზა დროებით შეჩერებულია.',
    migration_pending: 'ბაზაში ცვლილება (მიგრაცია) ჯერ არ არის გაშვებული.',
    provider_app_missing: 'სერვისის აპლიკაცია ჯერ არ არის რეგისტრირებული.',
    google_verification: 'ელოდება Google-ის OAuth ვერიფიკაციას.',
    google_allowlist: 'ელოდება Google-ის allowlist-ს.',
    admins_only: 'ჯერ მხოლოდ ადმინისტრატორებისთვის.',
  },
  en: {
    db_paused: 'The database is paused for now.',
    migration_pending: 'A database change (migration) has not been run yet.',
    provider_app_missing: 'The service app is not registered yet.',
    google_verification: "Waiting on Google's OAuth verification.",
    google_allowlist: "Waiting on Google's allowlist.",
    admins_only: 'Admins only for now.',
  },
  ru: {
    db_paused: 'База данных временно приостановлена.',
    migration_pending: 'Изменение базы (миграция) ещё не применено.',
    provider_app_missing: 'Приложение сервиса ещё не зарегистрировано.',
    google_verification: 'Ждёт OAuth-верификации Google.',
    google_allowlist: 'Ждёт allowlist Google.',
    admins_only: 'Пока только для администраторов.',
  },
};

/** The message for a connector's redirect back (?notion=linked | ?github=error&reason=…). */
export function returnMessage(p: 'notion' | 'github', result: string, reason: string | null, lang: Lang): string {
  const n = p === 'notion' ? 'Notion' : 'GitHub';
  const T = {
    ka: { linked: `${n} დაკავშირებულია.`, denied: 'დაკავშირება გაუქმდა.', state: 'ბმულს ვადა გაუვიდა. დააჭირე „დაკავშირებას“ თავიდან.', scope: `${n}-ის ნებართვა ბოლომდე არ მოგვცა. დააკავშირე თავიდან.`, signin: `${n}-ის დასაკავშირებლად ჯერ შედი ანგარიშში.`, unavailable: `${n} ჯერ ვერ დაუკავშირდება: გამართვა არ დასრულებულა.`, failed: `${n}-მა არ უპასუხა. სცადე თავიდან.` },
    en: { linked: `${n} is connected.`, denied: 'The connection was cancelled.', state: 'The link expired. Press Connect again.', scope: `${n} did not give the permission we need. Connect again.`, signin: `Sign in first to connect ${n}.`, unavailable: `${n} cannot connect yet: setup is not finished.`, failed: `${n} did not answer. Try again.` },
    ru: { linked: `${n} подключён.`, denied: 'Подключение отменено.', state: 'Срок ссылки истёк. Нажмите «Подключить» ещё раз.', scope: `${n} не дал нужное разрешение. Подключите снова.`, signin: `Чтобы подключить ${n}, сначала войдите.`, unavailable: `${n} пока нельзя подключить: настройка не завершена.`, failed: `${n} не ответил. Попробуйте ещё раз.` },
  }[lang];
  if (result === 'linked') return T.linked;
  switch (reason) {
    case 'denied': return T.denied;
    case 'state': return T.state;
    case 'scope_missing': return T.scope;
    case 'not_signed_in': return T.signin;
    case 'unavailable': return T.unavailable;
    default: return T.failed;
  }
}
