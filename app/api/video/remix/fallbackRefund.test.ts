/** @jest-environment node */
/**
 * A local still-pan fallback must not be billed as a generated video.
 *
 * ⚠️ THE BUG THIS GUARDS WAS HIDING BEHIND A TRUTHY VALUE. Both branches read
 *
 *     const url = animated || (await kenBurnsClip(...));
 *     if (!url) return failRefund(...);
 *
 * so the refund only ever fired when even ffmpeg failed. When the paid engines missed and kenBurnsClip
 * answered, `url` was truthy, the request "succeeded", and the user paid the full price — 25–45 credits
 * for a product ad, 15 for restyle / character / background_remove — for a slow pan over one of their own
 * frames. The route's own comments already said the fallback "is not the same product" and that it costs
 * "the full price of a video ad"; the invoice just never agreed.
 *
 * Structural, not behavioural: the handler is ~900 lines behind a dozen provider imports. What this
 * catches is the refund being removed or the guard being narrowed, which is exactly how it got here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, 'route.ts'), 'utf8');

/** The paid ops that can silently fall through to a local Ken-Burns pan. */
const FALLBACK_SITES = [
  { name: 'productad', anchor: "failRefund('Product ad generation failed.', 'render-null')" },
  { name: 'restyle / character / background_remove', anchor: "const method = animated ? 'reanimated' : 'stillPan'" },
];

describe('Ken-Burns fallback is not charged', () => {
  it.each(FALLBACK_SITES)('$name refunds when no generative engine ran', ({ anchor }) => {
    const at = src.indexOf(anchor);
    expect(at).toBeGreaterThan(-1); // the branch still exists
    // The refund must sit in the same neighbourhood as the fallback, keyed off `animated` being null —
    // not off `url`, which is truthy precisely in the case that leaks.
    const window = src.slice(Math.max(0, at - 900), at + 900);
    expect(window).toMatch(/if \(!animated\) await refundCharge\('fallback-kenburns'\)/);
  });

  it('uses the route’s existing idempotent refund, not a second ledger call', () => {
    // refundCharge guards on an in-request `refunded` flag AND a single `${txnRef}:refund` ref, so a
    // request that falls back and then fails later cannot refund twice.
    expect(src).toMatch(/const r = await refundCredits\(remixUid, chargeAmount, `\$\{txnRef\}:refund`\)/);
    expect(src).toMatch(/if \(!charged \|\| refunded \|\| !remixUid\) return;/);
  });

  it('still delivers the clip — the fallback is free, not withheld', () => {
    // Refunding by failing the request would take away a usable asset the user can still want.
    for (const { anchor } of FALLBACK_SITES) {
      const at = src.indexOf(anchor);
      const window = src.slice(at, at + 400);
      expect(window).not.toMatch(/if \(!animated\) return failRefund/);
    }
  });
});

describe('the product-ad is filed into the Library', () => {
  it('returns through finishAd, not a bare ok()', () => {
    // ⚠️ productad IS in PERSIST_OPS, but the persistence lives in finishOk() — declared ~70 lines BELOW
    // the productad block, so it is in the temporal dead zone there and could never have been called.
    // The ad is one of the most expensive things this route sells (25–45 credits) and it existed only as
    // a URL in a live HTTP response: a dropped socket lost the paid asset outright, unrefunded.
    const block = src.slice(src.indexOf('Product ad generation failed.'), src.indexOf('const videoUrl = await resolveMedia'));
    expect(block).toContain('const finishAd = async');
    expect(block).toContain('recordCompletedFilm');
    // Every exit from the branch must go through it.
    expect(block).not.toMatch(/return ok\(url, \{ engine: adEngine/);
    expect(block).not.toMatch(/return ok\(scored, \{ engine: adEngine/);
  });
});
