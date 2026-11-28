/** Phase 8.25: the v8 credits sheet's literals stay equal to the margin engine. */
import { PLANS, TOPUPS, planUsd, whatYouGet } from '@/lib/billing/margin/packages';
import { BOG_PLAN_OFFERS_V8 } from '@/lib/billing/margin/bogV8';
import { v8BonusLabel, v8SheetPlans, v8TopupSplit, v8TopupSuccessText } from './sheet';

describe('v8 credits sheet', () => {
  test('four paid plans, in order, with the engine’s credits, $ and what-you-get', () => {
    const plans = v8SheetPlans('en');
    expect(plans.map((p) => p.planId)).toEqual(['start', 'creator', 'pro', 'business']);
    for (const p of plans) {
      const src = PLANS.find((x) => x.id === p.planId)!;
      expect(p.amountGel).toBe(src.priceGel);
      expect(p.credits).toBe(src.credits);
      expect(p.usd).toBe(planUsd(src).toFixed(2));
      const w = whatYouGet(src.credits);
      expect(p.gets).toEqual([`${w.videos8s720} videos (8 s, 720p)`, `or ${w.images1k} images (1K)`, `or ${w.songs} songs`]);
      expect(p.name).toBe(src.name.en);
    }
    expect(plans.filter((p) => p.popular).map((p) => p.planId)).toEqual(['pro']);
    expect(BOG_PLAN_OFFERS_V8).toHaveLength(4);
  });

  test('Georgian and Russian lines say "ან" / "или"', () => {
    expect(v8SheetPlans('ka')[2].gets).toEqual(['23 ვიდეო (8 წმ, 720p)', 'ან 193 სურათი (1K)', 'ან 140 სიმღერა']);
    expect(v8SheetPlans('ru')[2].gets[1]).toBe('или 193 изображений (1K)');
    expect(v8SheetPlans('ka')[1].name).toBe('კრეატორი');
  });

  test('top-up split and bonus label match TOPUPS', () => {
    for (const t of TOPUPS) {
      const s = v8TopupSplit(t.priceGel);
      expect(s.total).toBe(t.credits);
      expect(s.base + s.bonus).toBe(t.credits);
    }
    expect(v8TopupSplit(100)).toEqual({ base: 1000, bonus: 100, total: 1100 });
    expect(v8BonusLabel(100, 'ka')).toBe('+100 ბონუსი');
    expect(v8BonusLabel(10, 'ka')).toBe('');
  });

  test('success toast: the order API’s 1000 becomes "1,100 (1,000 + 100 bonus)"', () => {
    expect(v8TopupSuccessText(1000, 'ka')).toBe('გადახდა მიღებულია — დაემატა 1,100 კრედიტი (1,000 + 100 ბონუსი).');
    expect(v8TopupSuccessText(1000, 'en')).toBe('Payment received — 1,100 credits added (1,000 + 100 bonus).');
    expect(v8TopupSuccessText(250, 'ru')).toContain('260');
    expect(v8TopupSuccessText(100, 'en')).toBeNull(); // 10 ₾ has no bonus
    expect(v8TopupSuccessText(370, 'en')).toBeNull(); // not a pack
  });
});
