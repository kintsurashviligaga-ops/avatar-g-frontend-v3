/**
 * lib/billing/v5/priceDrafts.ts — DRAFT rows for the versioned price book (v5.1 Phase 5, M-5; PREPARED, NOT WIRED, NOT
 * APPROVED). Pure.
 *
 * GG 2026-11-13 13:06Z: "Draft all the price rows from the official Google pricing pages. I will review and approve them
 * one by one." Every row below is a DRAFT: approvedBy is null, so `activeVersion` never uses it (a draft prices nothing)
 * and the SQL exclusion constraint ignores it. A row becomes live only when GG approves it, which in the database sets
 * approved_by/approved_at on that one row (docs/v5.1-phase5/price-drafts.md lists them for review).
 *
 * Source: the Vertex AI generative AI pricing page, read 2026-11-13 ~13:15Z (the page shows no "last updated" date).
 *
 * Policy choices in these drafts (each is GG's to overrule):
 *   1. Billed price, not the promo-after-credits price. Google marks 3.8 Flash, 3.8 Flash TTS, Argon and Carbon as
 *      "promotional pricing provided through 50 % credits back on net spend". The invoice line (and the Cloud Billing
 *      export that reconcile.ts compares against) is the full price; the 50 % comes back later as a credit. So every row
 *      here uses the FULL price ($1.50 / $7.50 for 3.8 Flash, not $0.75 / $3.75), and none is a promo row. Users never
 *      see a price jump on 2027-01-01 or 2026-12-01, and the credits-back is extra margin while it lasts.
 *   2. creditsPerUnit is the smallest value (4 decimals, the column's scale) that meets the owner's rule: 100 % profit
 *      over full cost, FX reserve and card fee included (`rowProblem` re-checks it, so a draft can't be under the rule).
 *   3. Argon and Carbon rows are drafted for completeness (their price is now known), but D-06 still keeps both models
 *      off; approving their rows does not turn them on.
 */
import { ECON, type Econ } from '@/lib/credits/unitEconomics';
import { rowProblem, type PriceUnit, type PriceVersion } from './priceVersions';

export const VERTEX_PRICING_URL = 'https://cloud.google.com/vertex-ai/generative-ai/pricing';
export const DRAFT_FETCHED_AT = '2026-11-13T13:15:00Z';
/** Drafts start at the moment GG approves them in practice; this placeholder is replaced by the approval time. */
export const DRAFT_VALID_FROM = '2026-11-13T00:00:00Z';

/** The smallest credits per unit (4 decimals) that pass the owner's rule for `usdPerUnit`. */
export function ruleCreditsPerUnit(usdPerUnit: number, econ: Econ = ECON): number {
  const probe = (c: number): PriceVersion => ({
    id: 'pv_probe', capability: 'probe', model: 'probe', unit: 'call', usdPerUnit, creditsPerUnit: c,
    validFrom: DRAFT_VALID_FROM, validTo: null, sourceUrl: VERTEX_PRICING_URL, fetchedAt: DRAFT_FETCHED_AT, approvedBy: 'probe', promo: false,
  });
  // Closed form first (see profitOverCostOf), then step up one ten-thousandth until the rule holds (float safety).
  const k = 1 + econ.profitOverCost;
  const costGel = usdPerUnit * econ.gelPerUsd * (1 + econ.fxReserve);
  const denom = econ.creditGel * (1 / (1 + econ.vatRate) - k * econ.paymentFeeRate);
  let c = Math.ceil(((k * costGel) / denom) * 1e4 - 1e-6) / 1e4;
  while (rowProblem(probe(c), econ) !== null) c = Math.round((c + 1e-4) * 1e4) / 1e4;
  return c;
}

type Draft = { id: string; capability: string; model: string; unit: PriceUnit; usd: number; note: string; validFrom?: string; validTo?: string | null };

/** What Google lists, exactly as read. `note` says which line of the page it is. */
const RAW: readonly Draft[] = [
  // Gemini 3.8 Flash (Global standard). Full price; the page's $0.75 / $3.75 is after 50 % credits back until 2026-12-31.
  { id: 'pv_text_38flash_in', capability: 'text', model: 'gemini-3.8-flash', unit: 'input_mtok', usd: 1.5, note: 'input text/image/video/audio, per 1M tokens' },
  { id: 'pv_text_38flash_out', capability: 'text', model: 'gemini-3.8-flash', unit: 'output_mtok', usd: 7.5, note: 'text output incl. reasoning, per 1M tokens' },
  // Gemini 3.1 Pro Preview, prompts up to 200K tokens (the app never sends more: lib/agent context cap).
  { id: 'pv_text_31pro_in', capability: 'text.le200k', model: 'gemini-3.1-pro-preview', unit: 'input_mtok', usd: 2, note: '<=200K input, per 1M tokens' },
  { id: 'pv_text_31pro_out', capability: 'text.le200k', model: 'gemini-3.1-pro-preview', unit: 'output_mtok', usd: 12, note: '<=200K input, text output, per 1M tokens' },
  { id: 'pv_text_31pro_in_gt200k', capability: 'text.gt200k', model: 'gemini-3.1-pro-preview', unit: 'input_mtok', usd: 4, note: '>200K input, per 1M tokens' },
  { id: 'pv_text_31pro_out_gt200k', capability: 'text.gt200k', model: 'gemini-3.1-pro-preview', unit: 'output_mtok', usd: 18, note: '>200K input, text output, per 1M tokens' },
  // Gemini 4 Argon / Carbon (D-06: still off). Full price; the page lists $2 / $10 until 2026-11-30 as 50 % credits back.
  { id: 'pv_text_argon_in', capability: 'text', model: 'gemini-4-argon', unit: 'input_mtok', usd: 4, note: 'input, per 1M tokens (D-06: model stays off)' },
  { id: 'pv_text_argon_out', capability: 'text', model: 'gemini-4-argon', unit: 'output_mtok', usd: 20, note: 'output, per 1M tokens (D-06: model stays off)' },
  { id: 'pv_text_carbon_in', capability: 'text', model: 'gemini-4-carbon', unit: 'input_mtok', usd: 4, note: 'input, per 1M tokens (D-06: model stays off)' },
  { id: 'pv_text_carbon_out', capability: 'text', model: 'gemini-4-carbon', unit: 'output_mtok', usd: 20, note: 'output, per 1M tokens (D-06: model stays off)' },
  // Gemini 3.8 Flash TTS (Preview). Full price; the page's $0.50 / $9.00 is after 50 % credits back until 2026-12-31.
  { id: 'pv_tts_38flash_in', capability: 'tts', model: 'gemini-3.8-flash-tts', unit: 'input_mtok', usd: 1, note: 'text input, per 1M tokens' },
  { id: 'pv_tts_38flash_out', capability: 'tts', model: 'gemini-3.8-flash-tts', unit: 'output_mtok', usd: 18, note: 'audio output, per 1M tokens' },
  // Gemini 3.8 Live: the page lists only a non-global price (the relay runs in eu, a non-global location).
  { id: 'pv_live_38_audio_in', capability: 'live.audio', model: 'gemini-3.8-live', unit: 'input_mtok', usd: 3, note: 'non-global, input audio, per 1M tokens' },
  { id: 'pv_live_38_audio_out', capability: 'live.audio', model: 'gemini-3.8-live', unit: 'output_mtok', usd: 12, note: 'non-global, output audio, per 1M tokens' },
  { id: 'pv_live_38_text_in', capability: 'live.text', model: 'gemini-3.8-live', unit: 'input_mtok', usd: 0.75, note: 'non-global, input text, per 1M tokens' },
  { id: 'pv_live_38_text_out', capability: 'live.text', model: 'gemini-3.8-live', unit: 'output_mtok', usd: 4.5, note: 'non-global, output text, per 1M tokens' },
  { id: 'pv_live_38_video_in', capability: 'live.video', model: 'gemini-3.8-live', unit: 'input_mtok', usd: 1, note: 'non-global, input video/image, per 1M tokens' },
  { id: 'pv_live_38_avatar_out', capability: 'live.avatar', model: 'gemini-3.8-live', unit: 'output_mtok', usd: 1, note: 'non-global, output avatar video, per 1M tokens' },
  // Gemini 3.1 Flash Image (Nano Banana 2). Per image at the page's own approximation (image output $60 / 1M tokens).
  { id: 'pv_image_31flash_1k', capability: 'image.1k', model: 'gemini-3.1-flash-image', unit: 'image', usd: 0.067, note: '1K image (1,120 tokens at $60 / 1M)' },
  { id: 'pv_image_31flash_2k', capability: 'image.2k', model: 'gemini-3.1-flash-image', unit: 'image', usd: 0.101, note: '2K image (1,680 tokens)' },
  { id: 'pv_image_31flash_4k', capability: 'image.4k', model: 'gemini-3.1-flash-image', unit: 'image', usd: 0.15, note: '4K image (2,520 tokens)' },
  { id: 'pv_image_31flash_in', capability: 'image.prompt', model: 'gemini-3.1-flash-image', unit: 'input_mtok', usd: 0.5, note: 'text/image input, per 1M tokens (each input image = 1,120 tokens)' },
  // Gemini Omni 1.2 Flash (Georgian speaking video). Video out is billed by the token: 5,792 tok/s at 720p, 8,688 at 1080p.
  { id: 'pv_video_omni12_out', capability: 'video.omni', model: 'gemini-omni-1.2-flash', unit: 'output_mtok', usd: 12, note: 'video output, per 1M tokens' },
  { id: 'pv_video_omni12_in', capability: 'video.omni', model: 'gemini-omni-1.2-flash', unit: 'input_mtok', usd: 1.5, note: 'input text/image/video/audio, per 1M tokens' },
  { id: 'pv_video_omni12_text_out', capability: 'video.omni.text', model: 'gemini-omni-1.2-flash', unit: 'output_mtok', usd: 9, note: 'text output (thinking), per 1M tokens' },
  // Veo 3.1, per second of video. The page labels the unit "/ 1 count"; Veo bills per generated second.
  { id: 'pv_veo31_720_audio', capability: 'video.veo.720p.audio', model: 'veo-3.1-generate', unit: 'second', usd: 0.4, note: '720p/1080p with audio' },
  { id: 'pv_veo31_1080_audio', capability: 'video.veo.1080p.audio', model: 'veo-3.1-generate', unit: 'second', usd: 0.4, note: '720p/1080p with audio' },
  { id: 'pv_veo31_4k_audio', capability: 'video.veo.4k.audio', model: 'veo-3.1-generate', unit: 'second', usd: 0.6, note: '4K with audio' },
  { id: 'pv_veo31_720_mute', capability: 'video.veo.720p.mute', model: 'veo-3.1-generate', unit: 'second', usd: 0.2, note: '720p/1080p without audio' },
  { id: 'pv_veo31_1080_mute', capability: 'video.veo.1080p.mute', model: 'veo-3.1-generate', unit: 'second', usd: 0.2, note: '720p/1080p without audio' },
  { id: 'pv_veo31fast_720_audio', capability: 'video.veo.720p.audio', model: 'veo-3.1-fast-generate', unit: 'second', usd: 0.1, note: '720p with audio' },
  { id: 'pv_veo31fast_1080_audio', capability: 'video.veo.1080p.audio', model: 'veo-3.1-fast-generate', unit: 'second', usd: 0.12, note: '1080p with audio' },
  { id: 'pv_veo31fast_4k_audio', capability: 'video.veo.4k.audio', model: 'veo-3.1-fast-generate', unit: 'second', usd: 0.3, note: '4K with audio' },
  { id: 'pv_veo31fast_720_mute', capability: 'video.veo.720p.mute', model: 'veo-3.1-fast-generate', unit: 'second', usd: 0.08, note: '720p without audio' },
  { id: 'pv_veo31fast_1080_mute', capability: 'video.veo.1080p.mute', model: 'veo-3.1-fast-generate', unit: 'second', usd: 0.1, note: '1080p without audio' },
  { id: 'pv_veo31lite_720_audio', capability: 'video.veo.720p.audio', model: 'veo-3.1-lite-generate', unit: 'second', usd: 0.05, note: '720p with audio' },
  { id: 'pv_veo31lite_1080_audio', capability: 'video.veo.1080p.audio', model: 'veo-3.1-lite-generate', unit: 'second', usd: 0.08, note: '1080p with audio (no 4K on Lite)' },
  { id: 'pv_veo31lite_720_mute', capability: 'video.veo.720p.mute', model: 'veo-3.1-lite-generate', unit: 'second', usd: 0.03, note: '720p without audio' },
  { id: 'pv_veo31lite_1080_mute', capability: 'video.veo.1080p.mute', model: 'veo-3.1-lite-generate', unit: 'second', usd: 0.05, note: '1080p without audio' },
  // Lyria 3, per call.
  { id: 'pv_music_lyria3_clip', capability: 'music.clip', model: 'lyria-3-clip-preview', unit: 'call', usd: 0.04, note: 'one 30-second clip' },
  { id: 'pv_music_lyria3_pro', capability: 'music.song', model: 'lyria-3-pro-preview', unit: 'call', usd: 0.08, note: 'one full song' },
  // Grounding with Google Search: first 5,000 a month free across Gemini 3/4, then $14 / 1,000. Drafted at the paid
  // rate (we can't tell inside one call whether the free 5,000 are used up; the free part is margin).
  { id: 'pv_search_grounding', capability: 'search.grounding', model: 'gemini-3-grounding', unit: 'call', usd: 0.014, note: '$14.00 per 1,000 grounded queries' },
];

/** The draft rows, priced at the owner's rule, all unapproved. */
export function priceDrafts(econ: Econ = ECON): PriceVersion[] {
  return RAW.map((d) => ({
    id: d.id,
    capability: d.capability,
    model: d.model,
    unit: d.unit,
    usdPerUnit: d.usd,
    creditsPerUnit: ruleCreditsPerUnit(d.usd, econ),
    validFrom: d.validFrom ?? DRAFT_VALID_FROM,
    validTo: d.validTo ?? null,
    sourceUrl: VERTEX_PRICING_URL,
    fetchedAt: DRAFT_FETCHED_AT,
    approvedBy: null,
    promo: false,
  }));
}

/** The page line each draft was read from (for the review list). */
export const draftNote = (id: string): string => RAW.find((d) => d.id === id)?.note ?? '';

/** Not drafted, and why (shown to GG with the list). */
export const NOT_DRAFTED: readonly { what: string; why: string }[] = [
  { what: 'gemini-embedding-001', why: 'not named on the page; the "Gemini Embedding" line is $0.00015 per 1,000 characters. Memory embeddings cost a fraction of a credit a day, so they stay inside the plan price; drafting a row would only add noise. Say if you want one.' },
  { what: 'Chirp 3 speech-to-text, Cloud TTS (read-aloud fallback)', why: 'on the Cloud Speech pricing pages, not this one. Next batch, from those pages.' },
  { what: 'Vercel sandbox (code run, browser)', why: 'not a Google price; it stays on the $20 sandbox ledger.' },
];

/** One INSERT per draft (approved_by left null). For review only: GG runs it, after the Phase 5 migration, on staging first. */
export function draftInsertSql(rows: readonly PriceVersion[]): string {
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const lines = rows.map(
    (r) =>
      `  (${q(r.id)}, ${q(r.capability)}, ${q(r.model)}, ${q(r.unit)}, ${r.usdPerUnit}, ${r.creditsPerUnit}, ${q(r.validFrom)}, ${r.validTo === null ? 'null' : q(r.validTo)}, ${q(r.sourceUrl)}, ${q(r.fetchedAt)}, ${r.promo}, ${q(draftNote(r.id))})`,
  );
  return [
    'insert into public.price_versions (id, capability, model, unit, usd_per_unit, credits_per_unit, valid_from, valid_to, source_url, fetched_at, promo, note)',
    'values',
    lines.join(',\n'),
    'on conflict (id) do nothing;',
  ].join('\n');
}

/** The seed file docs/v5.1-phase5/seed/20261113b_price_drafts.sql (a test keeps the committed file equal to this). */
export function draftSeedFile(rows: readonly PriceVersion[] = priceDrafts()): string {
  return [
    '-- DRAFT price rows for public.price_versions (v5.1 Phase 5). GENERATED from lib/billing/v5/priceDrafts.ts:',
    '-- edit the .ts file and run WRITE_PRICE_DRAFTS=1 npx jest lib/billing/v5/priceDrafts.files, never this file by hand.',
    '-- STATUS: PREPARED, NOT APPLIED, NOT APPROVED. Every row is a draft (approved_by null) and prices nothing until GG',
    '-- approves it. Run only after 20261114a_phase5_money.sql, on staging first (D-14). Re-runnable (on conflict do nothing).',
    `-- Source: ${VERTEX_PRICING_URL} read ${DRAFT_FETCHED_AT}.`,
    'begin;',
    draftInsertSql(rows),
    'commit;',
    '',
  ].join('\n');
}

/** The review list docs/v5.1-phase5/price-drafts.md (a test keeps the committed file equal to this). */
export function draftReviewMarkdown(rows: readonly PriceVersion[] = priceDrafts()): string {
  return [
    '# Draft price rows for GG to approve, one by one',
    '',
    `**Status: DRAFTS. None is approved, so none prices anything.** Source: [Vertex AI generative AI pricing](${VERTEX_PRICING_URL}), read ${DRAFT_FETCHED_AT}. Generated from \`lib/billing/v5/priceDrafts.ts\`; the SQL is \`seed/20261113b_price_drafts.sql\`.`,
    '',
    '## How these were priced',
    '',
    '- **USD** is the price Google bills, exactly as the page lists it.',
    '- **Full price, not the promo.** 3.8 Flash, 3.8 Flash TTS, Argon and Carbon show a lower "introductory" price that Google gives as *50 % credits back on net spend*. The invoice and the billing export carry the full price, so the drafts use it. Users then see no price jump on 2026-12-01 (Argon, Carbon) or 2027-01-01 (3.8 Flash), and the credits back is extra margin while it lasts. If you would rather pass the promo on to users, say so and these rows get redrafted as promo rows with end dates.',
    '- **Credits per unit** is the smallest value (4 decimals) that meets your rule: 100 % profit over full cost, with the 5 % FX reserve and the 3 % card fee counted. 1 credit = 0.10 ₾, $1 = 2.7 ₾. So $1 of Google cost = 60.3192 credits.',
    '- Argon and Carbon are drafted because their price is now known. D-06 still keeps both models off; approving their rows does not turn them on.',
    '',
    '## Rows',
    '',
    '| # | id | capability | model | unit | USD / unit | credits / unit | page line |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map((r, i) => `| ${i + 1} | \`${r.id}\` | ${r.capability} | ${r.model} | ${r.unit} | $${r.usdPerUnit} | ${r.creditsPerUnit} | ${draftNote(r.id)} |`),
    '',
    '## Not drafted',
    '',
    ...NOT_DRAFTED.map((n) => `- **${n.what}:** ${n.why}`),
    '',
    '## Approving one row (after the migration and the seed, staging first)',
    '',
    'Approval is one row at a time. It starts the price at the moment of approval. After that the row can never be edited or deleted, only ended with `valid_to`:',
    '',
    '```sql',
    "update public.price_versions set valid_from = now(), approved_by = 'GG', approved_at = now()",
    "where id = 'pv_text_38flash_out' and approved_by is null;",
    '```',
    '',
    "Nothing reads approved rows while `AGENT_PRICE_BOOK` is `off`. In `shadow`, each quote is also priced from the book and only the difference is logged; the user still pays today's price.",
    '',
  ].join('\n');
}
