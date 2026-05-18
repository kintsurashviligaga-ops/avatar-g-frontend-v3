# App Store Submission — MyAvatar.ge

Reference document for submitting the iOS wrapper of myavatar.ge to the Apple App Store. The submission requires wrapping the production PWA in a thin native shell (Capacitor, Tauri, or PWABuilder iOS). The fields below are exactly what App Store Connect asks for.

## 1. App Information

| Field | Value |
|---|---|
| App Name | MyAvatar — AI Studio |
| Subtitle (30 chars) | Georgian AI creative studio |
| Bundle ID | ge.myavatar.app |
| Primary Category | Productivity |
| Secondary Category | Photo & Video |
| Content Rights | Does not contain, show, or access third-party content |
| Age Rating | 12+ (infrequent mature content via user-generated AI prompts) |

## 2. Description (App Store)

> Georgian AI creative studio in one window. Chat in Georgian, English, or Russian. Generate avatars, images, videos, music, voiceovers, interior renders, and full HTML apps — all inside a single conversation. Share results directly to social media. No app switching.
>
> Eight specialists are routed automatically by Agent G:
> • Avatar — HeyGen talking-head videos
> • Image — Replicate FLUX photorealistic
> • Video — LTX text-to-video clips
> • Music — Udio original tracks
> • Voice — ElevenLabs TTS / voice clone
> • Interior — architectural renders
> • App Builder — Claude-generated HTML/CSS/JS apps
> • Chat — Gemini + Claude conversational
>
> Previews render inline. No raw URLs. No external redirects. One window, all creation.

Keywords (100-char limit):
`AI, ავატარი, ვიდეო, სურათი, მუსიკა, ხმა, ჩატი, Georgian, generator, Claude, studio`

## 3. App Privacy Declaration (Data Collection)

For the "App Privacy" section in App Store Connect:

### Data Linked to User

| Data Type | Used For | Required |
|---|---|---|
| Email Address | App Functionality, Account |  yes — Supabase Auth |
| Name | App Functionality | optional — Supabase Profiles |
| Phone Number | App Functionality | optional — Supabase Profiles |
| User-Generated Content (prompts, generated media) | App Functionality | yes — Supabase Storage |
| Customer Support (chat history) | App Functionality | yes — Supabase |
| Purchase History | App Functionality | yes — Stripe |
| Audio Data (voice clone samples) | App Functionality | optional — ElevenLabs |
| Photos (avatar source images) | App Functionality | optional — HeyGen |

### Data Linked to User, Used for Analytics

| Data Type | Provider |
|---|---|
| Product Interaction | PostHog |
| Crash Data | Sentry |
| Performance Data | Vercel Analytics, Vercel Speed Insights |

### Data NOT Collected

- Browsing history outside the app
- Search history outside the app
- Sensitive personal info (health, fitness, government IDs, race, religion, sexual orientation, etc.)
- Precise location (only coarse IP-region via Supabase Auth)
- Contacts
- Calendar events

### Third-Party Services that Receive Data

| Service | Purpose | Data Sent |
|---|---|---|
| Supabase | Auth + DB + Storage | email, profile, prompts, generated assets |
| Stripe | Payments | name, email, payment method, purchase history |
| Anthropic (Claude API) | App Builder + chat fallback | prompts only — no PII unless user types it |
| Google Gemini API | Chat primary + embeddings | prompts only |
| Replicate (FLUX) | Image generation | image prompt |
| HeyGen | Avatar video | prompt + (optional) source photo |
| LTX | Text-to-video | prompt |
| Udio | Music generation | prompt |
| ElevenLabs | Voice / TTS / clone | text + (optional) voice sample |
| Vapi.ai | Live voice calls | audio stream |
| Upstash Redis | Rate limiting | user ID (hashed) |
| Sentry | Error monitoring | stack traces, user ID, error context |
| PostHog | Product analytics | session events, user ID |
| Vercel | Hosting + Analytics | request logs, performance metrics |

## 4. App Review Information

| Field | Value |
|---|---|
| First name | Giorgi |
| Last name | Kintsurashvili |
| Phone | +995 XXX XXX XXX *(fill in)* |
| Email | support@myavatar.ge *(fill in)* |
| Demo account username | demo@myavatar.ge *(create before submit)* |
| Demo account password | *(provided to reviewer)* |
| Notes | See section 5 below |

## 5. Notes for the Apple Reviewer

> MyAvatar.ge is a Georgian-language AI creative studio. The user signs in with email + magic link via Supabase Auth (the magic link contains a one-time token; no password is set during onboarding).
>
> To test all features, please use the pre-provisioned demo account (credentials above) — it has 200 demo credits across all 8 specialists. The avatar specialist (HeyGen) is the slowest: avatar video generation takes 2–4 minutes; please wait for the inline poster + video to appear before reporting a hang.
>
> The chat-input pill labeled "ავატარი" triggers HeyGen avatar generation. The button labeled "ვიდეო" triggers LTX text-to-video. All other generation paths follow the same one-window pattern: the user types a prompt, picks a specialist, and the preview renders inline. No external URLs are shown to the user.
>
> Microphone access is requested only when the user explicitly taps the voice-input mic button. Camera access is requested only when the user explicitly taps "შექმენი ფოტოდან" inside the Avatar specialist. Both can be denied without breaking the rest of the app.
>
> All paid features (subscription credits) use Stripe Checkout in a hosted browser sheet — the app never collects or stores payment details directly.

## 6. Required Assets

| Asset | Spec | Status |
|---|---|---|
| App icon (1024×1024, no alpha) | `/public/icons/icon-1024x1024.png` | ✓ generated (placeholder; needs designer pass) |
| App icon (180×180, iPhone) | `/public/apple-touch-icon.png` | ✓ generated |
| Maskable PWA icon (512×512, safe-zone) | `/public/icons/icon-maskable-512.png` | ✓ generated |
| iPhone 6.7" screenshots (1290×2796) ×3+ | — | ✗ TODO |
| iPhone 6.5" screenshots (1242×2688) ×3+ | — | ✗ TODO |
| iPad 13" screenshots (2064×2752) ×3+ | — | ✗ TODO (if iPad supported) |
| Privacy policy URL | https://myavatar.ge/privacy *(must exist)* | ✗ TODO |
| Support URL | https://myavatar.ge/support *(must exist)* | ✗ TODO |
| Marketing URL (optional) | https://myavatar.ge | ✓ |

## 7. Screenshot Plan (3 minimum per device class)

Suggested screenshot lineup for both iPhone size classes:

1. **Hero (chat empty state)** — pure-black chat surface with the 8 specialist pills lined up. Georgian title visible.
2. **Avatar in action** — HeyGen video rendered inline with poster + action icons.
3. **Image gen result** — FLUX-generated image with inline lightbox.
4. **App Builder preview** — code/preview toggle showing a generated HTML app.
5. **Social share** — share modal open with 6 social pills (44×44 touch targets).
6. **Voice Lab** — recording interface.

Capture on a real iPhone 15 Pro Max in standalone PWA mode (already installable). No marketing chrome / device frames — Apple prefers raw screen content.

## 8. Pre-Submit Checklist

- [ ] 1024×1024 icon refined by designer (current is auto-generated placeholder)
- [ ] App Privacy URL live at `/privacy`
- [ ] App Support URL live at `/support`
- [ ] Demo account created with 200 credits + active subscription
- [ ] At least 3 screenshots per supported device class
- [ ] Wrapper built (Capacitor recommended) and TestFlight-uploaded
- [ ] Crash-free run for 10 min on real iPhone over cellular
- [ ] Cellular offline test → offline banner shows (see `public/offline.html`)
- [ ] Microphone permission prompt copy reviewed (must explain *why* the mic is needed — currently default iOS string)
- [ ] Camera permission prompt copy reviewed (same)
