# SERVICE_UNIT_ECONOMICS — what every MyAvatar.ge service costs, and one price model to approve

The pricing audit the owner asked for on 2026-10-10 at 12:42Z and 12:44Z (Master Task thread). Written 2026-10-10 on
branch `claude/launch-certification-wmvitt` (draft PR #50).

**Nothing in Production changed.** No price, credit balance, pack, plan, subscription, payment setting, flag, secret
or budget was touched. Production was only read (the ledger, balances, booked spend). Bought and granted credits stay
exactly as they are.

The arithmetic is code, not a spreadsheet:

- `lib/credits/unitEconomics.ts` holds every cost line and the proposed prices.
- `lib/credits/unitEconomics.test.ts` holds the owner's rule against them.

Every number below comes out of that engine. Change one input there (VAT, card fee, FX, a provider price) and the
tests say which price no longer clears the floor.

## მოკლედ (ქართულად)

- **წესი:** ფასი = სრული ცვლადი ხარჯი ÷ (კრედიტის წმინდა შემოსავალი × 35 %). მიზანი 65 %-იანი მარჟა, ქვედა ზღვარი
  62 %. ხარჯში შედის პროვაიდერის ოფიციალური ფასი, ხელახალი რენდერები, სერვერი, საცავი და დოლარის რეზერვი. კრედიტის
  წმინდა შემოსავალი ითვლის დღგ-ს (18 %) და ბარათის საკომისიოს (3 %).
- **დღეს ვიდეო ზარალით იყიდება.** 8 წამიანი Fast ვიდეო 2.50 ₾ ღირს, მაგრამ 3.63 ₾ ჯდება (−77 %). 48 წამიანი
  სარეკლამო ვიდეო ერთი კლიპის ფასად იყიდებოდა (−815 %). ეს და აგენტის ვიდეო-რიგის შეცდომა branch-ზე უკვე
  გასწორებულია; Production-ში ჯერ არ არის.
- **შემოთავაზებული მოდელი (ერთი დასამტკიცებელი):**
  - კრედიტი 0.10 ₾; პაკეტები 10 / 20 / 50 ₾ = 100 / 200 / 500 კრედიტი, ბონუსის გარეშე.
  - გამოწერები გაშვებისას არ იყიდება.
  - ვიდეო: 25 + წამზე Lite 9 / Fast 14 / Standard 44. მაგალითად 8 წამი Fast = 137 კრედიტი (13.70 ₾).
  - სურათი 8; მუსიკა 5 / 18 / 25 / 50; დუბლაჟი 10 წუთში; პრეზენტაცია 4 + 5 სლაიდზე; Deep Research 330.
  - ჩატი უფასოა ლიმიტით.
  - Lip-sync, სახის შეცვლა, მოძრაობა, მოლაპარაკე ფოტო და 3D არ იყიდება: დაშვებული ძრავა არ არსებობს.
- **რა არ იცვლება:** ნაყიდი და ნაჩუქარი კრედიტები, ბალანსები.
- **რა გჭირდება შენგან:** ერთი პასუხი ბარათზე (მოდელი „დამტკიცება"). Production-ში გაშვებას ცალკე სიტყვა
  დასჭირდება (deploy).

## Contents

1. [The rule and the money side](#1-the-rule-and-the-money-side)
2. [What Production shows](#2-what-production-shows-read-only-2026-10-10)
3. [What is wrong today](#3-what-is-wrong-today)
4. [Every service, cost to price](#4-every-service-cost-to-price)
5. [Video, priced by length and tier](#5-video-priced-by-length-and-tier)
6. [The recommended price model](#6-the-recommended-price-model-one-approval)
7. [What the tests hold](#7-what-the-tests-hold-margin-and-stress)
8. [Engine change plan](#8-engine-change-plan-one-ssot)
9. [Migration plan](#9-migration-plan)
10. [MEDIA_GOOGLE_ONLY rollout](#10-media_google_only-rollout-prepared-not-switched)
11. [Vercel Sandbox pilot vs Cloud Run](#11-vercel-sandbox-pilot-vs-cloud-run)
12. [Monitoring and alerts](#12-monitoring-and-alerts)
13. [BillingGuard budget](#13-billingguard-budget)
14. [What needs the owner's word](#14-what-needs-the-owners-word)
15. [Facts that move the prices](#15-facts-that-move-the-prices)
16. [Sources](#16-sources)

## 1. The rule and the money side

The owner's rule (2026-10-10 12:42Z):
- Prices are cost-based: 65 % target gross margin, 62 % floor.
- Cost is the **full variable cost**, from official prices.
- An unknown cost is never 0.

| Input | Value | Label | Where |
|---|---|---|---|
| Credit price to the user | 0.10 ₾, VAT included | as today | `CREDIT_VALUE_GEL` |
| VAT | 18 % of the price paid is not revenue | ESTIMATED: assumes the business is VAT-registered (the safe direction); owner's fact | `ECON.vatRate` |
| Card fee on a BOG top-up | 3 % | ESTIMATED: BOG's online-acquiring rate is not public | `ECON.paymentFeeRate` |
| FX | 2.70 ₾ per $ plus a 5 % reserve (provider bills are in dollars, credits are sold in lari) | rate as in `lib/billing/fx`; reserve ESTIMATED | `ECON` |
| **Net lari per credit** | 0.10 ÷ 1.18 × 0.97 = **0.0822 ₾** | derived | `netGelPerCredit()` |
| Gemini 3.6 / 3.8 Flash | booked at the 2027 list price ($1.50 / $7.50 per 1M), not the introductory half price that ends 2026-12-31 | official | `flash()` |

**Full variable cost of one unit** is the sum of these lines:

- the provider's list price for the unit;
- the speech, music or text calls inside it;
- Vercel function time (Active CPU $0.128 / hour, memory $0.0106 / GB-hour);
- Supabase storage and transfer ($0.021 / GB-month, $0.09 / GB egress, a result downloaded about twice);
- the 5 % FX reserve.

The sum is then multiplied by (1 + the share of units the platform pays for twice). That share is a failed render it
refunds, or a QC miss: 10 % for Veo, image and music; 5 % for FFmpeg work.

```
credits = ceil( full cost ₾ ÷ ( 0.0822 ₾ × (1 − 0.65) ) )       margin = 1 − full cost ÷ (credits × 0.0822 ₾)
```

Each cost line carries one of three sources:
- **official**: a vendor's published price, read 2026-10-10 (§16);
- **measured**: read from Production;
- **estimated**: an assumed size times an official unit price.

Each op carries one of four statuses:
- **PROVEN**: runs today on an allowed engine, with its cost measured;
- **ESTIMATED**: runs on an allowed engine, cost not yet measured in Production;
- **BLOCKED**: no allowed engine exists, so it is refused and never sold;
- **FREE_CAPPED**: free inside daily caps.

## 2. What Production shows (read only, 2026-10-10)

| Fact | Value |
|---|---|
| Accounts | 42; every one holds a balance; median 50 credits |
| Credits outstanding | 1,003,393. One account holds 1,000,050 of them, and 1,000,000 of those come from no ledger row (an admin or test balance set outside the ledger; owner to confirm). The other 41 hold 3,343 |
| Ledger | 222 rows: 42 sign-up grants of 50, 1 wallet top-up of 100, 1 denomination repair of 900, 1 admin adjustment of 100, 125 charges (−823), 52 refunds (+496) |
| Completed payments | None on record (all four BOG checkouts `init_failed`, merchant side) |
| Subscriptions | 0 rows. The BOG saved-card plan code exists (`/api/billing/bog/subscription`, cron `bog-billing`); nothing was ever sold through it |
| Booked platform spend (`agent_evolution_traces`, since 2026-07) | about 113 ₾ in total:<br>• `gemini` 215 calls, 50.5 ₾ (average 0.23 ₾, p95 2.59 ₾)<br>• `ltx` 100 film clips at a flat 0.571 ₾ each, the film recorder's default estimate rather than a bill<br>• `replicate` 5 calls, 4.3 ₾, the last on 2026-10-09<br>• `elevenlabs` 6 calls, 0.8 ₾ |
| Chat answer cost | 73 answers 2026-09-29 → 10-09: average 0.0277 ₾, p95 0.0896 ₾ (priced at the p95) |
| Veo | an 8 s 1080p clip with sound, measured at its list price: Fast $0.96, Standard $3.20 |

What this means for the price change:
- **Almost no paid credits exist.** Nothing was bought.
- **No plan contract exists to migrate.**
- Every balance is a grant, a repair or an admin adjustment, and it stays as it is.

## 3. What is wrong today

Labels:
- **FIXED_ON_BRANCH**: fixed and tested on PR #50, not in Production yet.
- **OPEN**: still to fix.
- **IN_MODEL**: the price model below resolves it.

| # | Finding | Effect | Label |
|---|---|---|---|
| D1 | Every Veo video is sold below its cost. An 8 s Fast film is 25 credits (2.50 ₾) and costs 3.63 ₾; a 48 s Standard film 495 credits against 60.71 ₾ | −77 % (8 s Fast) to −49 % (48 s Standard) per film; every video sold loses money | IN_MODEL |
| D2 | A product ad was charged one clip's price at every length. The button quoted 6 s; the route charged 25 or 45 credits from the client's own duration; a 48 s ad renders 6 Fast clips | a 48 s ad: 25 credits for 18.79 ₾ of cost (−815 %) | FIXED_ON_BRANCH (`quote.ts` `productAdSeconds`, `productAdCharge.ts`, remix route, studio button; tests) |
| D3 | The Agent G video queue charged the Fast price but rendered on the Standard model (`resolveModel(transport, DEFAULT_TIER)`) | each queued clip: 25 credits for $3.20 of Veo | FIXED_ON_BRANCH (`videoQueue.ts` renders `STUDIO_DEFAULT_VEO_TIER`; test pins `veo-3.1-fast-`) |
| D4 | Image: 2 credits for a 1K Nano Banana 2 image that lists at $0.067. The cost model books $0.03 | −30 % | IN_MODEL (8 credits); booking fix in §8 |
| D5 | A full song (up to 3 min of ElevenLabs music, $0.45) is billed at the 90 s price, 12 credits | −43 % | IN_MODEL (50) |
| D6 | 60 s and 90 s music at 8 and 12 credits: ElevenLabs is $0.15 a minute | 29 % margin, under the floor | IN_MODEL (18, 25) |
| D7 | Deep Research: 120 credits for a task Google estimates at $1–3 | 5 % margin at the top of the range | IN_MODEL (330) |
| D8 | Free with no price, capped per account per day:<br>• dubbing: 10 jobs of up to 10 min<br>• presentations: 30<br>• chat: 500<br>• Pro chat: 20<br>• montage: 40 | one free account can cost:<br>• about 28 ₾ a day in dubbing<br>• 47 ₾ in decks<br>• 47 ₾ in chat at p95<br>Only the platform-wide $10 / day BillingGuard stops it, and it stops everyone. Without Upstash the per-account caps count per function instance only | IN_MODEL (caps and prices, §6) |
| D9 | Plans sell the same credit at 2.35× the pack price (Starter 54 ₾ for 230 credits = 0.235 ₾ a credit) and market it as "4 videos", a count the old video price set | misleading once prices change; no plan was ever sold | IN_MODEL (no plans at launch) |
| D10 | Lip-sync is +20 credits a pass. The music-video ×1.4 multiplier says it covers a HeyGen leg too | the lip-sync leg could be paid for twice; HeyGen is not an allowed provider | IN_MODEL (no lip-sync; the song is priced on its own) |
| D11 | VFX is catalogued with the `remix` price key (15) but charges `videoCredits` (25 / 83) | the quoted price is not the charged price | OPEN, fixed by §8 step 3 |
| D12 | The cost bookings feeding BillingGuard use flat lines:<br>• image $0.03<br>• music $0.10 a song<br>• dubbing $0.05 a minute<br>• the film recorder's `ltx` $0.05 a clip<br>HeyGen, Kling and image calls are not booked at all | the platform budget counts too little and stops late | OPEN, §8 step 6 |
| D13 | 9 services still call HeyGen, Replicate or Kling in Production. The last Replicate call was 2026-10-09 | forbidden engines, unpriced; there is no allowed fallback | OPEN until `MEDIA_GOOGLE_ONLY` is on in Production (§10, owner's word) |
| D14 | The free trial film renders on Fast | 3.63 ₾ per new account, before any purchase | IN_MODEL (Lite, 2.63 ₾) |
| D15 | A product ad is paid in full up front. If its later scenes fail, the client shows the first clip and nothing is paid back for the missing scenes (the film refunds each dead scene; the ad does not) | small at today's 25 credits; with D2's length price, a 48 s ad that delivers one clip keeps the whole charge | OPEN, §8 step 2 |

## 4. Every service, cost to price

The catalog's 22 services (`lib/catalog/services.ts`), plus Agent G's own operations. Each row reads left to right:

```
Provider → Model → Unit cost (list) → Full variable cost → Margin today → GEL → Credits
```

Read the table this way:
- "Full cost" includes the paid re-render share.
- "Today" is what Production charges now.
- "Proposed" is in credits, with lari in brackets.
- Margins are against the full cost.

Videos are composed per length and tier; §5 has their full table. The video rows here show the 8 s Fast case.

| Service | Unit | Provider → model | Unit cost (list) | Full cost | Today | Proposed | Margin | Status |
|---|---|---|---|---|---|---|---|---|
| video.generate (film, documentary, chat video) | 8 s video, Fast | Google → `veo-3.1-fast-generate` + ElevenLabs speech + `gemini-3.8-flash` storyboard + ElevenLabs music bed + FFmpeg | Veo $0.12 / s 1080p with sound ($0.96 a scene); speech $0.08 / 1k chars; music $0.15 / min | 3.63 ₾ | 25 (−77 %) | **137** (13.70 ₾) | 68 % | PROVEN (Fast, Standard) / ESTIMATED (Lite) |
| video.music-video | 8 s, Fast, with its song | as above + ElevenLabs music or Lyria for the song | + song $0.15 / min | 4.10 ₾ | 35 (−42 %) | **157** (15.70 ₾) | 68 % | ESTIMATED |
| video.product-ad | 8 / 24 / 48 s, Fast | as video.generate | as above | 3.63 / 9.70 / 18.79 ₾ | 25 at every length | **137 / 361 / 697** | 68 / 67 / 67 % | PROVEN; length fix FIXED_ON_BRANCH |
| video.character-swap | one swap | none allowed (Replicate `roop`) | — | — | 15 | **not sold** | — | BLOCKED |
| video.motion | one transfer | none allowed (Kling v2.1) | — | — | 15 | **not sold** | — | BLOCKED |
| video.vfx | one 8 s effect scene, Fast | Google → Veo 3.1 (genjutsu) | as video | 3.63 ₾ | 25 Fast / 83 Standard | **137** Fast / 377 Standard | 68 / 66 % | PROVEN |
| video.remix: voice-over | up to 60 s | ElevenLabs `eleven_multilingual_v2` + FFmpeg mix | ~900 chars × $0.08 / 1k | 0.227 ₾ | 15 (82 %) | **10** (1.00 ₾) | 72 % | ESTIMATED |
| video.remix: music bed | one bed under a clip | ElevenLabs music + FFmpeg | 30 s × $0.15 / min | 0.236 ₾ | 15 (81 %) | **10** (1.00 ₾) | 71 % | ESTIMATED |
| video.remix: trim, captions, colour, speed, stabilise, watermark | one edit | FFmpeg on Vercel | encode ~60 s + storage | 0.019 ₾ | free | **free, 10 a day** | — | FREE_CAPPED |
| video.remix: restyle, background, redub, character | one pass | none allowed (Replicate, Sync) | — | — | 15 | **not sold** | — | BLOCKED |
| video.editing (montage) | clips + a track → MP4 | FFmpeg | encode ~120 s + 60 MB | 0.050 ₾ | free (40 a day) | **free, 5 a day** | — | FREE_CAPPED |
| image.generate | one image | Google → `gemini-3.1-flash-image` (Nano Banana 2) | $0.067 a 1K image | 0.214 ₾ | 2 (−30 %) | **8** (0.80 ₾) | 67 % | PROVEN |
| image.photoshoot | one photo | same, per photo and render | $0.067 each | 0.214 ₾ each | 2 each | **8 each** | 67 % | PROVEN |
| image.interior | one render / one 3D plan | same / `gemini-3.8-flash` plan + render | $0.067 / ~$0.05 | 0.214 / 0.163 ₾ | 2 / 8 | **8 / 8** | 67 / 75 % | PROVEN / ESTIMATED |
| image.culling | sorting photos | the user's own browser | none | 0 | free | **free** | — | FREE_CAPPED |
| avatar.talking | one talking photo | none allowed (HeyGen, SadTalker) | — | — | 20 | **not sold** | — | BLOCKED |
| music.generate | 30 s / 60 s / 90 s / full song ≤ 3 min | Google → `lyria-3-clip-preview` (30 s); ElevenLabs music (longer) | Lyria $0.04 a song; ElevenLabs $0.15 / min | 0.125 / 0.469 / 0.703 / 1.407 ₾ | 5 / 8 / 12 / 12 | **5 / 18 / 25 / 50** | 70 / 68 / 66 / 66 % | PROVEN (30 s) / ESTIMATED |
| music.remix | — | coming soon, no engine | — | — | not sold | **not sold** | — | MISSING |
| voice.dubbing | one minute of source video | ElevenLabs Scribe + `gemini-3.8-flash` translation + `eleven_multilingual_v2` + FFmpeg | Scribe $0.22 / h; speech $0.08 / 1k chars | 0.279 ₾ | free (10 a day) | **10 a minute** (1.00 ₾) | 66 % | ESTIMATED |
| text.write, code.assistant, research.web-search (Fast) | one answer | Google → `gemini-3.8-flash`, search grounding $14 / 1k queries | $1.50 / $7.50 per 1M (2027) | 0.094 ₾ at p95 | free (500 a day) | **free: 30 a day, 200 after a first purchase** | — | FREE_CAPPED |
| Chat on the Pro model | one answer | Google → `gemini-3.1-pro-preview` | $2 / $12 per 1M + one search query | 0.130 ₾ | free (20 a day) | **5** (0.50 ₾) | 68 % | ESTIMATED |
| research.web-search: Deep Research | one report | Google → `deep-research-preview-04-2026` | Google's estimate $1–3 a task (top used) | 9.356 ₾ | 120 (5 %) | **330** (33.00 ₾) | 66 % | ESTIMATED |
| design.presentation | a deck: base + each illustrated slide | `gemini-3.8-flash` outline + `imagen-4.0-generate-001` per slide | Imagen 4 $0.04 an image (Vertex rate; not on the Gemini API page) | 1.555 ₾ for 12 slides | free (30 a day) | **4 + 5 a slide** (12 slides 64) | 70 % | ESTIMATED |
| design.model3d | one 3D model | none allowed (Replicate TRELLIS) | — | — | 5 | **not sold** | — | BLOCKED |
| code.terminal | — | needs the sandbox (§11) | — | — | not sold | **not sold** | — | BLOCKED_OWNER |
| Agent G: MP3 from a video or link | one MP3 | FFmpeg | ~40 s encode | 0.011 ₾ | free | **free, 5 a day** | — | FREE_CAPPED |
| Agent G: edit (cut, look, fades, captions) | one edit | FFmpeg | ~90 s encode | 0.034 ₾ | free | **free, 5 a day** | — | FREE_CAPPED |
| Agent G: read my file | one read (video ≤ 2 min) | Google → `gemini-3.8-flash` | ~38k tokens in | 0.203 ₾ | free (100 a day) | **8** (0.80 ₾) | 69 % | ESTIMATED |
| Agent G: Live Voice | one minute | Google → Gemini Live native audio | audio in $3, out $12 per 1M; context re-billed each turn | 0.191 ₾ | free | **3 free minutes a day, then 8 a minute** | 71 % | FREE_CAPPED |

**Counts across the 22 services:**
- 14 are sold.
- 4 are BLOCKED: no allowed engine, so they are refused and never sold.
- 2 are free by design: culling runs on the device, montage on FFmpeg.
- 2 are not built yet: music.remix (MISSING) and code.terminal (BLOCKED_OWNER, needs the sandbox).

**Possible later engines for the blocked services** (none is in this model):
- Lip-sync and talking photo:
  - Gemini 3.8 Live Avatar is GA on Vertex at about $0.0062 a speaking second, but it is a live conversation with
    stock avatars, not "lip-sync this clip".
  - ElevenLabs Avatars has no API yet.
  - ElevenLabs Creatify Aurora publishes no dollar price.
- Character swap, motion and 3D: no Google or ElevenLabs product does them.

## 5. Video, priced by length and tier

One formula for film, documentary, product ad, VFX and a video made in chat:

```
25 credits a video  +  seconds (rounded up to 8 s scenes) × { Lite 9, Fast 14, Standard 44 }  (+ 20 for a music video's song)
```

| Video | Seconds | Tier | Proposed | ₾ | Full cost | Margin | Today | Margin today |
|---|---|---|---|---|---|---|---|---|
| film / ad / VFX | 8 | Lite | 97 | 9.70 | 2.63 ₾ | 67 % | 15 | −113 % |
| | 8 | **Fast** | **137** | **13.70** | 3.63 ₾ | 68 % | 25 | −77 % |
| | 8 | Standard | 377 | 37.70 | 10.62 ₾ | 66 % | 83 | −56 % |
| | 24 | Lite | 241 | 24.10 | 6.70 ₾ | 66 % | 45 | −81 % |
| | 24 | Fast | 361 | 36.10 | 9.70 ₾ | 67 % | 75 | −57 % |
| | 24 | Standard | 1081 | 108.10 | 30.65 ₾ | 66 % | 248 | −50 % |
| | 48 | Lite | 457 | 45.70 | 12.81 ₾ | 66 % | 90 | −73 % |
| | 48 | Fast | 697 | 69.70 | 18.79 ₾ | 67 % | 150 | −52 % |
| | 48 | Standard | 2137 | 213.70 | 60.71 ₾ | 65 % | 495 | −49 % |
| music video | 8 | Fast | 157 | 15.70 | 4.10 ₾ | 68 % | 35 | −42 % |
| | 24 | Fast | 381 | 38.10 | 10.17 ₾ | 68 % | 105 | −18 % |
| | 48 | Fast | 717 | 71.70 | 19.26 ₾ | 67 % | 210 | −12 % |

The music-video Lite and Standard rows are in the engine's output (`proposedVideoCredits(s, tier, true)`); each
clears 65 %.

**What a pack buys under this model:**

| Pack | Buys any one of these |
|---|---|
| 10 ₾ (100 credits) | one 8 s Lite video, or 12 images, or 20 thirty-second songs, or 10 minutes of dubbing |
| 20 ₾ (200 credits) | one 8 s Fast video |
| 50 ₾ (500 credits) | three 8 s Fast videos, or one 24 s Fast video |

**Video is 4–6× today's price, and that follows from the rule.** Veo Fast alone is $0.96 an 8 s scene, which is 2.72 ₾
after the FX reserve. That is more than the 2.50 ₾ the scene sells for today, before speech, storage or VAT.

The rule allows only two levers:
- **The tier.** Lite is 30 % cheaper to make. It is offered and priced, but its quality has not been run in Production.
- **The resolution.** Veo Fast at 720p is $0.10 / s instead of $0.12. This model keeps 1080p because that is what the
  studio renders today.

## 6. The recommended price model (one approval)

This is the whole model. Approving it approves every line here; nothing goes live until the owner also gives the
deploy word (§14).

### Credits and packs

| Item | Model | Today |
|---|---|---|
| Credit price | **0.10 ₾**, VAT included | same |
| Packs (BOG) | **10 ₾ = 100, 20 ₾ = 200, 50 ₾ = 500 credits**, no bonus credits until the margin is proven | same packs. The Stripe fallback also lists 5, 9, 29, 89 and 500 ₾ tiers, which are retired |
| Plans (subscriptions) | **none at launch.**<br>• The BOG plan code stays, switched off.<br>• Revisit after 30 days of real purchases, at 0.10 ₾ a credit (no plan sells a credit dearer than a pack). | Starter / Pro / Business at 54 / 108 / 216 ₾ for 230 / 525 / 1200 credits; never sold |
| Credit expiry | **none** (as today) | none |

### Prices (credits)

| Service | Price |
|---|---|
| Video (film, documentary, product ad, VFX, chat video) | **25 + per second: Lite 9 · Fast 14 · Standard 44**, seconds rounded up to 8 s scenes. Default tier Fast (8 s = 137) |
| Music video | the video price **+ 20** for the song. No lip-sync |
| Remix: voice-over / music bed | **10 / 10** |
| Remix: trim, captions, colour, speed, stabilise, watermark | free, 10 a day |
| Image (also each photoshoot photo and interior render) | **8** |
| Interior 3D plan | **8** |
| Music: 30 s / 60 s / 90 s / full song (≤ 3 min) | **5 / 18 / 25 / 50** |
| Dubbing | **10 a minute** of source video (rounded up to the minute) |
| Presentation | **4 + 5 per illustrated slide** (a deck without pictures: 4) |
| Chat (writing, code, web search) on the Fast model | **free**: 30 answers a day until the account's first purchase, 200 a day after |
| Chat on the Pro model | **5 an answer** |
| Deep Research | **330** a report |
| Agent G: montage / MP3 / edit | **free**, 5 a day each |
| Agent G: read my file | **8** |
| Agent G: Live Voice | **3 free minutes a day**, then **8 a minute** |

Not sold, and refused by name: lip-sync, character swap, motion transfer, talking photo, 3D model, and remix restyle,
background removal and redub. No allowed engine exists for them, and there is no silent fallback to HeyGen, Replicate,
Kling or Sync.

### Free and promotional credit

| Item | Model | Cost to the platform |
|---|---|---|
| Sign-up grant | **50 credits once** (as today) | at most 1.42 ₾ an account (50 credits at the thinnest proposed margin) |
| Free trial film | **one 8 s film on Lite** per account (today: Fast) | 2.63 ₾ |
| Referral | **50 credits to each side, paid when the invited person makes a first purchase** (today: at sign-up) | at most 2 × 1.42 ₾, only after revenue |
| Free daily caps (above) | every cap hit every day | under 4.1 ₾ a day per account at chat's p95 cost; about 2.1 ₾ at its average |

**Existing balances** are not touched.
- Every credit already granted or bought keeps its value as a credit.
- What it buys changes with the new prices, as any price change does.
- The owner may choose to tell users before the switch (§9).

## 7. What the tests hold (margin and stress)

`lib/credits/unitEconomics.test.ts` (53 tests in `lib/credits` pass) holds the following.

**Every price clears the floor**
- Every proposed price is at or above the 65 % target price, so it is also above the 62 % floor.
- Every video from 8 to 48 s, on every tier, documentary or music video, clears the floor.
- Every deck of 1–12 slides, with or without pictures, clears the floor.

**Nothing slips through**
- A BLOCKED op has no price.
- Every op that costs money is either priced or free inside a cap.
- No paid cost line is 0.

**Stress: packs and free accounts**
- A 10, 20 or 50 ₾ pack spent entirely on the thinnest-margin op (Deep Research, 65.5 %) still clears the floor.
- A free account that maxes every daily cap costs under 4.5 ₾ a day (4.06 ₾ at chat's p95).
- The 50-credit sign-up grant costs under 1.6 ₾ (1.42 ₾).

**Today's prices are pinned**
- The ops that sell below the 62 % floor today are pinned, so a change shows up here and in this document together:
  image, music 60 / 90 / 180 s, Deep Research and all three Veo tiers.
- An 8 s Fast scene at 25 credits is below cost.

Not yet measured, and so ESTIMATED until 30 days of Production bookings exist (§12):
- Lite quality and cost;
- dubbing, presentation, Pro chat, Deep Research and Live minutes at real sizes.

The model re-prices any op whose measured p95 cost moves its margin under 62 %.

## 8. Engine change plan (one SSoT)

The goal: **quote = confirmation = ledger = charge**, from one table, on the server.

1. **One price table.** The approved numbers move from `unitEconomics.ts` `PROPOSED` into the live quote functions:
   - `quoteCredits` (`lib/credits/quote.ts`) and `videoCredits` (`lib/credits/videoPricing.ts`) read them;
   - `CREDIT_COSTS` in `lib/credits/pricing.ts` is derived from them, not typed twice;
   - the margin tests then run against the live table.
2. **The video quote is composed and transparent.** The card lists base + scenes × tier + song, and the same function
   charges it.
   - The film, product-ad, VFX, chat-video and Agent G queue routes all call it with the tier they render.
   - D3's fix is the pattern: the model a route renders is resolved from the tier it charged.
   - Lip-sync is not on the card at all: it is not offered, rather than offered at 0.
   - A product ad settles per scene like the film: a scene that does not render is paid back (D15).
3. **The server computes every charge.** Already true for the studio tools, VFX (409 `price_changed`) and Agent G's
   signed quotes. Still to do:
   - the product ad's client-sent duration (D2, fixed on the branch);
   - the VFX catalog key (D11): `pricingKey: 'video'`;
   - the assemble fallback that prices without a tier.
4. **New charges where work is free today.** Each uses the existing reserve → render → settle / refund path
   (`deduct_credits_once`, no new migration):
   - dubbing (per source minute, known after upload);
   - presentation (base + slides, known from the outline);
   - Pro chat (per answer);
   - read my file (per read);
   - Live minutes past the free three (reserve a minute at a time, settle on hang-up).
5. **Daily caps per account** for the free ops, at the `FREE_DAILY` numbers. They need Upstash in Production to hold
   across function instances (§12).
6. **Booked cost = list cost.** The cost model books each op at its engine line, so BillingGuard's spend is the real
   bill (D12):
   - image $0.067;
   - Lyria $0.04, ElevenLabs music $0.15 / min;
   - dubbing about $0.093 / min;
   - Veo by tier and resolution, with the film recorder using it instead of the `ltx` default.
7. **Tests:**
   - the margin suite on the live table;
   - a route test per newly charged op (quote equals ledger debit);
   - the existing refund and race suites.

Each step is code on the branch, reversible, and needs no migration.

## 9. Migration plan

| What | Plan | Production effect |
|---|---|---|
| Balances, granted and bought credits | **kept as they are**; no conversion, no re-denomination | none |
| The 1,000,000-credit balance outside the ledger | not touched; owner to confirm it is an admin or test balance | none |
| Active subscriptions | none exist (0 rows); nothing to migrate | none |
| `CREDIT_PACKAGES` 9 / 29 / 89 ₾ (`pricing.ts`) | removed (nothing sells them; a test already pins that the chat never quotes them) | none |
| `pricingConfig` PLANS / CREDIT_PACKS 25 / 75 / 149 ₾, `/api/billing/use` on `user_credits` | retired after a read-only check that no row moved in 30 days | legacy tables kept (dropping a table is a separate migration, the owner's word) |
| `lib/billing/plans.ts` `ACTION_CREDIT_COSTS` → `deduct_credits_transaction` on `credits` (`/api/video/generate`, `/api/agents/execute`, `/api/app/services/[slug]/run`) | moved onto the one table (§8.1) or retired with their routes | none until deploy |
| Stripe placeholders (`lib/stripe/plans.ts`, `stripe-prices.ts`), Apple IAP placeholders 10 / 25 / 50 / 100 ₾ | removed from the price display; kept off | none (Stripe cannot serve a Georgian merchant) |
| `lib/pricing/founder.ts`, `dynamicPricing`, `autoMarginGuard`, `georgiaStrategy`, `conversionOptimization` | deleted (nothing calls them) | none |
| `REFILL_TIERS_GEL` [5, 9, 10, 20, 29, 50, 89, 500] | reduced to [10, 20, 50] | the Stripe fallback offers three packs |
| Plans UI (Starter / Pro / Business) | hidden on the pricing page and in the Credits window | users see packs only |
| Telling users | a one-line note on the Credits window for 14 days: "Video prices changed on ‹date›; your credits are unchanged" (the owner may add an email through Resend) | copy only |

The rollout order, each step on the owner's deploy word:
1. The engine change (§8) and the new table, deployed together.
2. `MEDIA_GOOGLE_ONLY` on (§10).
3. The daily caps, once Upstash is confirmed.

Rollback: Vercel Instant Rollback to the previous deployment. No migration, so nothing in the database needs undoing.

## 10. MEDIA_GOOGLE_ONLY rollout (prepared, not switched)

| | |
|---|---|
| What it does | `lib/providers/mediaPolicy` refuses every gated entry (HeyGen, Replicate, Kling, Sync, Udio, LTX) by name, with no fallback to another vendor. The user sees "not available" for the 4 blocked services and the blocked remix ops |
| What is ready | the gate and its tests; dubbing keeps the ducked original bed instead of Replicate Demucs (reported as `backgroundSeparated: false`); the catalog's boundary labels; the BLOCKED rows here have no price |
| Before switching | the §8 engine change, so the price table and the refusals land together and no blocked op is still priced in the UI. Then a Preview run with the flag on (owner's admin session) covering one call per blocked op (each refused, nothing charged) and one per allowed op |
| Switch | Production env `MEDIA_GOOGLE_ONLY=1` and a redeploy: **the owner's word** (a Production flag) |
| Rollback | unset the variable and redeploy |
| Proof after | 24 h of `agent_evolution_traces` with no `replicate` or `heygen` row |

## 11. Vercel Sandbox pilot vs Cloud Run

The owner's choice (2026-10-10 12:42Z) is a **Vercel Sandbox pilot, at most $20 a month, after checks**. Nothing has
been created. Background: `docs/handoffs/agent-g/browser-sandbox-decision.md`.

| | Vercel Sandbox (pilot) | Cloud Run jobs (fallback) |
|---|---|---|
| Fits the browser (B1) | yes: an interactive microVM, up to 45 min (Hobby) or 24 h (Pro) | poorly: run-to-end jobs |
| Fits code runs (B2) | yes | yes |
| One 2-minute task (2 vCPU, 4 GB) | ≈ $0.007 | ≈ $0.005 |
| Free allowance | Hobby: 5 CPU-hours and 420 GB-hours a month | 240,000 vCPU-s and 450,000 GiB-s a month per billing account |
| $20 a month buys | ≈ 2,800 two-minute tasks | ≈ 4,000, plus the free tier |
| New setup | turn Sandbox on for the team, set a Spend Management cap | IAM for the WIF principal, an image in Artifact Registry, a budget alert |

The pilot:
- **Price to users.** Free, 3 browser tasks and 3 code runs a day per account. That costs about 0.12 ₾ a day per
  account, and the $20 cap bounds the total.
- **Checks before the owner turns it on** (all code, on the branch):
  - the runner behind `checkSandboxJob` passes on a fake host;
  - the browser tools carry effect `read` for navigate / read / screenshot, and a confirmed action for anything that
    submits;
  - every run logs its cost to `agent_run_metrics`.
- **The owner's steps:**
  - enable Sandbox and set the $20 Spend Management cap;
  - the Preview run on their admin session.
- **Exit.** After 30 days, compare cost per task and failure rate. Move code runs to Cloud Run only if Sandbox spend
  reaches the cap.

## 12. Monitoring and alerts

No paid monitoring service. Sentry stays a proposal and is not set up.

| Signal | Source (exists) | Alert to a person |
|---|---|---|
| A refund that could not be paid (`agent_g_refund_debt`) | `ops_marker` from the Agent G sweep | **email**, immediately |
| Jobs that failed twice (`agent_g_gave_up`), queue backlog | `ops_marker` from the sweep | email, batched hourly |
| Render drainer and research sweep failures | `ops_marker` (`drain-renders`, `research-sweep`) | email, batched hourly |
| Platform spend at 80 % of the day or month | BillingGuard `alertThresholdPercent` | email |
| Margin drift: an op's booked p95 cost puts its price under 62 % | a weekly read of `agent_evolution_traces` against `unitEconomics` | email, weekly |

How it is built:
- **Mechanism.** A Vercel Log Drain or Vercel's log alerts on the `ops_marker` lines, and a small cron that mails
  through the Resend account already in use.
- **Plan check.** If the Vercel plan has no log alerts, the cron reads the marker counts from the database instead.
- **Cost.** Resend's free tier (3,000 emails a month) covers it.
- **What is still the owner's.** Choosing the address, and adding the drain or cron (a Production configuration
  change).

## 13. BillingGuard budget

Today `DAILY_COST_LIMIT` is $10 and `MONTHLY_COST_LIMIT` is $300 (`lib/services/billing/budgetPolicy.ts`; env can
override). That is about 7 eight-second Fast films a day across the whole site. Once the daily limit is spent, every
paid service stops for everyone, the paying users included.

The plan:
- **Free work keeps the $10 a day ceiling.** Free work is what the ceiling is for.
- **Paid work is pre-funded.** It is charged before it renders, so it is bounded by credits reserved, not by the
  free-work ceiling. BillingGuard checks it against a separate abuse ceiling:
  - $100 a day to start;
  - after that, three times the previous seven days' average paid spend.
- **The monthly limit follows revenue:** $300 or 40 % of the month's net top-ups, whichever is higher.

The split is code (§8). The new limits are Production environment values, set on **the owner's word**.

## 14. What needs the owner's word

| Step | Kind |
|---|---|
| **Approve this price model (§6)** | the one financial decision asked now |
| Deploy the engine change and the new table to Production | deploy (separate word) |
| `MEDIA_GOOGLE_ONLY=1` in Production | Production flag |
| BillingGuard limits (§13), Upstash for the daily caps | Production env / paid infra |
| Vercel Sandbox: enable and set the $20 cap | paid infra |
| Alert address, log drain or alert cron | Production configuration |
| Confirm VAT registration and BOG's card fee (§15) | facts; the model re-computes, no new decision |

## 15. Facts that move the prices

The model holds without a new decision if one of these changes. The engine re-computes every price, and the tests
re-check every price.

| Fact | Assumed | If different |
|---|---|---|
| VAT registration | registered (18 %) | not registered: net per credit 0.097 ₾, every price about 15 % lower (8 s Fast 137 → about 118) |
| BOG card fee | 3 % | each 1 % adds or removes about 1 % on every price |
| FX | 2.70 ₾ / $ + 5 % reserve | a rate above 2.835 eats the reserve; re-run |
| Gemini 3.6 / 3.8 Flash | 2027 list price | already booked at the higher one |
| ElevenLabs | list (v4 promo ignored; it ends 2026-10-12) | none |
| Veo resolution | 1080p | 720p Fast lowers Fast's Veo line by 17 % |
| Imagen 4 on the Gemini API | the Vertex rate, $0.04 | not on the Gemini API price page; Cloud Billing SKUs give the real number |

## 16. Sources

Official prices were read 2026-10-10. Full notes and their caveats are in the audit scratch; each number used here is
in the engine.

- Gemini Developer API pricing (updated 2026-10-09): https://ai.google.dev/gemini-api/docs/pricing
- Vertex generative AI pricing: https://cloud.google.com/vertex-ai/generative-ai/pricing
- ElevenLabs API pricing: https://elevenlabs.io/pricing/api
- Vercel Functions pricing: https://vercel.com/docs/functions/usage-and-pricing
- Vercel Sandbox pricing: https://vercel.com/docs/vercel-sandbox/pricing
- Cloud Run pricing: https://cloud.google.com/run/pricing
- Supabase pricing: https://supabase.com/pricing
- Resend pricing: https://resend.com/pricing
- Stripe global availability (Georgia not listed): https://stripe.com/global
- Bank of Georgia business payments (no online fee published): https://bankofgeorgia.ge/en/business/payments
- Gemini 3.8 Live with Live Avatar GA (2026-09-24): https://cloud.google.com/blog/products/ai-machine-learning/gemini-3-8-live-with-live-avatar-is-now-generally-available

Production reads (read only, 2026-10-10):
- `profiles` balances;
- `credit_ledger` by reason;
- `subscriptions` count;
- `agent_evolution_traces` booked spend by worker.
