# StoreKit / Apple In-App Purchase — Setup & Handoff

This document explains the IAP situation for the MyAvatar iOS app and the exact
steps to enable Apple In-App Purchases. **The web + server groundwork is already
in this repo;** the remaining work is native (Xcode) + App Store Connect, which
must be done on a Mac with the Apple Developer account.

---

## 1. Current state — you are already App Store compliant

You do **not** need StoreKit to submit. The app already satisfies **Guideline
3.1.1**:

- The native iOS shell sets `data-native-ios="1"` on `<html>` (boot script in
  `app/layout.tsx`, detected via Capacitor + the `MyAvatarApp` user-agent token).
- `app/globals.css` hides **every** purchase CTA tagged `data-iap-external`
  (top-up `+`, pricing buttons, wallet refill, etc.) inside the iOS shell.
- Result: inside the iOS app, **no non-Apple purchase is offered**, so Apple has
  nothing to reject under 3.1.1.

**Trade-off:** iOS users currently cannot buy credits in-app at all (they can on
the web). StoreKit (below) is what lets them buy **inside** the iOS app via Apple.

Related compliance already in place:
- **Delete Account** (Guideline 5.1.1(v)) — `/[locale]/account/delete` + `POST
  /api/account/delete`, reachable from the Settings drawer.
- **Sign in with Apple** (Guideline 4.8) — wired in `components/auth/LoginCard.tsx`
  (Google · Apple · GitHub). *Action:* enable the Apple provider in Supabase Auth
  for it to actually function.

---

## 2. What's already built in this repo (web + server)

| File | Role |
|------|------|
| `lib/iap/appleProducts.ts` | Product catalogue: App Store Connect product IDs → GEL credit amount. **Edit the IDs/amounts to match your real products.** |
| `app/api/iap/apple/verify/route.ts` | Server-side receipt verification with Apple + idempotent wallet credit (`apple:<txn>`). **Inert until you set the two env vars below.** |
| `lib/platform/iap.ts` | Client bridge: runs the native purchase then calls the verify endpoint. Plugin-agnostic, safe no-op until a plugin exists. |

---

## 3. Native steps (Mac + Xcode + App Store Connect) — the part only you can do

### 3a. Create the products in App Store Connect
1. App Store Connect → your app → **In-App Purchases** → **+**.
2. Create **Consumable** products for each credit pack. Suggested IDs (must match
   `lib/iap/appleProducts.ts`):
   - `ge.myavatar.app.credits.10`  → 10 ₾
   - `ge.myavatar.app.credits.25`  → 25 ₾
   - `ge.myavatar.app.credits.50`  → 50 ₾
   - `ge.myavatar.app.credits.100` → 100 ₾
3. Set the price tier for each, add a display name + review screenshot.
4. App Store Connect → **App Information / App-Specific Shared Secret** → generate
   the **shared secret** (used by the verify endpoint).

### 3b. Install a Capacitor IAP plugin
Pick one and install on the Mac, then `npx cap sync ios`:
- **RevenueCat** (`@revenuecat/purchases-capacitor`) — easiest, handles receipts;
  or
- **cordova-plugin-purchase** (`cordova-plugin-purchase`, works under Capacitor) —
  StoreKit 2 capable, no third party.

Expose the plugin to the web bridge by making
`window.Capacitor.Plugins.InAppPurchases.purchase({ productId })` resolve to
`{ receipt, transactionId }` (the base64 **app receipt** and the StoreKit
transaction id). Adapt the plugin key/shape in `lib/platform/iap.ts → getPlugin()`
if your plugin differs.

### 3c. Xcode
1. Open `ios/App/App.xcworkspace`.
2. Target → **Signing & Capabilities** → add **In-App Purchase**.
3. Build to a device with a **Sandbox** Apple ID to test.

---

## 4. Server env (Vercel) — flip it on

Set in Vercel project env (Production + Preview):

```
IAP_APPLE_ENABLED=true
APPLE_IAP_SHARED_SECRET=<the app-specific shared secret from 3a>
```

Until both are set, `POST /api/iap/apple/verify` returns `503 iap_not_configured`
and nothing changes for existing users.

> **Idempotency requirement:** the verify endpoint credits via
> `credit_wallet_gel(p_user_id, p_amount, p_ref)` with `p_ref = apple:<txn>`.
> Make sure that RPC **dedupes on `p_ref`** (unique ledger ref) so a replayed
> receipt cannot double-credit. The Stripe path already relies on the same
> property (`stripe:<session>`).

---

## 5. Wire the iOS purchase UI (last step)

Today the iOS shell hides purchase CTAs. Once 3a–4 are done, show an Apple-native
buy flow on iOS instead of hiding it. In the wallet/top-up UI:

```ts
import { isIapAvailable, purchase } from '@/lib/platform/iap';

if (isIapAvailable()) {
  const r = await purchase('ge.myavatar.app.credits.25');
  if (r.ok) {/* show new balance r.balanceGel */}
} else {
  /* non-iOS: keep the existing Stripe top-up */
}
```

Render the IAP buttons **only** when `isIapAvailable()` (so they never appear
broken), and keep the `data-iap-external` Stripe CTAs for the web. Then rebuild:
`npx cap sync ios` → archive in Xcode → submit.

---

## 6. Submit checklist

- [ ] Products created + **Ready to Submit** in App Store Connect
- [ ] `lib/iap/appleProducts.ts` IDs/amounts match the products
- [ ] `IAP_APPLE_ENABLED=true` + `APPLE_IAP_SHARED_SECRET` set in Vercel
- [ ] `credit_wallet_gel` is idempotent on `p_ref`
- [ ] Sandbox purchase credits the wallet end-to-end
- [ ] Apple provider enabled in Supabase (Sign in with Apple works)
- [ ] Delete Account flow works on device
