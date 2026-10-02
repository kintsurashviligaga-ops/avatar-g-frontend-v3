/**
 * lib/billing/bogCheckoutClient.ts — the browser side of Bank of Georgia checkout. One place for the calls the
 * credits modal, the film studio wallet and the dashboard's return handler make, and for the words the customer
 * reads when they come back from the bank (ka / en / ru).
 *
 * No secrets, no server imports: every call goes to our own /api/billing/bog/* routes with the session cookie.
 */
import { TIERS, isPaidTierId } from './tiers';

type Lang = 'ka' | 'en' | 'ru';
const lang = (locale: string | null | undefined): Lang => (locale === 'en' || locale === 'ru' ? locale : 'ka');

export type BogCheckoutRequest =
  | { kind: 'topup'; amountGel: number; locale: string }
  | { kind: 'plan'; tierId: string; locale: string };

export type BogCheckoutResult =
  | { ok: true; redirectUrl: string; orderId: string; autoRenew?: boolean }
  | { ok: false; reason: 'auth' | 'already_subscribed' | 'unavailable' | 'error'; activeUntil?: string | null };

/** Leave for the bank's payment page. One seam, so tests can watch the navigation instead of performing it. */
export function navigateToPayment(url: string): void {
  window.location.assign(url);
}

/** Create the order and get BOG's payment page. The caller then calls navigateToPayment(redirectUrl). */
export async function startBogCheckout(req: BogCheckoutRequest, f: typeof fetch = fetch): Promise<BogCheckoutResult> {
  try {
    const res = await f('/api/billing/bog/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(req),
    });
    const j = (await res.json().catch(() => ({}))) as { redirectUrl?: unknown; orderId?: unknown; autoRenew?: unknown; activeUntil?: unknown };
    if (res.ok && typeof j.redirectUrl === 'string' && /^https:\/\//i.test(j.redirectUrl) && typeof j.orderId === 'string') {
      return { ok: true, redirectUrl: j.redirectUrl, orderId: j.orderId, ...(typeof j.autoRenew === 'boolean' ? { autoRenew: j.autoRenew } : {}) };
    }
    if (res.status === 401) return { ok: false, reason: 'auth' };
    if (res.status === 409) return { ok: false, reason: 'already_subscribed', activeUntil: typeof j.activeUntil === 'string' ? j.activeUntil : null };
    if (res.status === 503) return { ok: false, reason: 'unavailable' };
    return { ok: false, reason: 'error' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export interface BogPlanSummary {
  tier: string;
  status: string;
  currentPeriodEnd: string | null;
  autoRenew: boolean;
  cardMask: string | null;
  amountGel: number | null;
}

/** The signed-in user's live BOG plan, or null (none, signed out, or unreadable). */
export async function fetchBogPlan(f: typeof fetch = fetch): Promise<BogPlanSummary | null> {
  try {
    const res = await f('/api/billing/bog/subscription', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return null;
    const j = (await res.json()) as { plan?: BogPlanSummary | null };
    return j.plan && isPaidTierId(j.plan.tier) ? j.plan : null;
  } catch {
    return null;
  }
}

/** Stop auto-renewal. true when the server confirmed it. */
export async function cancelBogRenewal(f: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await f('/api/billing/bog/subscription', { method: 'DELETE', credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}

export type BogOrderPublicStatus = 'completed' | 'pending' | 'failed' | 'refunded' | 'review';

export interface BogOrderStatus {
  orderId: string;
  kind: 'topup' | 'subscription' | 'renewal';
  status: BogOrderPublicStatus;
  credits: number;
  tier: string | null;
  periodEnd: string | null;
  autoRenew: boolean | null;
}

export async function fetchBogOrder(id: string, f: typeof fetch = fetch): Promise<BogOrderStatus | null> {
  try {
    const res = await f(`/api/billing/bog/orders/${encodeURIComponent(id)}`, { credentials: 'include', cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as BogOrderStatus;
  } catch {
    return null;
  }
}

/**
 * Ask until the order is no longer pending (each ask reconciles with BOG server-side). The last answer — possibly
 * still pending — is returned; null only when no ask succeeded.
 */
export async function pollBogOrder(
  id: string,
  opts: { attempts?: number; intervalMs?: number; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {},
): Promise<BogOrderStatus | null> {
  const attempts = Math.max(1, opts.attempts ?? 6);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last: BogOrderStatus | null = null;
  for (let i = 0; i < attempts; i++) {
    const s = await fetchBogOrder(id, opts.fetch ?? fetch);
    if (s) last = s;
    if (s && s.status !== 'pending') return s;
    if (i < attempts - 1) await sleep(opts.intervalMs ?? 2000);
  }
  return last;
}

const DATE_LOCALE: Record<Lang, string> = { ka: 'ka-GE', en: 'en-GB', ru: 'ru-RU' };

/** "2 November" in the user's language; '' for a missing/invalid date. */
export function formatPlanDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(DATE_LOCALE[lang(locale)], { day: 'numeric', month: 'long' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function planName(tier: string | null | undefined, locale: string): string {
  return isPaidTierId(tier) ? TIERS[tier].names[lang(locale)] : '';
}

export interface PaymentReturnNotice {
  ok: boolean;
  text: string;
  /** Failure → open the plans/top-up sheet again so the customer can retry where they were. */
  reopenPricing: boolean;
}

/**
 * The one message the customer sees on returning from BOG. `pay` is the redirect's own verdict (success|failed) —
 * used only when our order status could not be read or is still settling.
 */
export function paymentReturnMessage(status: BogOrderStatus | null, pay: string | null, locale: string): PaymentReturnNotice {
  const l = lang(locale);
  const s = status?.status ?? null;
  const failed = s === 'failed' || ((s === null || s === 'pending') && pay === 'failed');
  if (failed) {
    return {
      ok: false,
      reopenPricing: true,
      text: {
        ka: 'გადახდა ვერ შესრულდა — თანხა არ ჩამოგეჭრათ. სცადეთ თავიდან.',
        en: 'Payment didn’t go through — you were not charged. Please try again.',
        ru: 'Платёж не прошёл — деньги не списаны. Попробуйте ещё раз.',
      }[l],
    };
  }
  if (s === 'completed' && status) {
    const n = status.credits;
    if (status.kind === 'topup') {
      return { ok: true, reopenPricing: false, text: { ka: `გადახდა მიღებულია — დაემატა ${n} კრედიტი.`, en: `Payment received — ${n} credits added.`, ru: `Оплата получена — начислено ${n} кредитов.` }[l] };
    }
    const name = planName(status.tier, l);
    if (status.autoRenew === false) {
      const until = formatPlanDate(status.periodEnd, l);
      return {
        ok: true,
        reopenPricing: false,
        text: {
          ka: `გეგმა „${name}“ აქტიურია${until ? ` ${until}-მდე` : ''} — +${n} კრედიტი.`,
          en: `${name} plan active${until ? ` until ${until}` : ''} — +${n} credits.`,
          ru: `Тариф «${name}» активен${until ? ` до ${until}` : ''} — +${n} кредитов.`,
        }[l],
      };
    }
    return {
      ok: true,
      reopenPricing: false,
      text: {
        ka: `გეგმა „${name}“ გააქტიურდა — +${n} კრედიტი. განახლდება ყოველთვიურად.`,
        en: `${name} plan active — +${n} credits. Renews monthly.`,
        ru: `Тариф «${name}» активирован — +${n} кредитов. Продлевается ежемесячно.`,
      }[l],
    };
  }
  if (s === 'review') {
    return {
      ok: true,
      reopenPricing: false,
      text: {
        ka: 'გადახდა მიღებულია და მოწმდება — მალე დაგიკავშირდებით.',
        en: 'We received your payment and are verifying it — we’ll follow up shortly.',
        ru: 'Платёж получен и проверяется — мы скоро свяжемся с вами.',
      }[l],
    };
  }
  if (s === 'refunded') {
    return { ok: true, reopenPricing: false, text: { ka: 'ეს გადახდა დაბრუნებულია.', en: 'This payment was refunded.', ru: 'Этот платёж возвращён.' }[l] };
  }
  return {
    ok: true,
    reopenPricing: false,
    text: {
      ka: 'გადახდა მუშავდება — კრედიტები მალე გამოჩნდება.',
      en: 'Payment is processing — your credits will appear shortly.',
      ru: 'Платёж обрабатывается — кредиты скоро появятся.',
    }[l],
  };
}
