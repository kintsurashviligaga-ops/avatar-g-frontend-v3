/**
 * creditHistory — turn rows of the authoritative credit ledger (public.credit_ledger) into the Settings → History
 * feed. Pure: no I/O, so the route and the UI share one mapping and it is testable without a database.
 *
 * The history used to come from public.credit_transactions, a feed the BROWSER wrote through POST
 * /api/credits/record with a client-chosen `creditsDelta` — so anyone could write arbitrary "+1000 credits"
 * rows into their own history (a forged receipt the support team would see). That endpoint is gone; the
 * feed is now derived from the ledger rows the server-side RPCs write, which are the money of record.
 *
 * A ledger row is { delta, reason, metadata: { ref, source }, created_at }. Refs are `<kind>:<key>` for
 * spends (`image:…`, `assemble:…`), `stripe:<session>` / `sub:<invoice>` for purchases, and `…:refund` for
 * Saga compensations. The first ref segment names the action; anything unknown falls back to a neutral
 * "usage" (spend) or "credit" (grant) label rather than leaking an internal ref into the UI.
 */

export interface CreditHistoryItem {
  /** A key of the UI's action label table (always one of HISTORY_ACTIONS). */
  action: HistoryAction;
  /** Credits: negative = spent, positive = granted / refunded. */
  creditsDelta: number;
  createdAt: string;
}

export const HISTORY_ACTIONS = [
  'video', 'music', 'image', 'avatar', 'voice', 'remix', 'interior', 'research', 'chat',
  'topup', 'subscription', 'refund', 'reversal', 'bonus', 'adjustment', 'usage', 'credit',
] as const;
export type HistoryAction = (typeof HISTORY_ACTIONS)[number];

export interface HistoryLabel { emoji: string; ka: string; en: string; ru: string }

/** What the history shows for each action, in the three languages. Typed by HistoryAction: an action without a label
 *  does not compile. Shared by Settings → History and the chat's profile sheet. */
export const HISTORY_LABEL: Record<HistoryAction, HistoryLabel> = {
  video: { emoji: '🎬', ka: 'ვიდეო', en: 'Video', ru: 'Видео' },
  music: { emoji: '🎵', ka: 'მუსიკა', en: 'Music', ru: 'Музыка' },
  image: { emoji: '🖼', ka: 'სურათი', en: 'Image', ru: 'Фото' },
  avatar: { emoji: '🎭', ka: 'ავატარი', en: 'Avatar', ru: 'Аватар' },
  remix: { emoji: '🎞', ka: 'რემიქსი', en: 'Remix', ru: 'Ремикс' },
  voice: { emoji: '🎙', ka: 'ხმა', en: 'Voice', ru: 'Голос' },
  interior: { emoji: '🛋', ka: 'ინტერიერი', en: 'Interior', ru: 'Интерьер' },
  research: { emoji: '🔎', ka: 'კვლევა', en: 'Research', ru: 'Исследование' },
  chat: { emoji: '💬', ka: 'ჩატი', en: 'Chat', ru: 'Чат' },
  topup: { emoji: '💳', ka: 'შევსება', en: 'Top-up', ru: 'Пополнение' },
  subscription: { emoji: '⭐', ka: 'გამოწერა', en: 'Subscription', ru: 'Подписка' },
  refund: { emoji: '↩', ka: 'დაბრუნება', en: 'Refund', ru: 'Возврат' },
  reversal: { emoji: '⤺', ka: 'გადახდის გაუქმება', en: 'Payment reversed', ru: 'Отмена платежа' },
  bonus: { emoji: '🎁', ka: 'ბონუსი', en: 'Bonus', ru: 'Бонус' },
  adjustment: { emoji: '🛠', ka: 'კორექტირება', en: 'Adjustment', ru: 'Корректировка' },
  usage: { emoji: '⚙', ka: 'გამოყენება', en: 'Usage', ru: 'Использование' },
  credit: { emoji: '➕', ka: 'ჩარიცხვა', en: 'Credit', ru: 'Зачисление' },
};

/** The label of an action as the history API returned it; anything unknown reads as itself, never blank. */
export function historyLabel(action: string): HistoryLabel {
  return (HISTORY_LABEL as Record<string, HistoryLabel>)[action] ?? { emoji: '•', ka: action, en: action, ru: action };
}

/** Ref prefix → spend label. */
const SPEND_KIND: Record<string, HistoryAction> = {
  video: 'video', film: 'video', assemble: 'video', 'assemble-single': 'video', longform: 'video', studio: 'video',
  'product-ad': 'video', lipsync: 'video', 'motion-control': 'video', presenter: 'video', genjutsu: 'video',
  music: 'music', song: 'music',
  image: 'image', nanobanana: 'image', photo: 'image',
  avatar: 'avatar', model3d: 'avatar',
  voice: 'voice', tts: 'voice',
  remix: 'remix', 'pipeline-remix': 'remix',
  interior: 'interior',
  research: 'research',
  chat: 'chat',
  reversal: 'reversal',
};

/** Ref prefix → grant label. */
const GRANT_KIND: Record<string, HistoryAction> = {
  stripe: 'topup', bog: 'topup', topup: 'topup', wallet: 'topup', purchase: 'topup', checkout: 'topup',
  sub: 'subscription', subscription: 'subscription',
  starter: 'bonus', trial: 'bonus', signup: 'bonus', bonus: 'bonus', welcome: 'bonus', referral: 'bonus',
  admin: 'adjustment',
};

export interface LedgerRow {
  delta?: unknown;
  reason?: unknown;
  metadata?: unknown;
  created_at?: unknown;
}

function refOf(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const ref = (metadata as { ref?: unknown }).ref;
  return typeof ref === 'string' ? ref : '';
}

export function historyActionFor(row: LedgerRow): HistoryAction {
  const delta = Number(row.delta) || 0;
  const reason = typeof row.reason === 'string' ? row.reason.toLowerCase() : '';
  const ref = refOf(row.metadata).toLowerCase();
  const head = ref.split(':')[0] ?? '';

  if (delta > 0) {
    if (reason === 'refund' || /:refund(?::|$)/.test(ref)) return 'refund';
    if (reason === 'admin_adjustment') return 'adjustment';
    if (GRANT_KIND[head]) return GRANT_KIND[head];
    if (reason === 'purchase') return 'topup';
    return 'credit';
  }
  if (reason === 'admin_adjustment') return 'adjustment';
  return SPEND_KIND[head] ?? 'usage';
}

/** Map ledger rows (newest first) to history items; a zero or non-numeric delta is dropped. */
export function ledgerRowsToHistory(rows: readonly LedgerRow[]): CreditHistoryItem[] {
  const out: CreditHistoryItem[] = [];
  for (const row of rows) {
    const delta = Math.trunc(Number(row.delta));
    if (!Number.isFinite(delta) || delta === 0) continue;
    out.push({ action: historyActionFor(row), creditsDelta: delta, createdAt: String(row.created_at ?? '') });
  }
  return out;
}
