/**
 * lib/iap/appleProducts.ts — Apple In-App Purchase product catalogue.
 *
 * Maps each App Store Connect product identifier to what it grants in-app. These
 * IDs MUST match the consumable products you create in App Store Connect
 * (see docs/IAP_STOREKIT_SETUP.md). Each credit pack grants GEL wallet credit via
 * the same ledger the web Stripe top-up uses.
 *
 * ⚠️ The IDs + amounts below are PLACEHOLDERS — replace them with your real App
 * Store Connect product IDs and the GEL value you sell each pack for.
 */
export interface AppleProduct {
  /** App Store Connect product identifier (reverse-DNS, must match exactly). */
  productId: string;
  kind: 'credits';
  /** GEL credited to the user's wallet on a verified purchase. */
  creditsGel: number;
  /** Human label — logs / future UI only. */
  label?: string;
}

export const APPLE_PRODUCTS: Record<string, AppleProduct> = {
  'ge.myavatar.app.credits.10': { productId: 'ge.myavatar.app.credits.10', kind: 'credits', creditsGel: 10, label: '10 ₾ credit pack' },
  'ge.myavatar.app.credits.25': { productId: 'ge.myavatar.app.credits.25', kind: 'credits', creditsGel: 25, label: '25 ₾ credit pack' },
  'ge.myavatar.app.credits.50': { productId: 'ge.myavatar.app.credits.50', kind: 'credits', creditsGel: 50, label: '50 ₾ credit pack' },
  'ge.myavatar.app.credits.100': { productId: 'ge.myavatar.app.credits.100', kind: 'credits', creditsGel: 100, label: '100 ₾ credit pack' },
};

export function lookupAppleProduct(productId: string): AppleProduct | null {
  return APPLE_PRODUCTS[productId] ?? null;
}
