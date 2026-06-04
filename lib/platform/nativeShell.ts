/**
 * lib/platform/nativeShell.ts
 * ===========================
 * Detects whether the web app is running inside the MyAvatar **native iOS
 * shell** (the Capacitor wrapper that loads myavatar.ge) versus a normal
 * browser.
 *
 * Why this exists — Apple App Store Guideline 3.1.1: digital content/credits
 * consumed in-app may only be sold through Apple IAP. Our credits are bought
 * via Stripe on the web, so when the SAME web app is displayed inside the iOS
 * shell every external-purchase entry point (top-up, pricing CTAs, wallet
 * refill) must be hidden. In a real browser, Stripe stays fully available.
 *
 * The actual hiding is done declaratively: an inline boot script in the root
 * layout sets `data-native-ios="1"` on <html>, and a global CSS rule hides any
 * element tagged `data-iap-external`. This module is the JS counterpart for the
 * occasional case that needs the boolean in code (e.g. to no-op a handler).
 *
 * Detection (belt + suspenders, all client-only):
 *   1. Capacitor's injected bridge — `Capacitor.isNativePlatform()` +
 *      `getPlatform() === 'ios'`.
 *   2. A custom user-agent token ("MyAvatarApp") appended by the Capacitor iOS
 *      config — the reliable signal for a remote-loaded webview.
 */
import { useEffect, useState } from 'react';

interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

/** True only inside the native iOS shell. SSR-safe (returns false on server). */
export function isNativeIOSShell(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const cap = (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
    if (cap?.isNativePlatform?.() && cap.getPlatform?.() === 'ios') return true;
    const ua = navigator.userAgent || '';
    return /iPhone|iPad|iPod/i.test(ua) && /MyAvatarApp/i.test(ua);
  } catch {
    return false;
  }
}

/**
 * React hook form. Returns false during SSR and the first client render (so
 * markup matches and there's no hydration mismatch), then flips to the real
 * value after mount. Pair with the CSS mechanism for flash-free hiding.
 */
export function useIsNativeIOSShell(): boolean {
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(isNativeIOSShell());
  }, []);
  return native;
}
