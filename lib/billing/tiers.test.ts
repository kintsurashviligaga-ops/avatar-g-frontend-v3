/** @jest-environment node */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHAT_MODE_IDS } from '@/lib/chat/chatModes';
import { CREDIT_COSTS } from '@/lib/credits/pricing';
import {
  LONG_FORM_THRESHOLD_SECONDS,
  PAID_TIER_IDS,
  TIERS,
  TIER_IDS,
  TIER_LIST,
  TRIAL,
  allowsChatMode,
  allowsVeoTier,
  canUseLongForm,
  higherTier,
  isPaidTierId,
  isTierId,
  maxVideoSecondsForTier,
  monthlyAllowanceCredits,
  priceIdForTier,
  proDailyCeiling,
  proDailyLimitForTier,
  tierById,
  tierCreditPool,
  tierFromProfileTier,
  tierFromStripePriceId,
} from './tiers';

const PRICES = {
  STRIPE_PRICE_STARTER: 'price_starter_m',
  STRIPE_PRICE_CREATOR: 'price_creator_m',
  STRIPE_PRICE_BUSINESS: 'price_business_m',
};

describe('the catalogue', () => {
  it('has exactly free < starter < creator < business, each keyed by its own id with rank = position', () => {
    expect(TIER_IDS).toEqual(['free', 'starter', 'creator', 'business']);
    expect(PAID_TIER_IDS).toEqual(['starter', 'creator', 'business']);
    TIER_IDS.forEach((id, i) => {
      expect(TIERS[id].id).toBe(id);
      expect(TIERS[id].rank).toBe(i);
    });
    expect(TIER_LIST.map((t) => t.id)).toEqual(TIER_IDS);
  });

  it('carries today’s live prices and credit pools, renamed (basic→starter, pro→creator)', () => {
    expect(TIER_LIST.map((t) => [t.id, t.monthlyPriceUsd, t.includedCredits])).toEqual([
      ['free', 0, 50],
      ['starter', 19.99, 230],
      ['creator', 39.99, 525],
      ['business', 79.99, 1200],
    ]);
  });

  it('derives every credit total from its ceiling — no hard-coded pool that can drift from media costs', () => {
    for (const t of TIER_LIST) expect(t.includedCredits).toBe(tierCreditPool(t.creditCeiling));
    expect(tierCreditPool({ videos: 1, music: 0, images: 0 })).toBe(CREDIT_COSTS.video_30s);
  });

  it('names every tier in Georgian, English and Russian (Business is "Business / Agency")', () => {
    for (const t of TIER_LIST) {
      for (const l of ['ka', 'en', 'ru'] as const) expect(t.names[l].trim().length).toBeGreaterThan(0);
    }
    expect(TIERS.business.names.en).toBe('Business / Agency');
  });

  it('pins the per-tier Pro allowance, templates, video caps, Veo tiers and priority', () => {
    expect(TIER_LIST.map((t) => t.chat.proDaily)).toEqual([5, 20, 100, 300]);
    expect(TIER_LIST.map((t) => t.premiumTemplates)).toEqual([false, false, true, true]);
    expect(TIER_LIST.map((t) => t.video.maxSeconds)).toEqual([8, 24, 48, 240]);
    expect(TIER_LIST.map((t) => t.video.longForm)).toEqual([false, false, false, true]);
    expect(TIER_LIST.map((t) => t.priority)).toEqual([false, false, false, true]);
    // The free film renders on Fast at most (filmComposite already enforces this); Standard is a paid feature.
    expect(TIERS.free.video.veoTiers).not.toContain('standard');
    expect(TIERS.starter.video.veoTiers).not.toContain('standard');
    expect(TIERS.creator.video.veoTiers).toContain('standard');
  });

  it('never gives a lower tier more of anything than a higher one', () => {
    for (let i = 1; i < TIER_LIST.length; i += 1) {
      const lo = TIER_LIST[i - 1]!;
      const hi = TIER_LIST[i]!;
      expect(hi.monthlyPriceUsd).toBeGreaterThan(lo.monthlyPriceUsd);
      expect(hi.includedCredits).toBeGreaterThan(lo.includedCredits);
      expect(hi.chat.proDaily).toBeGreaterThanOrEqual(lo.chat.proDaily);
      expect(hi.video.maxSeconds).toBeGreaterThanOrEqual(lo.video.maxSeconds);
      for (const v of lo.video.veoTiers) expect(hi.video.veoTiers).toContain(v);
      for (const m of lo.chat.modes) expect(hi.chat.modes).toContain(m);
    }
  });

  it('every tier offers real chat modes, and a tier that lists Pro has a Pro allowance', () => {
    for (const t of TIER_LIST) {
      for (const m of t.chat.modes) expect(CHAT_MODE_IDS).toContain(m);
      if (t.chat.modes.includes('pro')) expect(t.chat.proDaily).toBeGreaterThan(0);
    }
  });

  it('long-form is exactly the tiers whose max exceeds the short-film threshold', () => {
    for (const t of TIER_LIST) expect(t.video.longForm).toBe(t.video.maxSeconds > LONG_FORM_THRESHOLD_SECONDS);
  });

  it('only paid tiers have a Stripe price env, one distinct name each', () => {
    expect(TIERS.free.stripePriceEnv).toBeNull();
    expect(PAID_TIER_IDS.map((id) => TIERS[id].stripePriceEnv)).toEqual([
      'STRIPE_PRICE_STARTER',
      'STRIPE_PRICE_CREATOR',
      'STRIPE_PRICE_BUSINESS',
    ]);
  });
});

describe('TRIAL — documents the grants that already exist', () => {
  it('is the free tier: 50 credits, one free film no longer than the free tier’s max, free text chat', () => {
    expect(TRIAL.tier).toBe('free');
    expect(TRIAL.signupCredits).toBe(TIERS.free.includedCredits);
    expect(TRIAL.freeFilms).toBe(TIERS.free.creditCeiling.videos);
    expect(TRIAL.freeFilmMaxSeconds).toBe(maxVideoSecondsForTier('free'));
    expect(TRIAL.textChatCredits).toBe(CREDIT_COSTS.chat_message);
    expect(TRIAL.expiresAfterDays).toBeNull();
  });

  it('matches the live signup trigger and column defaults recorded in the migrations', () => {
    const mig = (f: string) => readFileSync(join(__dirname, '..', '..', 'supabase', 'migrations', f), 'utf8');
    // The 50-credit signup grant, booked through the ledger with kind signup_bonus.
    expect(mig('20260802c_unified_free_trial.sql')).toMatch(/VALUES \(NEW\.id, 50, 'purchase'/);
    expect(mig('20260802c_unified_free_trial.sql')).toContain(`'kind', '${TRIAL.ledgerKind}'`);
    // One free film.
    expect(mig('20260802c_unified_free_trial.sql')).toMatch(/free_films_remaining SET DEFAULT 1;/);
  });

  it('never renews: the free tier has no monthly allowance for a webhook to grant', () => {
    expect(TIERS.free.creditCadence).toBe('trial_once');
    expect(monthlyAllowanceCredits('free')).toBe(0);
  });
});

describe('tierById / isTierId / higherTier', () => {
  it('resolves known ids and falls back to FREE (least privilege) for anything else', () => {
    expect(tierById('creator').id).toBe('creator');
    for (const junk of [undefined, null, '', 'pro', 'CREATOR', 'admin', 'business ']) {
      expect(tierById(junk).id).toBe('free');
    }
    expect(isTierId('starter')).toBe(true);
    expect(isTierId('basic')).toBe(false);
    expect(isPaidTierId('free')).toBe(false);
    expect(isPaidTierId('business')).toBe(true);
  });

  it('picks the higher-ranked tier', () => {
    expect(higherTier('starter', 'creator')).toBe('creator');
    expect(higherTier('business', 'free')).toBe('business');
    expect(higherTier('free', 'free')).toBe('free');
  });

  it('monthly allowance = the tier’s included credits for paid tiers', () => {
    expect(PAID_TIER_IDS.map((id) => monthlyAllowanceCredits(id))).toEqual([230, 525, 1200]);
    expect(monthlyAllowanceCredits('nonsense')).toBe(0);
  });
});

describe('Stripe price ids (inert until the env is set)', () => {
  it('nothing resolves with no env — no price, no tier', () => {
    for (const id of TIER_IDS) expect(priceIdForTier(id, {})).toBeNull();
    expect(tierFromStripePriceId('price_starter_m', {})).toBeNull();
  });

  it('resolves both directions once configured, trimming whitespace', () => {
    expect(priceIdForTier('creator', PRICES)).toBe('price_creator_m');
    expect(priceIdForTier('free', PRICES)).toBeNull();
    expect(tierFromStripePriceId('price_business_m', PRICES)).toBe('business');
    expect(tierFromStripePriceId('  price_starter_m ', { STRIPE_PRICE_STARTER: ' price_starter_m\n' })).toBe('starter');
  });

  it('refuses unknown, blank and AMBIGUOUS price ids', () => {
    expect(tierFromStripePriceId('price_other', PRICES)).toBeNull();
    expect(tierFromStripePriceId('', PRICES)).toBeNull();
    expect(tierFromStripePriceId(null, PRICES)).toBeNull();
    expect(tierFromStripePriceId('   ', { STRIPE_PRICE_STARTER: '   ' })).toBeNull();
    // The same price pasted into two vars must not resolve to either — guessing would grant the bigger allowance.
    expect(tierFromStripePriceId('price_x', { STRIPE_PRICE_STARTER: 'price_x', STRIPE_PRICE_BUSINESS: 'price_x' })).toBeNull();
  });

  it('ignores the legacy STRIPE_PRICE_PRO entirely', () => {
    expect(tierFromStripePriceId('price_legacy_pro', { STRIPE_PRICE_PRO: 'price_legacy_pro' })).toBeNull();
  });
});

describe('proDailyLimitForTier — the tier allowance under the operator ceiling', () => {
  it('uses the tier allowance when CHAT_PRO_DAILY_LIMIT is unset', () => {
    expect(TIER_IDS.map((id) => proDailyLimitForTier(id, {}))).toEqual([5, 20, 100, 300]);
  });

  it('treats the env as a CEILING, never a raise', () => {
    expect(TIER_IDS.map((id) => proDailyLimitForTier(id, { CHAT_PRO_DAILY_LIMIT: '50' }))).toEqual([5, 20, 50, 50]);
    expect(proDailyLimitForTier('free', { CHAT_PRO_DAILY_LIMIT: '1000' })).toBe(5);
  });

  it('0 turns Pro off for every tier', () => {
    expect(TIER_IDS.map((id) => proDailyLimitForTier(id, { CHAT_PRO_DAILY_LIMIT: '0' }))).toEqual([0, 0, 0, 0]);
  });

  it('ignores a malformed or out-of-range ceiling (same parse as chatProUserLimit)', () => {
    for (const raw of ['', '  ', '20/day', '-1', '2.5', '10001', '9999999', 'abc']) {
      expect(proDailyCeiling({ CHAT_PRO_DAILY_LIMIT: raw })).toBeNull();
      expect(proDailyLimitForTier('business', { CHAT_PRO_DAILY_LIMIT: raw })).toBe(300);
    }
    expect(proDailyCeiling({ CHAT_PRO_DAILY_LIMIT: ' 10000 ' })).toBe(10_000);
  });

  it('an unknown tier gets the free allowance', () => {
    expect(proDailyLimitForTier('enterprise', {})).toBe(5);
  });
});

describe('video length gates', () => {
  it('maxVideoSecondsForTier — 8 / 24 / 48 / 240, unknown → free', () => {
    expect(TIER_IDS.map((id) => maxVideoSecondsForTier(id))).toEqual([8, 24, 48, 240]);
    expect(maxVideoSecondsForTier(undefined)).toBe(8);
  });

  it('canUseLongForm — fits the tier max, and only business goes past the short-film threshold', () => {
    expect(canUseLongForm('free', 8)).toBe(true);
    expect(canUseLongForm('free', 8.5)).toBe(false);
    expect(canUseLongForm('starter', 24)).toBe(true);
    expect(canUseLongForm('starter', 48)).toBe(false);
    expect(canUseLongForm('creator', 48)).toBe(true);
    expect(canUseLongForm('creator', 49)).toBe(false);
    expect(canUseLongForm('business', 120)).toBe(true);
    expect(canUseLongForm('business', 240)).toBe(true);
    expect(canUseLongForm('business', 241)).toBe(false);
  });

  it('refuses a length it cannot trust', () => {
    for (const s of [0, -8, Number.NaN, Number.POSITIVE_INFINITY]) expect(canUseLongForm('business', s)).toBe(false);
    expect(canUseLongForm('business', '60' as unknown as number)).toBe(false);
  });

  it('allowsChatMode / allowsVeoTier read the catalogue', () => {
    expect(allowsChatMode('free', 'pro')).toBe(true);
    expect(allowsVeoTier('free', 'standard')).toBe(false);
    expect(allowsVeoTier('business', 'standard')).toBe(true);
  });
});

describe('tierFromProfileTier — the hand-set comp column', () => {
  it('maps the live uppercase vocabulary and the new tier names, case-insensitively', () => {
    expect(tierFromProfileTier('FREE')).toBe('free');
    expect(tierFromProfileTier('PRO')).toBe('creator');
    expect(tierFromProfileTier('STUDIO')).toBe('business');
    expect(tierFromProfileTier('ENTERPRISE')).toBe('business');
    expect(tierFromProfileTier('STARTER')).toBe('starter');
    expect(tierFromProfileTier(' creator ')).toBe('creator');
    expect(tierFromProfileTier('Business')).toBe('business');
  });

  it('anything unrecognised is free', () => {
    for (const v of [null, undefined, '', 'GOD', 42, {}]) expect(tierFromProfileTier(v)).toBe('free');
  });
});

describe('isomorphic', () => {
  it('imports nothing server-only and reads no env at import time', () => {
    // Comments stripped first — the module's own docs mention process.env and must not trip (or satisfy) this.
    const src = readFileSync(join(__dirname, 'tiers.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/[^\n]*/g, '$1');
    expect(src).not.toMatch(/from ['"]server-only['"]|import ['"]server-only['"]/);
    expect(src).not.toMatch(/process\.env/);
    expect(src).not.toMatch(/@\/lib\/supabase|from ['"]stripe['"]/);
  });
});
