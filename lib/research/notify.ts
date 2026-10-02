/**
 * lib/research/notify.ts — the text of the in-app notification filed when a research job settles (type 'research', the
 * existing `notifications` table via lib/notifications/store.createNotification). Pure. The completion toast in the UI
 * (ResearchWatcher) is the primary signal and reads the job list on its own; this row is the durable record for the bell.
 */
import type { ResearchJobRow, ResearchLocale } from './types';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function notificationText(job: Pick<ResearchJobRow, 'locale' | 'title' | 'sources_count' | 'refund_state' | 'incomplete'>, outcome: 'completed' | 'failed'): string {
  const lang: ResearchLocale = job.locale === 'en' || job.locale === 'ru' ? job.locale : 'ka';
  const title = clip((job.title ?? '').replace(/\s+/g, ' ').trim(), 80);
  if (outcome === 'completed') {
    const n = job.sources_count;
    if (lang === 'en') return `Your Deep Research report is ready${title ? `: “${title}”` : ''} — ${n} ${n === 1 ? 'source' : 'sources'}.`;
    if (lang === 'ru') return `Отчёт Deep Research готов${title ? `: «${title}»` : ''} — источников: ${n}.`;
    return `Deep Research-ის ანგარიში მზადაა${title ? `: „${title}“` : ''} — წყაროები: ${n}.`;
  }
  const returned = job.refund_state === 'done';
  if (lang === 'en') return `Deep Research could not finish — your credits ${returned ? 'were returned' : 'will be returned shortly'}.`;
  if (lang === 'ru') return `Deep Research не завершился — кредиты ${returned ? 'возвращены' : 'скоро будут возвращены'}.`;
  return `Deep Research ვერ დასრულდა — კრედიტი ${returned ? 'დაგიბრუნდა' : 'მალე დაგიბრუნდება'}.`;
}
