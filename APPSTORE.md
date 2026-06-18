# MyAvatar — App Store Submission Runbook

Bundle ID: `ge.myavatar.app` · App name: **MyAvatar** · iOS 17.0+ · Capacitor remote-URL shell (`https://myavatar.ge/ka/dashboard`)

This file tracks exactly what is **done in code** vs. what **you** must do in Xcode / App Store Connect. Web side is already live (`myavatar.ge`, SW `v298`).

---

## A. ✅ Done in code (verified)

| Item | Where | Notes |
|------|-------|-------|
| **Account deletion** (Guideline 5.1.1(v) — mandatory) | `ChatChrome.tsx` → `/[locale]/account/delete` → `/api/account/delete` | Purges user rows + `admin.auth.admin.deleteUser` (permanent) |
| **IAP compliance** (3.1.1) | `globals.css` `html[data-native-ios='1'] [data-iap-external]{display:none}` + `lib/platform/nativeShell.ts` | "Reader" model: every Stripe/web purchase CTA is hidden inside the iOS shell → app sells nothing in-app → StoreKit not required. Tagged CTAs: top-up `+`, WalletRefill, PricingSection, ChatViews, Film studio, verification gate |
| **Privacy Manifest** (required since May 2024) | `ios/AvatarG/AvatarG/Resources/PrivacyInfo.xcprivacy` | `NSPrivacyTracking=false`; required-reason APIs (UserDefaults CA92.1, FileTimestamp C617.1, BootTime 35F9.1, DiskSpace E174.1); collected types (audio, photos, userID, product interaction) |
| **Usage strings** (camera/photos/mic/speech) | `ios/AvatarG/project.yml` | Rebranded to **MyAvatar**, accurate purpose copy |
| **`NSPhotoLibraryAddUsageDescription`** | `project.yml` | Added — app saves generated media to Photos (was missing → would crash) |
| **`ITSAppUsesNonExemptEncryption=false`** | `project.yml` | Added — skips export-compliance prompt each submit (HTTPS only = exempt) |
| **Legal URLs** | `/[locale]/privacy`, `/terms`, `/support` | Required by App Store Connect listing |
| **PWA manifest + iOS meta** | `app/manifest.ts`, `app/layout.tsx`, `app/[locale]/layout.tsx` | name/icons/display/theme + `appleWebApp` + `statusBarStyle` |
| **a11y** | OmniStudio/ChatChrome (28 `aria-label`) + `:focus-visible` | Decent baseline |

---

## B. 🔨 Your Xcode steps (cannot be done from the repo)

1. **Set your Team ID** — `project.yml` → `DEVELOPMENT_TEAM: ""` → your 10-char Apple Team ID (or set in Xcode Signing).
2. **Generate the project** — `cd ios/AvatarG && xcodegen generate` (install: `brew install xcodegen`).
3. **Integrate Capacitor iOS** — confirm the main `AvatarG` target embeds the Capacitor bridge (`npx cap add ios` / `npx cap sync ios`). The custom `project.yml` must include Capacitor's `CapacitorBridgeViewController` / `AppDelegate`; verify the `AvatarG/AvatarG/` source folder actually contains app Swift sources before archiving.
4. **App icon** — add a 1024×1024 marketing icon + full `AppIcon` set to the asset catalog.
5. **Archive & sign** — Xcode → Product → Archive → Distribute → App Store Connect.

### Capabilities to reconcile (these need the matching App ID capability, or signing fails)
The shell **declares** these but the entitlement/portal side is not wired. Pick one path per item:

- **Universal Links** — `capacitor.config.json` + `project.yml` plugins set `handleUniversalLinks: true`, but `AvatarG.entitlements` has **no** `com.apple.developer.associated-domains`.
  - *Keep it:* add `applinks:myavatar.ge` to entitlements + enable **Associated Domains** in the App ID + host `https://myavatar.ge/.well-known/apple-app-site-association`.
  - *Drop it:* remove `handleUniversalLinks` to avoid dead config.
- **Push** — `UIBackgroundModes` lists `remote-notification`, but there is **no** `aps-environment` entitlement and push is not yet wired in the web app.
  - *Keep it:* enable **Push Notifications** capability + add `aps-environment`, and implement the handler.
  - *Drop it:* remove `remote-notification` from `UIBackgroundModes` (recommended for v1 — see §D).

---

## C. 🏪 App Store Connect

1. Create app record — Bundle ID `ge.myavatar.app`, name **MyAvatar**, primary language Georgian.
2. **Privacy "Nutrition Labels"** — mirror `PrivacyInfo.xcprivacy`: Audio, Photos/Videos, User ID, Product Interaction; all **App Functionality** (Product Interaction also Analytics); **not** used for tracking.
3. **Account-deletion URL/flow** — point reviewers to the in-app delete path (§A) in the review notes.
4. Screenshots (6.7" + 6.5" required), description, keywords, support URL (`/support`), privacy policy URL (`/privacy`).
5. **Export compliance** — already answered by `ITSAppUsesNonExemptEncryption=false`.
6. **Demo account for review** — provide a test login with enough credits, OR confirm new accounts get free starter credits (see §D).

---

## D. ⚠️ Review-risk checklist (decide before submitting)

- **Background modes (`audio`, `fetch`, `remote-notification`)** — Apple rejects (2.5.4 / 2.16) background modes the app doesn't actually use. For a webview shell, **none** of these likely apply. Recommended: trim `UIBackgroundModes` to only what's truly implemented (probably empty for v1). Edit in `project.yml`.
- **Guideline 4.2 (minimum functionality)** — the app loads a remote URL (`server.url`). Pure web wrappers get rejected. Mitigation: the native widgets + Watch app + on-device camera/mic/photos integration are your "native" justification — make sure at least one is demonstrably working in the build.
- **Reader-model usability (3.1.1)** — since all purchase CTAs are hidden on iOS, make sure: (a) **new iOS users get free starter credits** so core features are usable without paying (otherwise the app looks broken to a reviewer), and (b) **no "buy on myavatar.ge" text/link leaks** on iOS (that's prohibited steering). Audit any "insufficient balance" copy under `data-native-ios`.
- **3.1.3(b) "multiplatform"** — fine to let users consume credits bought on web, as long as the app doesn't *advertise* the external purchase.

---

## E. Pre-submit smoke test (on a real device, in the shell)

- [ ] Photo upload → image/lipsync generates
- [ ] Microphone → voice training works; permission prompt shows the MyAvatar string
- [ ] Generated media → "save to Photos" works (triggers the new add-usage prompt)
- [ ] No Stripe/top-up button visible anywhere in the iOS shell
- [ ] Out-of-credits state shows no "buy on web" CTA
- [ ] Account deletion completes end-to-end
- [ ] App name under the icon reads **MyAvatar**
