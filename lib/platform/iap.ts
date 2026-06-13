'use client';

/**
 * lib/platform/iap.ts — client-side StoreKit / IAP bridge.
 *
 * Drives a Capacitor in-app-purchase plugin (StoreKit on iOS) and posts the
 * resulting receipt to /api/iap/apple/verify for server-side verification + wallet
 * crediting. Plugin-AGNOSTIC and safe: in a normal browser, or in the native shell
 * before an IAP plugin is installed, `purchase()` returns a clear, NON-throwing
 * result so callers can fall back (e.g. keep the web Stripe flow on non-iOS).
 *
 * The native half — installing the plugin and creating App Store Connect products —
 * is documented in docs/IAP_STOREKIT_SETUP.md. Until that is done, this module
 * no-ops gracefully and the app stays in its current compliant state (iOS purchase
 * CTAs hidden via the data-iap-external CSS rule).
 */
import { isNativeIOSShell } from './nativeShell';

export interface IapPurchaseResult {
  ok: boolean;
  /** Why it didn't complete — lets callers choose a fallback. */
  reason?: 'not-native' | 'no-plugin' | 'cancelled' | 'verify-failed' | 'error';
  creditedGel?: number;
  balanceGel?: number;
}

// Minimal duck-typed shape of a Capacitor IAP plugin. The concrete plugin is the
// integrator's choice (RevenueCat, cordova-plugin-purchase via Capacitor, or a
// thin custom StoreKit 2 plugin) — we only depend on a `purchase` that returns the
// app receipt + transaction id. Adapt the key in getPlugin() to the chosen plugin.
interface IapPlugin {
  purchase?: (opts: { productId: string }) => Promise<{ receipt?: string; transactionId?: string } | undefined>;
}

function getPlugin(): IapPlugin | null {
  if (typeof window === 'undefined') return null;
  const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  const plugin = cap?.Plugins?.['InAppPurchases'] ?? cap?.Plugins?.['InAppPurchase'] ?? null;
  return (plugin as IapPlugin | null) ?? null;
}

/** True only when an IAP purchase path is actually available (iOS shell + plugin). */
export function isIapAvailable(): boolean {
  const p = getPlugin();
  return isNativeIOSShell() && p != null && typeof p.purchase === 'function';
}

/**
 * Run a StoreKit purchase for `productId`, then verify + credit server-side.
 * Never throws — always resolves to an IapPurchaseResult.
 */
export async function purchase(productId: string): Promise<IapPurchaseResult> {
  if (!isNativeIOSShell()) return { ok: false, reason: 'not-native' };
  const plugin = getPlugin();
  if (!plugin?.purchase) return { ok: false, reason: 'no-plugin' };
  try {
    const res = await plugin.purchase({ productId });
    if (!res?.receipt) return { ok: false, reason: 'cancelled' };
    const verify = await fetch('/api/iap/apple/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ receipt: res.receipt, productId, transactionId: res.transactionId }),
    });
    const j = (await verify.json().catch(() => ({}))) as { success?: boolean; creditedGel?: number; balanceGel?: number };
    if (verify.ok && j.success) return { ok: true, creditedGel: j.creditedGel, balanceGel: j.balanceGel };
    return { ok: false, reason: 'verify-failed' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
