/**
 * Date bucketing for the chat-history panel — pure, so it can be tested without mounting the studio.
 *
 * ⚠️ CALENDAR DAYS, NOT ROLLING WINDOWS. A 24h "yesterday" is wrong for several hours either side of
 * midnight: a chat from 11pm last night is only 10 hours old at 9am and a rolling window would label it
 * "Today". Small lies like that are what make a history panel feel untrustworthy.
 */
export type HistoryBucket = 'today' | 'yesterday' | 'week' | 'month' | 'older';

export const HISTORY_BUCKET_ORDER: readonly HistoryBucket[] = ['today', 'yesterday', 'week', 'month', 'older'];

export const HISTORY_BUCKET_LABEL: Record<'ka' | 'en' | 'ru', Record<HistoryBucket, string>> = {
  ka: { today: 'დღეს', yesterday: 'გუშინ', week: 'ბოლო 7 დღე', month: 'ბოლო 30 დღე', older: 'უფრო ადრე' },
  en: { today: 'Today', yesterday: 'Yesterday', week: 'Previous 7 days', month: 'Previous 30 days', older: 'Older' },
  ru: { today: 'Сегодня', yesterday: 'Вчера', week: 'Последние 7 дней', month: 'Последние 30 дней', older: 'Ранее' },
};

export const HISTORY_SEARCH_PLACEHOLDER: Record<'ka' | 'en' | 'ru', string> = {
  ka: 'ძებნა ისტორიაში…', en: 'Search chats…', ru: 'Поиск по чатам…',
};

export const HISTORY_NO_MATCH: Record<'ka' | 'en' | 'ru', string> = {
  ka: 'ვერაფერი მოიძებნა', en: 'Nothing found', ru: 'Ничего не найдено',
};

/** Which bucket a conversation belongs to, by whole calendar days between its day and today. */
export function historyBucketOf(updatedAt: number, now: number): HistoryBucket {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const startOfThen = new Date(updatedAt).setHours(0, 0, 0, 0);
  const daysBack = Math.floor((startOfToday - startOfThen) / 86_400_000);
  // A future timestamp (clock skew between devices is real) stays in Today rather than vanishing above
  // the list into a bucket that is never rendered.
  if (daysBack <= 0) return 'today';
  if (daysBack === 1) return 'yesterday';
  if (daysBack < 7) return 'week';
  if (daysBack < 30) return 'month';
  return 'older';
}
