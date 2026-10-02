/**
 * lib/notifications/push/messages.ts — the text of the test notification (POST /api/push/test). It lands on a lock screen,
 * so it says what it is and nothing else.
 */
export type PushLocale = 'ka' | 'en' | 'ru';

export function asPushLocale(v: unknown): PushLocale {
  return v === 'en' || v === 'ru' ? v : 'ka';
}

const TEST: Record<PushLocale, { title: string; body: string }> = {
  ka: { title: 'სატესტო შეტყობინება', body: 'შეტყობინებები ჩართულია — გეტყვით, როცა შენი ნამუშევარი მზად იქნება.' },
  en: { title: 'Test notification', body: 'Notifications are on — we’ll tell you when your work is ready.' },
  ru: { title: 'Тестовое уведомление', body: 'Уведомления включены — мы сообщим, когда ваша работа будет готова.' },
};

export function pushTestMessage(locale: PushLocale): { title: string; body: string } {
  return TEST[locale];
}
