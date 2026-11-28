/**
 * lib/billing/shortBalance.ts — Phase 8.25: why the top-up sheet opened.
 *
 * ⚠️ THE SHEET OPENED WITHOUT SAYING WHY. A person with 0 credits who pressed Send on a video got the „Credits" sheet with
 * no word about the video: it read like a stray pop-up, not „you need ✦28 and have ✦0". Every place that opens the sheet
 * because a balance is short now passes `{ reason: 'insufficient', needed, balance }` with the event, and the sheet leads
 * with one Georgian (en/ru) sentence that names both numbers and the next step.
 *
 * Display only: the route's reservation is still the gate. Client-safe. Shown only while NEXT_PUBLIC_SETTINGS_825=1.
 */

export interface ShortBalanceDetail {
  reason: 'insufficient';
  /** Credits the action costs (✦), when known. */
  needed?: number;
  /** The balance in credits (✦), when known. */
  balance?: number;
}

const count = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined;

/** The event's detail when it is a short-balance reason, else null (the sheet opened for another reason). */
export function parseShortBalance(detail: unknown): ShortBalanceDetail | null {
  if (!detail || typeof detail !== 'object' || (detail as { reason?: unknown }).reason !== 'insufficient') return null;
  const d = detail as { needed?: unknown; balance?: unknown };
  const needed = count(d.needed);
  const balance = count(d.balance);
  return { reason: 'insufficient', ...(needed !== undefined ? { needed } : {}), ...(balance !== undefined ? { balance } : {}) };
}

type Lang = 'ka' | 'en' | 'ru';
const lang = (l: string | null | undefined): Lang => (l === 'en' || l === 'ru' ? l : 'ka');
const n = (v: number) => v.toLocaleString('en-US');

export function shortBalanceCopy(d: ShortBalanceDetail, locale: string | null | undefined): { title: string; body: string } {
  const l = lang(locale);
  const known = d.needed !== undefined && d.balance !== undefined && d.needed > d.balance;
  const title = { ka: 'კრედიტი არ გყოფნის', en: 'Not enough credits', ru: 'Недостаточно кредитов' }[l];
  if (known) {
    const missing = d.needed! - d.balance!;
    return {
      title,
      body: {
        ka: `ამ მოქმედებას სჭირდება ✦${n(d.needed!)}, შენ გაქვს ✦${n(d.balance!)} (აკლია ✦${n(missing)}). შეავსე ბალანსი ან აირჩიე გეგმა ქვემოთ და სცადე ხელახლა. თანხა არ ჩამოგეჭრა.`,
        en: `This needs ✦${n(d.needed!)} and you have ✦${n(d.balance!)} (✦${n(missing)} short). Top up or pick a plan below, then try again. Nothing was charged.`,
        ru: `Нужно ✦${n(d.needed!)}, у вас ✦${n(d.balance!)} (не хватает ✦${n(missing)}). Пополните баланс или выберите тариф ниже и попробуйте снова. Ничего не списано.`,
      }[l],
    };
  }
  return {
    title,
    body: {
      ka: 'ამ მოქმედებისთვის კრედიტი არ გყოფნის. შეავსე ბალანსი ან აირჩიე გეგმა ქვემოთ და სცადე ხელახლა. თანხა არ ჩამოგეჭრა.',
      en: 'You do not have enough credits for this. Top up or pick a plan below, then try again. Nothing was charged.',
      ru: 'Для этого не хватает кредитов. Пополните баланс или выберите тариф ниже и попробуйте снова. Ничего не списано.',
    }[l],
  };
}

/** Open the top-up sheet because a balance is short (ChatChrome listens for `myavatar:open-credits`). */
export function openTopUpShort(detail: Omit<ShortBalanceDetail, 'reason'> = {}): void {
  try {
    window.dispatchEvent(new CustomEvent('myavatar:open-credits', { detail: { reason: 'insufficient', ...detail } }));
  } catch {
    /* SSR */
  }
}
