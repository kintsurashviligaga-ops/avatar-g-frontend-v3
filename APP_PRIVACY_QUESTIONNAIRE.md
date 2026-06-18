# MyAvatar — App Store Connect "App Privacy" answers (click-by-click)

Path: **App Store Connect → your app → App Privacy → Edit**.
Keep these answers consistent with `ios/AvatarG/AvatarG/Resources/PrivacyInfo.xcprivacy`.

First prompt: *"Do you or your third-party partners collect data from this app?"* → **Yes**.

Then, for each data type, ASC asks three things: **purposes**, **linked to identity?**, **used for tracking?**

---

## ✅ Mark these as COLLECTED

### Contact Info
**Email Address** — account sign-up / sign-in (Supabase auth)
- Purposes: ☑ App Functionality
- Linked to identity: **Yes** · Used for tracking: **No**

**Name** — optional display name at sign-up
- Purposes: ☑ App Functionality
- Linked: **Yes** · Tracking: **No**

### User Content
**Photos or Videos** — uploaded for avatar / image / lip-sync generation
- Purposes: ☑ App Functionality
- Linked: **No**  *(matches the manifest. If you keep user uploads stored under their account long-term, switch this to **Yes** in BOTH places.)*
- Tracking: **No**

**Audio Data** — recorded for voice training and Georgian speech input
- Purposes: ☑ App Functionality
- Linked: **No**  *(same caveat as Photos)*
- Tracking: **No**

**Other User Content** — the text prompts users type *(optional to disclose)*
- Purposes: ☑ App Functionality · Linked: **No** · Tracking: **No**

### Identifiers
**User ID** — account identifier
- Purposes: ☑ App Functionality
- Linked: **Yes** · Tracking: **No**

### Usage Data
**Product Interaction** — which features are used (first-party in-app analytics)
- Purposes: ☑ Analytics ☑ App Functionality
- Linked: **No** · Tracking: **No**

### Diagnostics
**Other Diagnostic Data** — error logs (`/api/log-error`) *(include only if you retain them)*
- Purposes: ☑ App Functionality · Linked: **No** · Tracking: **No**

---

## ❌ Mark these as NOT collected (reviewers expect you to have considered them)

- **Payment Info** — No. The iOS build sells nothing in-app; no card data touches the app.
- **Location** — No (no location usage string, no location APIs).
- **Contacts** — No · **Browsing / Search History** — No
- **Health & Fitness, Financial Info, Sensitive Info** — No

---

## "Tracking" — the global answer

MyAvatar does **NOT** track: no data shared with data brokers, no cross-app/website
tracking, no advertising IDFA. This matches `NSPrivacyTracking=false` in the manifest.
→ You do **not** need the App Tracking Transparency (ATT) prompt, and you must **not**
add `NSUserTrackingUsageDescription` (adding it would imply tracking you don't do).

---

## Before you save — consistency check

After today's update, `PrivacyInfo.xcprivacy` declares: **Email, Name, Photos/Videos,
Audio, User ID, Product Interaction** (+ the required-reason APIs). Your App Privacy
answers above mirror that exactly. If you ever add or remove a data type in one place,
update the other — Apple cross-checks them, and a mismatch is a common rejection.

> Note: third-party SDKs ship their own privacy manifests, which Apple aggregates into a
> combined privacy report at build time. If you add an analytics/ads SDK later, re-check
> the "tracking" answer.
