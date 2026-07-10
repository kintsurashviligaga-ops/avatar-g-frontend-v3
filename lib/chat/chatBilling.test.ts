/** @jest-environment node */
/**
 * DAY-6 — chat-generation billing map. Verifies that the standalone chat generations that were previously FREE
 * now resolve the correct credit cost (charged via deduct_credits, the balance-of-record RPC). Video is 0 here
 * on purpose — real video renders through the film-composite pipeline, which already debits per clip.
 */
import { billableCreditCost } from './chatBilling';
import { CREDIT_COSTS } from '@/lib/credits/pricing';

describe('billableCreditCost — chat generations now charge the balance-of-record', () => {
  it('image + photo-edit cost the image credit price', () => {
    expect(billableCreditCost('image_generation')).toBe(CREDIT_COSTS.image_generate); // 2
    expect(billableCreditCost('photo_edit')).toBe(CREDIT_COSTS.image_generate);
  });
  it('avatar costs the avatar credit price', () => {
    expect(billableCreditCost('avatar_generation')).toBe(CREDIT_COSTS.avatar_30s); // 20
  });
  it('music costs the 30s music credit price', () => {
    expect(billableCreditCost('music_generation')).toBe(CREDIT_COSTS.music_30s); // 5
  });
  it('video is 0 here (the film-composite pipeline already charges per clip) + text/other are free', () => {
    expect(billableCreditCost('video_generation')).toBe(0);
    expect(billableCreditCost('text_chat')).toBe(0);
  });
  it('every billable cost is a positive integer (deduct_credits p_amount is integer credits)', () => {
    for (const i of ['image_generation', 'photo_edit', 'avatar_generation', 'music_generation'] as const) {
      const c = billableCreditCost(i);
      expect(c).toBeGreaterThan(0);
      expect(Number.isInteger(c)).toBe(true);
    }
  });
});
