/**
 * lib/billing/margin/catalog.ts — the PROPOSED v8 price list (Phase 8.1). Pure. Every user-facing price is computed from
 * the COGS matrix by the 65 % rule (econ.minCredits), never typed by hand, so a Google price change moves the price in one
 * commit and a test fails if any price drops under 65 %.
 *
 * `current` is what Production charges today (lib/credits/priceBook, the 100 %-profit-over-cost rule ≈ 50 % margin at
 * 0.10 ₾). It is only shown side by side; this file changes no live price. GG approves the list, then a wiring PR moves
 * PRICE_BOOK to these numbers behind PRICING_V8.
 */
import { PRICE_BOOK } from '@/lib/credits/priceBook';
import { COGS, cogsOf, fullCostUsd, type CogsAction, type ServiceId } from './cogs';
import { MARGIN_ECON, creditsToGel, gelToUsd, grossMargin, minCredits } from './econ';

export interface PriceRow {
  id: string;
  service: ServiceId;
  label: { ka: string; en: string };
  unit: { ka: string; en: string };
  model: string;
  /** Our full cost for one unit, USD (Google + retries + hosting; FX reserve is applied inside the margin maths). */
  costUsd: number;
  /** The proposed price, credits (the 65 % minimum at the floor credit). */
  credits: number;
  /** Price at the sticker credit (0.10 ₾), ₾ and USD. */
  gel: number;
  usd: number;
  /** Gross margin at the floor credit (worst case) and at the sticker credit (top-up buyer). */
  marginFloor: number;
  marginBase: number;
  /** Today's Production price, credits (null = not sold per unit today, e.g. free inside a daily cap). */
  current: number | null;
}

const SECONDS = [4, 6, 8, 10] as const;

function row(id: string, a: CogsAction, costUsd: number, label: PriceRow['label'], unit: PriceRow['unit'], current: number | null): PriceRow {
  const credits = minCredits(costUsd);
  const gel = creditsToGel(credits);
  return {
    id,
    service: a.service,
    label,
    unit,
    model: a.model,
    costUsd: Math.round(costUsd * 1e4) / 1e4,
    credits,
    gel,
    usd: gelToUsd(gel),
    marginFloor: grossMargin(credits, costUsd, MARGIN_ECON.floorCreditGel),
    marginBase: grossMargin(credits, costUsd, MARGIN_ECON.baseCreditGel),
    current,
  };
}

function single(id: string, current: number | null): PriceRow {
  const a = cogsOf(id);
  return row(id, a, fullCostUsd(a), a.label, a.unit, current);
}

/** Omni clips are sold by length; their cost is n × the per-second cost. */
function omniClips(): PriceRow[] {
  const out: PriceRow[] = [];
  for (const res of ['720p', '1080p'] as const) {
    const a = cogsOf(`video.omni.${res}.second`);
    for (const s of SECONDS) {
      out.push(
        row(
          `video.omni.${res}.${s}s`,
          a,
          s * fullCostUsd(a),
          { ka: `ვიდეო ${s} წმ, ${res} (ქართული მეტყველებით)`, en: `Video ${s} s, ${res} (with Georgian speech)` },
          { ka: '1 კლიპი', en: '1 clip' },
          PRICE_BOOK.omniClip[res][s],
        ),
      );
    }
  }
  const e = cogsOf('video.omni.edit.720p.second');
  for (const s of SECONDS) {
    out.push(
      row(
        `video.omni.edit.720p.${s}s`,
        e,
        s * fullCostUsd(e),
        { ka: `ვიდეოს რედაქტირება/გაგრძელება ${s} წმ, 720p`, en: `Edit / extend a video ${s} s, 720p` },
        { ka: '1 კლიპი', en: '1 clip' },
        PRICE_BOOK.omniEdit['720p'][s],
      ),
    );
  }
  return out;
}

export function priceList(): PriceRow[] {
  return [
    ...omniClips(),
    single('video.veo.lite.720p.8s', null),
    single('video.veo.fast.1080p.8s', PRICE_BOOK.clip.fast),
    single('image.1k', PRICE_BOOK.image),
    single('image.2k', null),
    single('image.4k', null),
    single('image.edit.1k', PRICE_BOOK.image),
    single('music.clip', PRICE_BOOK.music.under60),
    single('music.song', PRICE_BOOK.music.fullSong),
    single('voice.tts.minute', null),
    single('voice.stt.minute', null),
    single('live.voice.minute', null),
    single('live.avatar.minute', null),
    // Internal (not on the pricing page): kept so the admin margin view and the tests see every cost.
    single('video.omni.720p.second', null),
    single('video.omni.1080p.second', null),
    single('video.veo.standard.1080p.8s', PRICE_BOOK.clip.standard),
    single('chat.message', null),
    single('chat.search', null),
  ];
}

export const USER_FACING_IDS = new Set(
  priceList()
    .filter((r) => !/\.second$/.test(r.id) && !r.id.startsWith('chat.') && r.id !== 'video.veo.standard.1080p.8s')
    .map((r) => r.id),
);

export function priceOf(id: string): PriceRow {
  const r = priceList().find((x) => x.id === id);
  if (!r) throw new Error(`catalog: unknown price ${id}`);
  return r;
}

/** Every COGS action has a price row (so nothing billable is left unpriced). */
export function unpricedActions(): string[] {
  const ids = new Set(priceList().map((r) => r.id));
  return COGS.filter((a) => !ids.has(a.id) && !a.id.endsWith('.second')).map((a) => a.id);
}
