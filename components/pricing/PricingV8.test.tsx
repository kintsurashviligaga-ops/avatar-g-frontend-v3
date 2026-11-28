/** @jest-environment node */
/** Phase 8.1: the v8 pricing page shows the engine's numbers and only user-facing actions. */
import { renderToStaticMarkup } from 'react-dom/server';
import { PricingV8, topupSplit } from './PricingV8';
import { RU_PERK, RU_PLAN_NAME, RU_ROW, RU_SERVICE, RU_UNIT } from './pricingV8Ru';
import { PLANS, TOPUPS } from '@/lib/billing/margin/packages';
import { priceList, USER_FACING_IDS } from '@/lib/billing/margin/catalog';
import { priceOf } from '@/lib/billing/margin/catalog';

describe('PricingV8', () => {
  test('English: plans with “what you get”, top-ups, per-action credits from the price list, no-hidden-fees block', () => {
    const html = renderToStaticMarkup(<PricingV8 locale="en" />);
    expect(html).toContain('129 ₾');
    expect(html).toContain('✦ 1,550');
    expect(html).toContain('>23</span> 8 s videos (720p)'); // Pro
    expect(html).toContain(`✦ ${priceOf('video.omni.720p.8s').credits}`);
    expect(html).toContain('Top up credits');
    expect(html).toContain('No hidden fees');
    expect(html).not.toContain('chat.message'); // internal rows stay internal
  });

  test('Georgian copy on the ka page', () => {
    const html = renderToStaticMarkup(<PricingV8 locale="ka" />);
    expect(html).toContain('დამალული საფასურის გარეშე');
    expect(html).toContain('/თვე');
  });

  // Phase 8.25 — "23 videos OR 193 images", no "0 videos" on Free, the top-up bonus spelled out, and a Russian page.
  test('"what you get" lines are alternatives: the second line on starts with "or" / "ან"', () => {
    const en = renderToStaticMarkup(<PricingV8 locale="en" />);
    expect(en).toContain('>23</span> 8 s videos (720p)');
    expect(en).toContain('>or </span><span class="font-semibold tabular-nums">193</span> images (1K)');
    const ka = renderToStaticMarkup(<PricingV8 locale="ka" />);
    expect(ka).toContain('>ან </span><span class="font-semibold tabular-nums">193</span>');
  });

  test('the Free plan does not promise "0 videos"', () => {
    const en = renderToStaticMarkup(<PricingV8 locale="en" />);
    expect(en).not.toMatch(/>0<\/span> 8 s videos/);
  });

  test('top-ups show base + bonus: 100 ₾ is 1,000 + 100 bonus', () => {
    expect(topupSplit({ priceGel: 100, credits: 1100 })).toEqual({ base: 1000, bonus: 100 });
    expect(topupSplit({ priceGel: 10, credits: 100 })).toEqual({ base: 100, bonus: 0 });
    for (const t of TOPUPS) {
      const { base, bonus } = topupSplit(t);
      expect(base + bonus).toBe(t.credits);
    }
    const en = renderToStaticMarkup(<PricingV8 locale="en" />);
    expect(en).toContain('1,000 + 100 bonus (+10 %)');
    const ka = renderToStaticMarkup(<PricingV8 locale="ka" />);
    expect(ka).toContain('1,000 + 100 ბონუსი (+10 %)');
  });

  test('Russian page: Russian copy, plan names, rows and units, no English left', () => {
    const ru = renderToStaticMarkup(<PricingV8 locale="ru" />);
    expect(ru).toContain('Без скрытых платежей');
    expect(ru).toContain('Креатор');
    expect(ru).toContain('>или </span>');
    expect(ru).toContain('1,000 + 100 бонус (+10 %)');
    expect(ru).not.toContain('No hidden fees');
    expect(ru).not.toContain('Top up credits');
    expect(ru).not.toContain('Most popular');
  });

  test('every visible plan, perk, row, unit and service has a Russian entry', () => {
    for (const p of PLANS) {
      expect(RU_PLAN_NAME[p.id]).toBeTruthy();
      for (const perk of p.perks) expect([perk.en, RU_PERK[perk.en]]).toEqual([perk.en, expect.any(String)]);
    }
    for (const r of priceList().filter((x) => USER_FACING_IDS.has(x.id))) {
      expect([r.id, RU_ROW[r.id]]).toEqual([r.id, expect.any(String)]);
      expect([r.unit.en, RU_UNIT[r.unit.en]]).toEqual([r.unit.en, expect.any(String)]);
      expect([r.service, RU_SERVICE[r.service]]).toEqual([r.service, expect.any(String)]);
    }
  });
});
