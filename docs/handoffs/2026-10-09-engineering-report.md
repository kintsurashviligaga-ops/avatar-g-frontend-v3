# MyAvatar.ge — საინჟინრო ანგარიში და launch blocker-ების მატრიცა (2026-10-09)

ავტორი: Claude (Senior Web Developer). შეკვეთა: GG, 2026-10-09 05:52Z („გააგრძელე სამუშაო რეალური repository state-დან“).
ეტიკეტები: **PROVEN** (გაშვებულმა შემოწმებამ დაამტკიცა) · **BUILT_NOT_PROVEN** (კოდი + unit ტესტები, live მტკიცებულება არ არის) ·
**PARTIAL** · **MISSING** · **BLOCKED_OWNER** (მხოლოდ GG-ს შეუძლია) · **FAILED**.

**PRODUCTION READY: არა.** §55-ის სავალდებულო კრიტერიუმებიდან ექვსი ჯერ კიდევ ღიაა (ნაწილი 4). დეპლოი launch არ არის.

---

## 1. ფაქტობრივი მდგომარეობა (შემოწმდა 2026-10-09 05:52–06:30Z)

| რა | მნიშვნელობა | მტკიცებულება |
|---|---|---|
| `main` HEAD | `66d7163f` (PR #47-ის merge, 05:39Z) | `git rev-parse origin/main` |
| Production commit | `66d7163` | `https://myavatar.ge/api/health` 05:52:57Z: `"commit":"66d7163"` |
| GitHub CI `main`-ზე | მწვანე: CI run 398 და „E2E - Preview Contract“ 1070, ორივე `66d7163f`-ზე | GitHub Actions |
| Supabase Production migrations | 14 ჩანაწერი; ბოლო `20261009a_function_hardening` (05:39:14Z) | `list_migrations`, project `zwksnayknzggdcenqqxy` |
| Security Advisor | 0 error, 2 warning (`vector` `public`-ში; leaked-password protection), 23 info | 2026-10-09 05:39Z-ის შემდეგ |
| Production ცხრილები | 52 `public` ცხრილი, RLS ჩართულია 52-ზე | `pg_tables`, 06:0xZ |
| Storage buckets | `uploads` private 50 MB; `renders`, `avatars`, `music` public; `studio`, `twins`, `fonts` private | `storage.buckets` |
| გადახდები | 4 BOG შეკვეთა, 4-ვე `init_failed` (ბოლო 2026-10-06); დასრულებული გადახდა არც ერთი | `bog_orders` |
| მომხმარებლები | 22 (ბოლო რეგისტრაცია 2026-10-08 11:58Z) | `auth.users` count |
| სამუშაო branch | `claude/launch-certification-wmvitt`, `main`-ზე 4 commit-ით წინ, 0 უკან; draft PR #48 | `git rev-list` |
| merged PR-ები | #42, #45, #46, #47 | GitHub |
| ღია draft PR-ები | #43 (GCP Part 0), #44 (Vertex WIP, Astra + Claude-ის fix-ები), #48 (ეს branch) | GitHub |

ამ სესიაში Production-ში, Billing-ში ან ბაზაში არაფერი შეცვლილა. ყველა ცვლილება branch-ზეა, `main`-ში შეერთება GG-ის თანხმობას ელის.

## 2. რა გაკეთდა ამ სესიაში (branch `claude/launch-certification-wmvitt`)

| Commit | რა |
|---|---|
| `45478596` | სერტიფიკაციაში ჩაიწერა PR #47-ის deploy და `20261009a` |
| `0d239f26` | PR #43-დან გადმოტანილია ის, რაც `main`-ს ჯერ არ ჰქონდა (ნაწილი 3.1). PR #43-ის `veo-smoke` route-ში ნაპოვნი და გასწორებული შეცდომა: `assertAdminAccess` `main`-ზე async-ია, PR #43 კი `.ok`-ს promise-ზე კითხულობდა, ამიტომ route მფლობელსაც 404-ს უბრუნებდა (`app/api/admin/veo-smoke/route.test.ts` ძველ კოდზე ვარდება) |
| `e1f5cba9` | `supabase/migrations/20261009b_renders_private.sql` — `renders` bucket private. **არ არის გაშვებული**, GG-ის თანხმობას ელის (ნაწილი 4, Security) |
| `76e8c525` | PR #44-დან სამი უსაფრთხო fix (ნაწილი 3.2: #2, #4, #5): Redis fast-fail; `/api/ai` Claude-იდან Gemini-ზე, ჩამოჭრა გამოძახებამდე; ხმის hardening. ახალი ტესტები; env, ბაზა, ფასიანი გამოძახება არ იცვლება. **Production-ში არ არის** |
| `d387508e` | Admin-ის „Pipeline“ ბარათი ახლა კოდის რეალურ ძრავებს ასახელებს: კლიპები Veo 3.1, კადრები Gemini, სტუდიის სურათი NanoBanana reseller, TTS ElevenLabs, მუსიკა Lyria 3; ტესტი 13 (ძველ ფაილზე 11 ვარდება). **Production-ში არ არის** |
| (ეს ფაილი) | ეს ანგარიში; PROJECT_MASTER-ის State Tracker და სერტიფიკაცია შეჯერებულია |

სრული retest `0d239f26`-ზე: `tsc` 0 შეცდომა; `next lint` 0 შეცდომა, 35 warning (ძველი კლასები); jest **696 / 696 suite, 10,776 passed, 3 skipped, 0 failed**; ka/en/ru key parity OK (`scripts/check-i18n-parity.ts`). `76e8c525`-ზე: `tsc` 0; eslint შეცვლილ 15 ფაილზე სუფთაა; jest **698 / 698 suite, 10,789 passed, 3 skipped, 0 failed**. Playwright: ნაწილი 4, E2E. HawkScan DAST არ გაშვებულა (`HAWK_API_KEY` არ არის).

## 3. PR #43 და PR #44 — რა რჩება საჭირო

### 3.1 PR #43 (`claude/gcp-part0-wif-fmtfxp`, GCP Part 0)

PR #43 ხელუხლებელია (მას GCP thread ფლობს). მისი 22 commit-იდან `main`-ში უკვე იყო: enhancePrompt-ის fix (`75eef69`, `main`-ზე `lib/veo/payload.ts:284`) და 6–10 ციფრიანი ელფოსტის კოდი (`87122ff`, `lib/auth/otpEmail.ts:58`). დანარჩენი გადმოვიტანე `0d239f26`-ით:

| რა | რატომ საჭიროა |
|---|---|
| `scripts/gcp/part0-wif.sh` | ერთადერთი least-privilege WIF სკრიპტი; Production-ის Vertex-ზე გადასაყვანად სწორედ ეს უნდა გაეშვას `VERCEL_ENVIRONMENTS="preview production"`-ით |
| `scripts/gcp/setup-veo-vertex.sh` | `AUTH=wif` ახლა უარს ამბობს და `part0-wif.sh`-ზე მიუთითებს (ძველი WIF შტო მთელ pool-ს ენდობოდა) |
| `lib/veo/authCheck.ts` + provider probe | admin probe უფასოდ ამოწმებს keyless ჯაჭვს (token, bucket, signBlob) და log-ში ერთ ხაზს წერს |
| `scripts/gcp/preview-auth-check.cjs` + `vercel.json` | Preview build-ის log-ში AUTH შემოწმება; სხვა build-ებში გამოტოვებულია, build-ს არასდროს აფუჭებს |
| `lib/veo/smoke.ts`, `/api/admin/veo-smoke`, `/admin/veo-smoke` | Production-ში Veo-ს INFERENCE VERIFIED-ის ერთადერთი ინსტრუმენტი: ერთი ფასიანი კლიპი (≈ $0.40) მხოლოდ POST-ით და დამადასტურებელი სიტყვით, 409 თუ Vertex არ არის ჩართული |
| Part 0 plan, report, test plan | `docs/handoffs/2026-10-08-gcp-part0-*.md` — Part 0-ის მტკიცებულება ახლა `main`-ის ისტორიაშიც იქნება |

### 3.2 PR #44 (`claude/vertex-migration-fixes` → `codex/vertex-ai-migration`)

PR #44 ხელუხლებელია (Astra-ს Vertex WIP `503829dc` + Claude-ის `8ee92f76` და 9 commit `claude/vertex-migration-fixes`-დან). ის `main`-ს (`66d7163f`) 30 ლოგიკურ ცვლილებად შევადარე; სრული ცხრილი: [`2026-10-09-pr44-audit.md`](2026-10-09-pr44-audit.md).

| კლასი | რაოდენობა | რა |
|---|---|---|
| უკვე `main`-შია | 4 | research fixture-ის საათი; `GEMINI_TRANSPORT` + `googleModelFetch`; `vertexAuth`-ის გაყოფა; `5131348b`-ის lint (`afb418e4`) |
| ჩანაცვლებულია | 6 | `@ai-sdk/google-vertex`; `docs/VERTEX_MIGRATION.md`; Research Vertex Interactions-ზე; Lyria Interactions-ით; ფასიანი provider probe; Veo `GEMINI_TRANSPORT`-ზე მიბმული |
| ჯერ საჭიროა | 8 | ქვემოთ |
| action 9-ს ელოდება | 7 | TRELLIS-ის გამორთვა; reseller / Grok / FLUX; Udio და სხვ.; `policy.ts` guard-ები და middleware 410; kill switch-ები სავალდებულოდ; video cascade და HeyGen; stacked `3642ae84`, `5462af5f` |
| არ გვინდა | 5 | `GEMINI_API_KEYS` pool-ის მოხსნა; dubbing Scribe → Gemini; მხოლოდ Imagen-იანი image studio (Imagen 4 Vertex-ზე 404-ია); ElevenLabs Music / SFX გამორთვა; `/api/voice/live` 503 Vertex-ზე |

`8ee92f76`-ის სამივე მტკიცება `main`-ზე ჯერ არ სრულდება: image route მხოლოდ reseller-ს იძახებს, fallback-ის გარეშე (`app/api/nanobanana/image/route.ts:298-345`); Redis-ის 7 კლიენტი ბიბლიოთეკის 5 retry-ით იყო (მკვდარ host-ზე ≈ 4.4 წმ თითო გამოძახებაზე); ხმით მხოლოდ 4 ხელსაწყოს მომზადება / გაშვება შეიძლება (`LIVE_GEN_TOOLS`, `OmniStudio.tsx`).

**ჯერ საჭიროა, მნიშვნელობით:**

| # | რა | ამ branch-ზე |
|---|---|---|
| 1 | Google-ის image ძრავა (V2 → `gemini-3.1-flash-image`, Pro → `gemini-3-pro-image`, 2K / 4K, მომხმარებლის ფოტო reference-ად) | **არ გადმომიტანია.** `main`-ის `geminiImage`-ზე თავიდან დასაწერია, ფასიანი inference-ია და GG-მ უნდა თქვას, reseller რჩება თუ არა (action 9). `8ee92f76`-ის reseller → Grok → FLUX fallback-ი და flash ↔ pro გადართვა არ გადმოვა (ჩუმი fallback, R7) |
| 2 | Upstash fast-fail: 1 retry, 100 ms, 7-ვე კლიენტი `lib/platform/upstash.ts`-ით | **გადმოტანილია** `76e8c525` (ტესტი `lib/platform/upstash.test.ts`) |
| 3 | ხმით photoshoot / interior / product / swap / remix-ის მომზადება და გაშვება | **არ გადმომიტანია.** `OmniStudio.tsx` თავიდან დასაწერია; product / swap / remix action 9-ის vendor-ებზეა (Kling, roop, Replicate). photoshoot და interior პირველად შეიძლება |
| 4 | `/api/ai`: Anthropic `claude-sonnet-4-6` → Gemini (`llmText`); ჩამოჭრა გამოძახებამდე, refund ჩავარდნაზე; ყალბი `newBalance = 1000` წაშლილია | **გადმოტანილია** `76e8c525` + ახალი ტესტი `app/api/ai/route.test.ts` (7; `main`-ის route-ზე 5 ვარდება). ეს გზა სამუშაო სივრცის „Software“ სერვისს ემსახურება (`/api/orbit/code-generation`) |
| 5 | ხმის hardening: `mock-stt` ყალბი transcript წაშლილია, აუდიოს ლიმიტი 25 / 35 MB; realtime session token მხოლოდ შესულს და IP + ანგარიშის ლიმიტით; session secret-ის გარეშე token არ გაიცემა (`voice-v2v-local-dev-secret` წაშლილია) | **გადმოტანილია** `76e8c525` + 2 regression ტესტი `__tests__/api-security.test.ts`-ში (`main`-ის ფაილებზე ორივე ვარდება) |
| 6 | Telegram Agent G-ის STT: OpenAI → Gemini | არ გადმომიტანია: `AGENT_G_VOICE_ENABLED`-ით გამორთულია; Gemini-ის ვერსია segment-ებს კარგავს |
| 7 | voice-v2v worker → Gemini / ElevenLabs, ახალი `/api/agent-g/calls/chat` | არ გადმომიტანია: გზა Production-ში მკვდარია (WS URL არ არის), worker-ს ახალი env სჭირდება |
| 8 | gate-ები „API key არის“-დან „Google კონფიგურირებულია“-ზე | გადადებულია: საჭიროა მხოლოდ Vertex deploy-ზე `GEMINI_API_KEY`-ის გარეშე |

**შეუმოწმებელი:** ცოცხალია თუ არა ახლა Production-ის Upstash host (2026-10-03-ზე NXDOMAIN იყო); reseller-ის ბალანსი. პირველი განსაზღვრავს, რამდენს მოიგებს #2, მეორე — #1-ის სისწრაფეს.

## 4. Launch blocker-ების მატრიცა

ყოველ რიგს აქვს: სტატუსი · პასუხისმგებელი · დამოკიდებულება · არსებული მტკიცებულება · Definition of Done (DoD).
„GG“ = მხოლოდ მფლობელს შეუძლია ან უნდა გადაწყვიტოს. „Claude“ = შემიძლია დამოუკიდებლად, Production / Billing / ბაზის ცვლილების გარეშე.

### 4.0 მოკლე ცხრილი

| # | სფერო | სტატუსი | პასუხისმგებელი | §55 blocker? |
|---|---|---|---|---|
| 1 | Auth / Resend | **FAILED** Production-ში | GG (Resend დომენი) | კი |
| 2 | Supabase Auth პარამეტრები | BLOCKED_OWNER | GG | არა (security) |
| 3 | Vertex migration | Preview-ზე PROVEN, Production-ში არა | GG (IAM + env), Claude (შემოწმება) | არა პირდაპირ (provider boundary-ს ნაწილი) |
| 4 | Provider boundary | **FAILED** | GG (action 9), შემდეგ Claude | კი |
| 5 | Video Director V1–V6 | BUILT_NOT_PROVEN | GG (Preview-ზე ერთი გაშვება), Claude | კი |
| 6 | Agent G Live Voice | BUILT_NOT_PROVEN | GG (რეალური ტელეფონი) | კი |
| 7 | Browser Control | **MISSING** | GG (ინფრასტრუქტურის გადაწყვეტილება) | კი |
| 8 | One Window | BUILT_NOT_PROVEN (ნაწილი PROVEN) | Claude + GG (Studio V2) | არა |
| 9 | BOG / Stripe | **FAILED** (გადახდა არასდროს დასრულებულა) | GG (BOG credentials), შემდეგ Claude | კი |
| 10 | Pricing | **FAILED** (რამდენიმე ცხრილი) | GG (კანონიკური ცხრილი), შემდეგ Claude | კი |
| 11 | Supabase schema drift | **FAILED** (124 / 160) | Claude (ტრიაჟი) + GG (თითო ფუნქციაზე) | არა პირდაპირ |
| 12 | Security | PARTIAL | GG (2 თანხმობა), Claude | P0 დახურულია |
| 13 | Library | BUILT_NOT_PROVEN, RLS PROVEN | Claude + GG (live ტესტი) | არა |
| 14 | Admin | deployed; ნაწილი PROVEN | Claude + GG | P1 დახურულია |
| 15 | KA / EN / RU | key parity PROVEN | Claude | არა |
| 16 | Mobile | BUILT_NOT_PROVEN | GG (მოწყობილობები) | არა |
| 17 | E2E | ლოკალური; Preview-ზე ავტორიზებული E2E არ არის | Claude + GG (Supabase გაყოფა) | არა |
| 19 | Agent G: ავტონომიური media და ფაილების შესრულება (GG, 2026-10-09 09:32Z, კრიტიკული) | **MISSING** | Claude (slice 1); GG (sandbox-ის ინფრასტრუქტურა, deploy) | კი (Agent G ორკესტრატორია) |
| 18 | GCP Billing → Credits ფოტო | BLOCKED_OWNER | GG (2026-10-09 16:00Z-ის შემდეგ) | არა |

### 4.1 Auth / Resend (AUTH-2)
- **სტატუსი:** FAILED Production-ში. ელფოსტის კოდით შესვლა, რეგისტრაცია და პაროლის აღდგენა არ მუშაობს. AUTH-1 (კოდის სიგრძე) Production-შია 2026-10-09-დან; ფოსტას Resend აჩერებს.
- **პასუხისმგებელი:** GG.
- **დამოკიდებულება:** `myavatar.ge`-ის DNS-ზე წვდომა; Resend ანგარიში, რომლის გასაღებიც `RESEND_API_KEY`-შია.
- **მტკიცებულება:** Vercel log 2026-10-08 13:57:04Z `resend 403 "The myavatar.ge domain is not verified"`; Supabase `generate_link` 200 იმავე მოთხოვნაზე.
- **DoD:** resend.com/domains-ში `myavatar.ge` = Verified → Production-ში ერთი ახალი რეგისტრაცია კოდით შედის → პაროლის აღდგენის წერილი მოდის → Vercel log-ში 403 აღარ ჩანს.

### 4.2 Supabase Auth პარამეტრები
- **სტატუსი:** BLOCKED_OWNER.
- **პასუხისმგებელი:** GG (Supabase Dashboard → Authentication).
- **რა:** (ა) leaked-password protection ჩართვა (Security Advisor-ის ერთ-ერთი 2 დარჩენილი warning); (ბ) დადასტურება, რომ „Confirm email“ ჩართულია — PR #45-ის admin წესი დადასტურებულ ელფოსტას ეყრდნობა.
- **DoD:** Advisor-ში leaked-password warning აღარ არის; Auth settings-ის სქრინი „Confirm email: on“.

### 4.3 Vertex migration
- **სტატუსი:** Preview-ზე PROVEN (Gemini AUTH 18:13Z და INFERENCE 18:28Z; Veo INFERENCE 15:49Z, 2026-10-08). Production-ში ყველა Google გამოძახება ჯერ API key-ით მიდის (AI Studio-ს ბალანსი, არა $300 კრედიტი).
- **პასუხისმგებელი:** GG — IAM და Production env; Claude — ბრძანებების მომზადება და შემოწმება.
- **დამოკიდებულება:** WIF provider-ის პირობა დღეს მხოლოდ `preview` გარემოს იღებს → `part0-wif.sh`-ის ხელახლა გაშვება GG-ის Mac-ზე `VERCEL_ENVIRONMENTS="preview production"`-ით; Production-ში 8 `GCP_*` ცვლადი + `GEMINI_TRANSPORT=vertex` + `VEO_TRANSPORT=vertex`; deploy. Live voice (Gemini Live) და Deep Research (Interactions API) Vertex-ზე ვერ გადავა (A3 server relay საჭიროა, Interactions მხოლოდ Gemini API-ზეა). Imagen 4 Vertex-ზე 404-ია.
- **მტკიცებულება:** `docs/handoffs/2026-10-08-gcp-part0-report.md` §9; სერტიფიკაცია §J, §L.
- **DoD:** Production-ში `/api/admin/google-transport` → `vertex`, 200; admin provider probe → `veo … auth:token:ok bucket:ok sign:ok`; ერთი GG-ის მიერ დადასტურებული Veo smoke Production-ში; Cloud Monitoring-ში გადაყვანილი გზების `generativelanguage` გამოძახებები 0-ია.

### 4.4 Provider boundary
- **სტატუსი:** FAILED. ჩუმი fallback-ები მოხსნილია (image, text, music, voice; deployed). Primary-დ ჯერ კიდევ აკრძალული provider-ებია: avatar (HeyGen / SadTalker), swap / motion / product ad (Kling, Higgsfield), 3D (TRELLIS), interior (World Labs), music-ის რამდენიმე რეჟიმი (Udio, MusicGen, MiniMax, RVC), cover art (Pollinations); image NanoBanana third-party reseller-ია, არა Google.
- **პასუხისმგებელი:** GG (action 9: 2026-10-08 17:16Z „ჯერ არა“), შემდეგ Claude.
- **დამოკიდებულება:** action 9; Google-ის ჩამნაცვლებელი თითო სერვისზე (image → `gemini-3.1-flash-image`; music → Lyria; avatar / 3D / swap-ს Google-ის ჩამნაცვლებელი არ აქვს → „მალე“).
- **კოდში დარჩენილი ჩუმი fallback:** avatar-ის lip-sync HeyGen-ის ჩავარდნისას SadTalker-ზე (Replicate) გადადის (`lib/ai/lipsync.ts:318-350`) — R7-ის დარღვევა; action 9-თან ერთად უნდა მოიხსნას.
- **Production-შია (PR #48, `7126682`):** `/api/ai` აღარ იძახებს Anthropic-ს (`claude-sonnet-4-6`) — ახლა Gemini-ა, `76e8c525`.
- **Production-შია 2026-10-09 08:07Z-დან (`ba74fa21`, PR #49 → `29e7d67`):** `/api/orbit/agent` Google-only-ში (ნაგულისხმევი) 404-ს აბრუნებს. აქამდე ნებისმიერ შესულ მომხმარებელს OpenRouter / OpenAI-ის პასუხს აძლევდა (`chatEngine.executeStream`), კრედიტის ჩამოჭრის გარეშე, თუმცა მას არცერთი ეკრანი არ იძახებს. Music-ის cover art Google-only-ში აღარ მიდის Pollinations.ai-ზე (გარე უფასო სერვისი, რომელსაც ყოველი ფასიანი brief-ის ინგლისური თარგმანი ეგზავნებოდა); track ახლა cover-ის გარეშე მოდის (`coverUrl` არ არის, როგორც cover-ის ნებისმიერი ჩავარდნისას). Google-ის cover GG-ის image ძრავის გადაწყვეტილებაა (action 9). ორივე ბრუნდება მხოლოდ `AI_GOOGLE_ONLY=0`-ით.
- **Regression guard (`ba74fa21`):** `__tests__/provider-boundary.test.ts` კითხულობს `app/`, `lib/`, `components/`, `workers/`, `services/`, `hooks/`, `store/`, `types/`, `middleware.ts`-ის runtime კოდს (კომენტარებს არა): აკრძალული vendor-ის host string / template literal-ში ან SDK-ის value import. დღევანდელი მდგომარეობა გაყინულია `__tests__/provider-boundary.allowlist.json`-ში: 22 vendor, 60 ფაილი, 94 ჩანაწერი. ახალი ფაილი აკრძალულ vendor-თან → ტესტი ვარდება; ფაილი, რომელიც vendor-ს აღარ იძახებს, სიიდან უნდა წაიშალოს (სია მხოლოდ მცირდება). შემოწმდა: ახალ ფაილში `api.replicate.com` → ვარდება.
- **მტკიცებულება:** სერტიფიკაცია §L; PR #44-ის აუდიტი (3.2).
- **DoD:** სტატიკური ტესტი, რომელიც ვარდება, თუ `app/`, `lib/`, `workers/`, `services/` რომელიმე აკრძალულ host-ს იძახებს (ratchet არის, allowlist-ი ცარიელი უნდა გახდეს); Production-დან ამოღებულია Replicate / Udio / Higgsfield / HeyGen გასაღებები; Google-ის ძრავის გარეშე დარჩენილი სერვისები კატალოგში „მალე“-ა.

### 4.5 Video Director V1–V6
- **სტატუსი:** BUILT_NOT_PROVEN. Director (169 ტესტი) სტუდიოშია `VIDEO_DIRECTOR_RUNS`-ის უკან: Preview-ზე `admin`, Production-ში გამორთული. `director_runs` ცხრილი Production-შია, 0 ჩანაწერი. ცოცხლად ერთი Veo კლიპია დამტკიცებული (smoke ღილაკი), director-ის გაშვება — არც ერთი.
- **პასუხისმგებელი:** GG (Preview-ზე admin-ით შესვლა და ერთი 2-კადრიანი storyboard-ის Approve; ფასიანი, ≈ $0.80), Claude (შედეგის შემოწმება ledger-სა და log-ში).
- **დამოკიდებულება:** Preview-ზე შესვლა (AUTH-2 ან Google OAuth + Supabase redirect pattern Preview alias-ისთვის); Vertex Preview-ზე (უკვე არის).
- **მტკიცებულება:** სერტიფიკაცია §J; `lib/video/director/*`.
- **DoD:** ერთი director run Preview-ზე ბოლომდე (ან სწორად ჩერდება ჩავარდნილ კადრზე); `credit_ledger`-ში თითო კადრზე ერთი ჩამოჭრა და ჩავარდნილზე refund; prompt-ები wire-ზე უცვლელია; ამის შემდეგ GG წყვეტს Production flag-ს.

### 4.6 Agent G Live Voice
- **სტატუსი:** BUILT_NOT_PROVEN. `ask_agent_g`, ტექსტი↔ხმის ერთიანი კონტექსტი და ხმით გენერაცია (ფასი → „კი“ → 3 წმ countdown) აწყობილია და unit-ტესტირებულია; ცოცხალ ზარზე არ არის ნაცადი. Live Gemini API key-ით მუშაობს, არა Vertex-ით.
- **პასუხისმგებელი:** GG (რეალური iPhone / Android ზარი), Claude (A3 — Vertex relay, ცალკე სამუშაო).
- **დამოკიდებულება:** შესვლა Production-ში (AUTH-2) ან Google OAuth.
- **მტკიცებულება:** სერტიფიკაცია §E; `app/api/voice/live/route.test.ts`, `lib/voice/liveThread.ts`.
- **DoD:** ცოცხალ ზარზე: მიკროფონი → პასუხი ხმით; ტექსტური ჩატის კონტექსტი ხმაში ჩანს და პირიქით; `ask_agent_g` წყაროებიან პასუხს აბრუნებს; ხმოვანი „კი“ ერთხელ ჩამოჭრის და ერთ გენერაციას იწყებს.

### 4.7 Browser Control
- **სტატუსი:** MISSING. არც remote / headless ბრაუზერი, არც navigation / snapshot / screenshot, არც §32-ის approve-then-run.
- **პასუხისმგებელი:** GG (ინფრასტრუქტურა: hosted ბრაუზერი ახალი provider-ია §A-ს გარეთ; Vercel function-ში headless ბრაუზერი ვერ იმუშავებს), შემდეგ Claude.
- **დამოკიდებულება:** GG-ის გადაწყვეტილება: ააშენო (რომელ ინფრასტრუქტურაზე) თუ launch-იდან ოფიციალურად ამოიღო (მაშინ §55 წერილობით უნდა შეიცვალოს).
- **DoD (თუ შენდება):** სესია, navigation, screenshot, მაღალი რისკის მოქმედებაზე მომხმარებლის დადასტურება, E2E ტესტი.

### 4.8 One Window
- **სტატუსი:** BUILT_NOT_PROVEN; ნაწილი PROVEN live: `/ka/hub` → `/ka/dashboard` (2026-10-09 03:37Z), `/ka/studio` → `/ka` (STUDIO_V2 გამორთულია, 06:1xZ).
- **პასუხისმგებელი:** Claude (legacy registry-ები `/api/pipeline`-ში და `/api/agents/*`-ში), GG (Studio V2: გაერთიანება თუ გაუქმება).
- **DoD:** ერთი სამუშაო გვერდი; 22-ვე კატალოგის სერვისი `?tool=`-ით იმავე ფანჯარაში იხსნება (E2E ტესტი ყველა სერვისზე); მეორე იმპლემენტაცია მიუწვდომელია.

### 4.9 BOG / Stripe
- **სტატუსი:** FAILED. Production-ში გადახდა არასდროს დასრულებულა: 4 BOG შეკვეთა, 4-ვე `init_failed` (BOG-მა შეკვეთა არ შექმნა, არავის ჩამოეჭრა). Stripe-ის subscription არ არსებობს.
- **პასუხისმგებელი:** GG (BOG live credentials / merchant activation, ≈ 2026-10-10; Stripe Live endpoint-ზე `charge.refunded` და `charge.dispute.created`), შემდეგ Claude.
- **დამოკიდებულება:** BOG-ის merchant პანელი; Vercel Production env (Claude-ს Vercel connector 403-ს აბრუნებს).
- **მტკიცებულება:** `bog_orders` (06:0xZ); სერტიფიკაცია §N; `reject_reason`-ის ჩაწერა უკვე Production-შია.
- **DoD:** 10 ₾-იანი top-up BOG-ის გვერდამდე (უფასო) → `reject_reason` ცარიელია და შეკვეთა შეიქმნა → ერთი რეალური მცირე გადახდა → `bog_orders` completed, `credit_ledger`-ში ერთი grant, ბალანსი სწორია, განმეორებითი callback მეორე grant-ს არ აკეთებს.

### 4.10 Pricing
- **სტატუსი:** FAILED (ერთი სიმართლის წყარო არ არის). Live (PROVEN, `/ka/pricing` 06:1xZ): Basic $19.99 ≈ 54 ₾ / 230 კრედიტი, Pro $39.99 ≈ 108 ₾ / 525, Business $79.99 ≈ 216 ₾ / 1,200 (`lib/billing/tiers.ts`). სტუდიოს top-up პაკეტები: 9 / 29 / 89 ₾ = 90 / 290 / 890 კრედიტი, ანუ 10 კრედიტი ლარზე (`lib/credits/pricing.ts`). გამოწერით ლარზე ≈ 4.3–5.6 კრედიტი მოდის, პაკეტით 10. `lib/billing/pricingConfig.ts`-ში სხვა რიცხვებიცაა.
- **პასუხისმგებელი:** GG (კანონიკური ცხრილი), შემდეგ Claude.
- **DoD:** ერთი ცხრილი კოდში; `/pricing`, სტუდიო, CreditsModal და BOG checkout მას კითხულობენ; ტესტი ამაგრებს რიცხვებს.

### 4.11 Supabase schema drift
- **სტატუსი:** FAILED. კოდი 160 ცხრილს იძახებს, Production-ში 124 არ არსებობს (2026-10-08; Production-ში ცხრილების რაოდენობა დღესაც 52-ია). ცოცხალი 500 ერთი იყო და გასწორდა; WhatsApp-ის მიბმა, push, affiliate, Stripe dedupe, თვიური ლიმიტის ჩვენება ჩუმად არაფერს აკეთებს.
- **პასუხისმგებელი:** Claude (ტრიაჟი: ფუნქცია ცოცხალია თუ მკვდარი, მკვდრის ამოღება ან გამორთვა), GG (ყოველი ახალი ცხრილი = ბაზის ცვლილება).
- **დამოკიდებულება:** Preview და Production ერთ Supabase-ს იყენებს (owner action 11), ამიტომ მიგრაციის Preview-ზე ცდა Production-ს ეხება.
- **მტკიცებულება:** `docs/handoffs/2026-10-08-production-schema-drift.md`.
- **Regression guard (2026-10-09, ნაწილი 9):** `__tests__/schema-drift.test.ts` + `__tests__/schema-drift.snapshot.json`. Snapshot წაკითხულია Production-იდან 08:25Z-ზე (read-only): 52 ცხრილი, 39 ფუნქცია (pgvector-ის გარეშე), იგივე 52, რაც 2026-10-08-ზე. ტესტი კითხულობს runtime კოდის `.from()` / `.rpc()` სახელებს (literal ან იმავე ფაილის `const`; `.storage.from()` bucket-ია და გამოტოვებულია). დღეს კოდი 166 ცხრილს და 27 ფუნქციას იძახებს; Production-ში არ არის **125 ცხრილი და 11 ფუნქცია**, ისინი გაყინულია `missing`-ში (სია მხოლოდ მცირდება); 5 ფაილი სახელს run time-ში აწყობს (`dynamic`). ახალი სახელი, რომელიც Production-ში არ არის → ტესტი ვარდება. შემოწმდა: `missing`-იდან ცხრილის და ფუნქციის ამოღება, `missing`-ში კოდისთვის უცნობი სახელის ჩამატება, `dynamic`-იდან ფაილის ამოღება → 4 ტესტი ვარდება.
- **ახლად ნაპოვნი (ტრიაჟისთვის, არაფერი შეცვლილა):** 2026-10-08-ის სიას `const`-ით დასახელებული 3 ცხრილი აკლდა: `research_jobs`, `research_context_files` (Research / Connectors; `lib/research/capabilities.ts` ჯერ ამოწმებს ცხრილს და „მალე“-ს აჩვენებს, ანუ შეგნებულად დახურულია), `user_plugin_settings` (`lib/plugins/settings.ts`). `app/api/invoices/generate` იძახებს `.from('auth.users')`-ს, რაც PostgREST-ში ვერასოდეს იმუშავებს (მკვდარი გზა: `orders` ცხრილიც არ არის, ეკრანი არ იძახებს). 11 ფუნქცია არ არის, მათ შორის `deduct_credits_transaction`, `ensure_user_billing_rows`, `reset_user_credits_if_due` (`lib/billing/enforce.ts`, Stripe webhook), `claim_next_job` (`workers/shared/queue.ts`), `match_rag_documents`.
- **ტრიაჟი (2026-10-09, ნაწილი 11):** ყველა ცოცხალი გზა ხელით წაკითხულია; შედეგი და GG-ის 5 გადაწყვეტილება (1-ლი მიღებულია: ობოლი გვერდები გაუქმდა) `docs/handoffs/2026-10-08-production-schema-drift.md`-ის ბოლო ნაწილშია. მოკლედ: `debit_wallet_gel` მკვდარია (ჩამოჭრას არც ერთი ცოცხალი გზა არ ითხოვს; ფილმი და მუსიკალური ვიდეო თანხას წინასწარ ჭრის), ანუ შემოსავლის დანაკარგი არ არის; RAG მკვდარია; Research და Plugins შეგნებულად დახურულია; სამი ობოლი გვერდი (`/services/workflow`, `/account/invoices`, `/admin/disputes`) მისამართით გახსნისას არ მუშაობს. გასწორდა: Vapi-ს ორი webhook საიდუმლოს გარეშე ხელმოწერას არ ამოწმებდა (`7cc1a781`).
- **DoD:** კოდის ყოველი `.from()` სახელი Production-ში არსებობს, ან ის გზა წაშლილია / გამორთულია; ~~სტატიკური ტესტი Production-ის სქემის snapshot-ით ახალ drift-ს არ უშვებს~~ (ნაწილი 9).

### 4.12 Security
- **სტატუსი:** PARTIAL. დახურულია: STORAGE-1 (P0), ფუნქციების 17 warning, request-ით დასახელებული მედიის ხელმოწერა, share გვერდის `javascript:` ბმული, ElevenLabs voice id, avatars `owner_id` გაჟონვა, `jobs`-ის ორი გზა. ღიაა:
  - ~~`renders` bucket public (494 ობიექტი)~~ → `20261009b` გაშვებულია 07:14Z (GG-ის „Deploy + renders“), PROVEN (ნაწილი 7);
  - leaked-password protection (4.2);
  - `vector` გაფართოება `public`-ში (დაბალი; გადატანას `match_memories`-ის `search_path`-ის შეცვლაც სჭირდება);
  - `avatars` bucket public (პროფილის და Live avatar-ის ფოტოები `getPublicUrl`-ით; დიზაინის გადაწყვეტილებაა, GG);
  - HawkScan DAST არ გაშვებულა (`HAWK_API_KEY` არ არის);
  - prompt injection-ის adversarial ტესტი და DB დონის RLS ტესტი CI-ში — MISSING.
  - დახურულია და Production-შია PR #48-ით (`7126682`, 07:13Z): ანონიმური realtime voice token, ცნობილი dev secret-ით ხელმოწერა, `mock-stt` ყალბი transcript, `/api/ai`-ის უფასო ფასიანი გამოძახება.
- **პასუხისმგებელი:** GG (Auth პარამეტრი, `HAWK_API_KEY`; `20261009b` გაშვებულია), Claude (ტესტები).
- **DoD:** Advisor 0 warning (ან თითოეული წერილობით მიღებული); `renders` private და ძველი signed ბმულები მუშაობს; DAST high finding-ების გარეშე; adversarial ტესტები CI-ში.

### 4.13 Library
- **სტატუსი:** BUILT_NOT_PROVEN; ცხრილების იზოლაცია PROVEN Production-ში (2026-10-08 22:20Z: anon და ორი მომხმარებელი, rollback-იანი ტრანზაქციებით). დუბლიკატის ამოცნობა MISSING (launch blocker არ არის).
- **პასუხისმგებელი:** Claude + GG (ცოცხალი ტესტისთვის შესული მომხმარებელი).
- **DoD:** შესული მომხმარებელი ქმნის, ინახავს, ხელახლა ხსნის და შლის ნამუშევარს; ფაილი storage-იდანაც იშლება; სხვა მომხმარებელი მას ვერ ხედავს.

### 4.14 Admin
- **სტატუსი:** Production-შია (PR #45). `run-migration` 404 PROVEN live; ერთიანი admin წესი BUILT_NOT_PROVEN live. „Pipeline“ ბარათი Production-ში ჯერ მცდარს ამბობს („Udio (primary)“, FLUX anchor, Kling); ამ branch-ზე გასწორებულია (`d387508e`). სხვაგან დარჩენილი ძველი ტექსტიც გასწორდა `505066c4`-ში: `/api/health/providers`-ის `pipeline` ბლოკი Google-only რეჟიმში ახლა Veo-ს და Gemini-ის frame მოდელს ასახელებს (FLUX anchor და Kling მხოლოდ Google-only-ის გამორთვისას), Lyria-ს შეცდომის ანგარიში კი აღარ ამბობს Udio / MusicGen fallback-ს (მის უკან არაფერი ეშვება, R7). ორივე ტესტით დაფიქსირებულია; Production-ში ჯერ არ არის.
- **პასუხისმგებელი:** Claude (ბარათის გასწორება), GG (admin-ით შესვლის ცოცხალი შემოწმება; „Confirm email“, 4.2).
- **DoD:** GG admin-ით შედის და პანელი იხსნება; არა-admin `/api/admin/*`-ზე 404-ს იღებს; Pipeline ბარათი კოდის რეალურ ძრავებს აჩვენებს (ტესტით).

### 4.15 KA / EN / RU
- **სტატუსი:** key parity PROVEN დღეს (`[i18n-parity] OK`; 2026-10-08-ზე 742 / 742 / 742). სტატიკური აუდიტი გაკეთდა 2026-10-09 (`ba74fa21`), სქრინებით აუდიტი — არა. მეთოდი: import graph `app/**/page|layout`-იდან (569 ფაილი მისაწვდომია), ka/en-only ternary-ები და `{ ka, en }` ობიექტები `ru`-ს გარეშე, `t('key')`-ები, რომლებიც `messages/`-ში არ არის. ნაპოვნი და გასწორებული:
  - `/account/billing` ჩატვირთვისას სამივე ენაზე `billing.history.loading`-ს წერდა (key არ არსებობდა; next-intl key-ს აჩვენებს, `|| 'Loading…'` არ მუშაობს) → key დამატებულია + ტესტი, რომელიც კოდის ყოველ literal `t(key)`-ს `ka.json`-ში ამოწმებს (`lib/i18n/messagesParity.test.ts`);
  - ვიდეოს „სცენები და კამერა“ პანელის 43 ვარიანტი (მოძრაობა, კადრი, რაკურსი, ობიექტივი) რუსულ UI-ში ინგლისურად ჩანდა → რუსული სახელები + ტესტი (`lib/veo/cinematography.test.ts`);
  - საფულის „min“ ნიშანი რუსულად → „мин.“.
  - დანარჩენი: მისაწვდომ ეკრანებზე ka/en-only ternary-ების უმეტესობა შრიფტის ზომაა (ქართულს უფრო დიდი სჭირდება), არა ტექსტი. Admin პანელი (11 ფაილი) მხოლოდ ka / en-ია — admin-ისთვის, მიზანმიმართულად. `lib/business-agent/generator.ts` და `dialogueLanguageWarning` რუსულს არ იცნობს, მაგრამ მათ არცერთი ეკრანი არ იძახებს. ინგლისურად hardcoded ტექსტის (თარგმანის გარეშე) ავტომატური ძებნა და სქრინები — NOT PROVEN.
- **პასუხისმგებელი:** Claude.
- **DoD:** ყველა გვერდი სამ ენაზე სქრინებით, უთარგმნელი სტრიქონების ავტომატური ძებნა (ლათინური ტექსტი ka/ru UI-ში) ნულზე.

### 4.16 Mobile
- **სტატუსი:** BUILT_NOT_PROVEN. ტელეფონის viewport-ის (375×812) E2E ლოკალურად გადის; რეალური მოწყობილობები — არა.
- **პასუხისმგებელი:** GG (iPhone + Android), Claude (ჩავარდნების გასწორება).
- **DoD:** iPhone და Android-ზე: სტუდიო, შესვლა, Live voice, checkout — ჩავარდნის გარეშე.

### 4.17 E2E
- **სტატუსი:** PARTIAL. CI-ში მხოლოდ `tests/preview-e2e.spec.ts` გადის (mock-ებით, „E2E - Preview Contract“, მწვანე `66d7163f`-ზე). სრული ლოკალური Playwright (27 spec, 251 ტესტი) ბოლოს 2026-10-08-ზე: 239 passed, 10 skipped, 2 ჩავარდა დატვირთვით და ცალკე გაშვებისას გადის. 2026-10-09, ეს branch (`76e8c525`+), ლოკალურად: სრული გაშვება Supabase env-ის გარეშე — 220 passed, 21 failed, 10 skipped; 21-ის ხელახლა გაშვება CI-ის dummy Supabase ცვლადებით — 19 passed; დარჩენილი 2 ცალკე, ორჯერ: `live-voice-e2e.spec.ts:30` ორჯერვე გავიდა (დატვირთვა იყო), `landing.spec.ts:380` („when the image lands…“) 5-დან 4-ჯერ ვარდება (phone და desktop). მიზეზი: `/brand/v1/card-image.jpg`-ის მოთხოვნა იგზავნება, პასუხი არ მოდის, სურათი 0×0 რჩება. ეს branch ამ ეკრანს და static ფაილებს არ ეხება; ტესტი CI-ში არ გადის. 2026-10-09 გამოკვლევა: service worker არ არის (`sw.js` მხოლოდ production-ში რეგისტრირდება, Playwright `next dev`-ს უშვებს); Supabase-ის dummy host სწრაფად ვარდება. 15 წამზე სურათის მოთხოვნასთან ერთად 28–36 `/api/*` მოთხოვნა ელოდება `next dev`-ის route-ების პირველ კომპილაციას. დასკვნა: ეს მოთხოვნები Chrome-ის 6 კავშირს ერთ host-ზე ავსებს და სურათი რიგში რჩება. **PROVEN, რომ dev სერვერის ეფექტია:** იგივე ტესტი `7c8dd9b3`-ის production build-ზე (`next build` + `next start`, CI-ის dummy Supabase env) 10 / 10 გავიდა (phone + desktop, `--repeat-each=5`); `next dev`-ზე (`76e8c525`+, landing-ს და static ფაილებს მას შემდეგ არაფერი შეხებია) 5-დან 4 ვარდებოდა. Production-ის სურათის ჩვენებას არ ეხება. ამავე გაშვებამ სხვა რამ აჩვენა: production build-ზე მთელი `landing.spec.ts`-დან (54) 4–5 ტესტი ვარდება, რომლებიც `next dev`-ზე გადის, ორი მიზეზით: (1) phone-ზე `?tool=video` ბმული Video-ს Create ფურცელს ხსნის (`OmniStudio.tsx:2994`, დიზაინით: Video-ს prompt ფურცელშია), და ფურცლის ფონი header-ის „შესვლა“-ს და „+“-ს ფარავს (3 ტესტი, 60 წმ timeout); (2) production build `/api/analytics/track`-ზე POST-ს აგზავნის, ტესტი კი ცარიელ Enter-ზე არცერთ POST-ს არ ელის. ~~რატომ არ ხსნის dev სერვერი იმავე ფურცელს, არ გამოკვლეულა~~ → **PROVEN (ნაწილი 10):** React-ის StrictMode (მხოლოდ dev-ში) mount-ის effect-ებს ორჯერ უშვებს, და „ჩატში ფურცელი დაიმალოს“ effect-ის მეორე გაშვება (პირველი render-ის `chatOnly = true`-ით) deep link-ის ახლად გახსნილ ფურცელს ხურავდა. ანუ CI-ის E2E phone-ზე ხედავდა ეკრანს, რომელსაც Production არ აჩვენებს. ეს effect ახლა მხოლოდ ჩატში შესვლისას ხურავს (Production-ის ქცევა არ იცვლება), ტესტები phone-ის რეალურ ქცევას ამოწმებს, analytics-ის log ფონურ მოთხოვნად ითვლება. ჯამი: 241 არა-skipped ტესტიდან 240 გადის. Preview-სა და Production-ზე ავტორიზებული E2E (შესული მომხმარებლით) არ არსებობს.
- **პასუხისმგებელი:** Claude; GG — Preview-სა და Production-ის Supabase-ის გაყოფა (owner action 11) და სატესტო ანგარიში.
- **DoD:** CI-ში E2E Preview-ზე, სატესტო ანგარიშით, ცალკე Supabase-ზე: შესვლა, ერთი უფასო მოქმედება, Library, გასვლა.

### 4.18 GCP Billing → Credits ფოტო
- **სტატუსი:** BLOCKED_OWNER (Part 0, პუნქტი 7).
- **პასუხისმგებელი:** GG, 2026-10-09 16:00Z-ის შემდეგ.
- **DoD:** Billing → Reports (project `gen-lang-client-0671348730`, SKU-ით) და Billing → Credits-ის ფოტო; მოსალოდნელია Subtotal ≈ $0 და კრედიტი ≈ $299.49 (სულ ≈ $0.51 დაიხარჯა, გამოთვლილი).

### 4.19 Agent G: ავტონომიური media და ფაილების შესრულება
- **სტატუსი:** MISSING. Agent G-ს (`lib/agent/react/bindLiveAgent.ts`) media tool შეგნებულად არ აქვს: ძველი `orchestrate_media` მხოლოდ `generation_jobs`-ში წერდა რიგს, რომელსაც არავინ ასრულებდა, და კრედიტს არ იჭერდა. ამიტომ Agent G დღეს მხოლოდ brief-ს წერს და მომხმარებელს Studio-ში აგზავნის.
- **პასუხისმგებელი:** Claude (slice 1 და შემდეგ სხვა სერვისები); GG: კოდის sandbox-ის ინფრასტრუქტურა (ახალი, შესაძლოა ფასიანი), Preview-ზე E2E-ის დადასტურება, deploy.
- **დამოკიდებულება:** არსებული Studio lane-ები, `lib/video/ffmpegExec.ts`, Credit Ledger (reserve / refund), job-ის ცხრილები, Library. Production-ში `service_jobs` არ არის (4.11), ამიტომ slice 1 Production-ში არსებულ job ცხრილს უნდა დაეყრდნოს.
- **მტკიცებულება:** `PROJECT_MASTER.md` Section F (GG-ის 6 პუნქტი, წესები, DoD AG-1 … AG-8).
- **არსებული მდგომარეობა (2026-10-09, კოდის წაკითხვით):**
  - Studio-ს ჩატი მარშრუტს კლიენტში ირჩევს (`components/studio/OmniStudio.tsx` `send()`); `/api/chat/gemini` მხოლოდ ტექსტს აბრუნებს. ReAct აგენტს (`/api/agent/run`) მხოლოდ Live voice-ის `ask_agent_g` და AgentTerminal იძახებს.
  - Montage lane (`/api/v2/montage/render`, `lib/services/montage/*`) უკვე აკეთებს N კლიპი + მუსიკა → ერთი MP4-ს (`ffmpeg-static` Vercel-ზე, 600 წმ-მდე, `renders` bucket, `generation_jobs`-ის რიგი = Library). კრედიტს არ ჭრის (Montage Studio-ში export უფასოა).
  - **ჩუმი გადახვევა დღეს:** ჩატში რამდენიმე ვიდეო + ტრეკი + „მუსიკაზე დაამონტაჟე“ remix-ზე მიდის: იღებს მხოლოდ პირველ ვიდეოს, ჭრის 15 კრედიტს, დანარჩენ კლიპებს ჩუმად აგდებს.
  - beat-ის ამოცნობა კოდში არ არის. Composer: მაქსიმუმ 5 მიმაგრება; აუდიო ~4 MB inline ლიმიტში ითვლება, ამიტომ 3 MB-ზე დიდი მუსიკა უარყოფილია.
- **Slice 1-ის გეგმა (ახალი pipeline-ის გარეშე):**
  1. `lib/services/montage/beatPlan.ts` (ახალი, სუფთა ფუნქციები): ffmpeg-ით მუსიკის PCM → ენერგიის onset-ები და ტემპი → თითო კლიპის `startSec` / `endSec` beat-ებზე, მუსიკის სიგრძით (300 წმ-მდე), `musicOnly: true`.
  2. ერთი სერვერის მოქმედება, ორი ფაზით: `quote` (ანალიზი, გეგმა, ფასი; არაფერს ხარჯავს) და `run` (მხოლოდ დადასტურების შემდეგ; idempotency key; ფასიანის შემთხვევაში ledger reserve + `recordJobReservation` + refund შეცდომისას; `generation_jobs`-ში პროგრესი; ffprobe QC; audit log). ის არსებულ `runMontage`-ს იძახებს.
  3. `bindLiveAgent.ts`: ReAct აგენტს ემატება tool, რომელიც მხოლოდ quote-ს ამზადებს; შესრულება მხოლოდ მომხმარებლის დადასტურებით (ასე იხსნება „media tool არ არის“ შეზღუდვა ხარჯის რისკის გარეშე).
  4. OmniStudio: ≥2 ვიდეო + 1 აუდიო + მონტაჟის განზრახვა → ყველა ფაილი `uploadBigFile`-ით → quote ბარათი ჩატში → დადასტურება → MP4 იმავე ჩატში (player, Download), Library-ში. ჩუმი remix-ის გზა ამ შემთხვევაში აღარ ირთვება.
  5. ყველაფერი `AGENT_G_MEDIA_EXEC` flag-ის უკან (default off), რომ PR #50-ის merge-მა ნახევრად აშენებული არაფერი ჩართოს.
  6. ტესტები: beat planner, quote არ ხარჯავს, იგივე key ორჯერ არ ჭრის, შეცდომა აბრუნებს, სხვისი ფაილი უარყოფილია; შემდეგ E2E Preview-ზე.
- **GG-ის გადაწყვეტილება:** Agent G-ის მონტაჟის ფასი (დღეს Montage Studio-ში უფასოა; ფასის დამატება ფასების ცხრილის ცვლილებაა). კოდის (Python) sandbox ახალი ინფრასტრუქტურაა: slice 1-ში არ შედის, ცალკე გადაწყვეტილებაა.
- **DoD (slice 1, „ჩემი კლიპები ამ მუსიკაზე დაამონტაჟე“):** Agent G-ის tool არსებულ lane-ს იძახებს; მხოლოდ მომხმარებლის საკუთარი ფაილები; ფასი ჩატში ჩანს და დადასტურებამდე არაფერი იჭრება; job-ს აქვს პროგრესი, cancel, retry ორმაგი ჩამოჭრის გარეშე, recovery, refund; ffprobe QC; MP4 იმავე ჩატში ირთვება, ჩამოიტვირთება და Library-შია; audit log; E2E Preview-ზე ჩაწერილი მტკიცებულებით.

## 5. შეჯამება: DONE / PROVEN / NOT PROVEN / BLOCKED / NEXT ACTION

**DONE (კოდი Production-შია):** AUTH-1; ერთიანი admin წესი და `run-migration` 404; request-ით დასახელებული მედიის მფლობელის შემოწმება; share ბმულები მხოლოდ https; ჩუმი fallback-ების მოხსნა (image, text, music, voice); ServiceCatalog და `/hub` → სტუდიო; voice id-ის შემოწმება; avatars `user_id`-ზე; `jobs`-ის ორი გზა დახურული; uploads 50 MB / მხოლოდ მედია; STORAGE-1; ფუნქციების hardening.

**DONE branch-ზე, Production-ში არა (deploy GG-ის თანხმობას ელის):** ~~PR #43-ის დარჩენილი Part 0 სამუშაო (`0d239f26`); `20261009b`; PR #44-დან Redis fast-fail, `/api/ai` → Gemini, ხმის hardening (`76e8c525`); Admin Pipeline ბარათი (`d387508e`)~~ — Production-შია PR #48-ით (`7126682`, ნაწილი 7). ახალი (`ba74fa21`, Production-შია `29e7d67`-ით 08:07Z-დან): `/api/orbit/agent` 404 Google-only-ში; music cover art აღარ მიდის Pollinations-ზე; აკრძალული vendor-ების ratchet ტესტი; ka / en / ru: billing key, კამერის 43 რუსული სახელი, „мин.“.

**PROVEN:** Production `66d7163`; CI მწვანე; 14 მიგრაცია; Advisor 0 error / 2 warning; 52 / 52 ცხრილი RLS-ით; anon storage-ში მხოლოდ `music`-ს ხედავს; deploy-ის შემდეგი public შემოწმებები; Vertex AUTH + INFERENCE Preview-ზე (Gemini, Veo); key parity; jest 698 / 698 suite (branch); ლოკალური Playwright 240 / 241 (branch). `7c8dd9b3`-ზე: jest **702 / 702 suite, 10,817 passed, 3 skipped**; `tsc` 0; eslint სუფთა შეცვლილ ფაილებზე; `next build` წარმატებით; `[i18n-parity] OK`.

**NOT PROVEN:** Live voice ცოცხალ ზარზე; director run; Library ცოცხლად; admin წესი ცოცხლად; mobile მოწყობილობებზე; search / scrape ცოცხლად; analytics events; Production-ის Vertex; ~~`landing.spec.ts:380`~~ (dev სერვერის ეფექტი, PROVEN 4.17); ~~production build-ზე phone-ის 3 landing ტესტი და analytics POST~~ (მიზეზი PROVEN, გასწორდა, ნაწილი 10).

**BLOCKED (GG):** Resend დომენი; leaked-password + „Confirm email“; BOG credentials; Stripe Live events; კანონიკური ფასები; action 9; Browser Control-ის ინფრასტრუქტურა; Production Vertex (IAM + env); ~~`20261009b`-ის თანხმობა~~ (გაშვებულია 07:14Z); Supabase-ის გაყოფა; რეალური მოწყობილობები; Billing ფოტო; `HAWK_API_KEY`.

## 6. გამოსწორების რიგი

ჯერ ის, რაც ყველაზე მეტს ხსნის და ყველაზე ნაკლები დრო სჭირდება.

| რიგი | ვინ | რა | რას ხსნის |
|---|---|---|---|
| 1 | GG | Resend-ში `myavatar.ge`-ის დადასტურება (DNS TXT / MX → Verify) | შესვლა, რეგისტრაცია, აღდგენა; ყველა ცოცხალი ტესტი, რომელსაც შესული მომხმარებელი სჭირდება |
| 2 | GG | Supabase Auth: leaked-password protection ჩართვა, „Confirm email“-ის დადასტურება | Advisor warning; admin წესის საფუძველი |
| 3 | ~~GG → Claude~~ | ~~`20261009b`-ზე „კი“ → გაშვება და შემოწმება~~ **შესრულდა 07:14Z** | `renders` public gap |
| 4 | GG → Claude | BOG live credentials (≈ 2026-10-10) → უფასო 10 ₾ შემოწმება → ერთი რეალური გადახდა | billing blocker |
| 5 | GG → Claude | კანონიკური ფასების ცხრილი → ერთი SSoT კოდში + ტესტი | pricing blocker |
| 6 | GG → Claude | action 9 (აკრძალული provider-ების მოხსნა) და image ძრავის გადაწყვეტილება (მხოლოდ Google, თუ reseller მომხმარებლის არჩევით) → PR #44-ის #1 და #3 + აკრძალული host-ების ტესტი | provider boundary blocker |
| 7 | GG + Claude | Production Vertex: `part0-wif.sh` production-ისთვის, env, deploy → probe + ერთი Veo smoke | Vertex migration; $300 კრედიტის გამოყენება |
| 8 | GG → Claude | Preview-ზე ერთი director run → ledger-ის შემოწმება → Production flag-ის გადაწყვეტა | V1–V6 blocker |
| 9 | GG | რეალური ტელეფონით Live voice ზარი | Live voice blocker, mobile |
| 10 | GG | Browser Control: ინფრასტრუქტურა თუ launch-იდან ამოღება | browser blocker |
| 11 | Claude → GG | ~~schema drift-ის ტრიაჟი~~ (ნაწილი 11); ~~ობოლი გვერდები~~ (GG, 09:32Z); რჩება GG-ის 4 გადაწყვეტილება (drift doc-ის ბოლოს) | drift |
| 12 | Claude | ~~Admin Pipeline ბარათი~~ (`d387508e`); ~~`landing.spec.ts:380`-ის მიზეზი~~ (4.17); ~~providers health-ის და Lyria-ს ძველი ტექსტი~~ (`505066c4`); ~~ka/en/ru სტატიკური აუდიტი~~ (`ba74fa21`, 4.15; სქრინები რჩება); ~~აკრძალული host-ების ტესტი~~ (`ba74fa21`, ratchet, 4.4); ~~drift-ის სტატიკური ტესტი~~ (ნაწილი 9, 4.11) | admin, i18n, regression guard |
| 13 | GG → Claude | Supabase-ის გაყოფა (action 11) → ავტორიზებული E2E CI-ში | E2E |
| 14 | GG | Billing → Credits ფოტო 16:00Z-ის შემდეგ | Part 0 დახურვა |
| 15 | Claude | **შემდეგი საინჟინრო ეტაპი (GG, 09:32Z, კრიტიკული):** Agent G-ის media შესრულება, ჯერ ერთი სრული slice (კლიპები + მუსიკა → MP4 ჩატში), მერე სხვა სერვისები (4.19, PROJECT_MASTER Section F) | Agent G ორკესტრატორად |

Claude-ის დამოუკიდებელი შემდეგი სამუშაოები (Production / Billing / ბაზის ცვლილების გარეშე): 12-ე რიგი; PR #44-ის #3-ის photoshoot / interior ნაწილი; Vertex Production-ის ზუსტი ბრძანებების მომზადება GG-სთვის. PR #44-ის #2, #4, #5 უკვე ამ branch-ზეა.

## 7. დამატება: PR #48-ის deploy და `20261009b` (2026-10-09 07:08–07:15Z)

GG-მა 07:08:11Z ბარათზე აირჩია „Deploy + renders“.

| რა | შედეგი | მტკიცებულება |
|---|---|---|
| merge | PR #48 → `main`, merge commit `7126682e` (head `07b12b61`) | GitHub |
| CI `main`-ზე | მწვანე: CI 407, E2E 1079, ორივე `7126682e`-ზე | GitHub Actions |
| Production | `7126682` ~07:13Z-დან | `/api/health` 07:13:30Z |
| `20261009b` | გაშვებულია 07:14Z; `renders` `public = false`, 494 ობიექტი; migration history `20261009071401` | `storage.buckets`, `list_migrations` |
| საჯარო შემოწმება | `renders`-ის public ბმული → 400 „Bucket not found“; `/api/admin/veo-smoke` სესიის გარეშე 404; `/api/health/providers` სესიის გარეშე 401; `run-migration` 404; `/ka` 200; `/ka/login` → სტუდია 200 | Firecrawl, `maxAge 0` |

Rollback: Vercel Instant Rollback `66d7163`-ის deployment-ზე (GG) ან PR #48-ის merge-ის revert `main`-ზე; `renders`-ისთვის `UPDATE storage.buckets SET public = true WHERE id = 'renders';`.
BUILT_NOT_PROVEN live: signed ბმულები private `renders`-ზე (Supabase-ის დიზაინით მუშაობს, შემოწმებისთვის ბმული არ შექმნილა); შესული მომხმარებლის `/api/ai` და ხმის token. **Verdict: Production Ready — არა.**

## 8. დამატება: Claude-ის რიგი 12 (2026-10-09 07:35–07:55Z; Production-შია 08:07Z-დან, `29e7d67`)

| Commit | რა | მტკიცებულება |
|---|---|---|
| `ba74fa21` | `/api/orbit/agent` → 404 Google-only-ში (აქამდე OpenRouter / OpenAI ნებისმიერ შესულ მომხმარებელზე, კრედიტის გარეშე; ეკრანი არ იძახებს). Music cover art → აღარ მიდის Pollinations.ai-ზე Google-only-ში. აკრძალული vendor-ების ratchet ტესტი (22 vendor, 60 ფაილი გაყინულია allowlist-ში) | `app/api/orbit/agent/route.test.ts` (2; ძველ route-ზე 1 ვარდება); `app/api/ai/music/style.test.ts` (ახალი ტესტი ძველ route-ზე ვარდება); `__tests__/provider-boundary.test.ts` (ახალ ფაილში `api.replicate.com` → ვარდება) |
| `7c8dd9b3` | ka / en / ru: `billing.history.loading` (სამივე ენაზე key-ს წერდა); ვიდეოს კამერის 43 ვარიანტი რუსულად; საფულის „мин.“; ტესტი, რომელიც კოდის ყოველ literal `t(key)`-ს ამოწმებს | `lib/i18n/messagesParity.test.ts` (ძველ messages-ზე ვარდება); `lib/veo/cinematography.test.ts` |
| — | `landing.spec.ts:380` — dev სერვერის ეფექტი, PROVEN (4.17) | production build-ზე 10 / 10 |

**Deploy:** GG-მა 08:02:01Z ბარათზე აირჩია „Deploy“. PR #49 → `main`, merge commit `29e7d67b`; main-ის CI 411 და E2E 1083 მწვანე; Production `29e7d67` 08:07:48Z-ზე (`/api/health`). საჯარო შემოწმება: `/ka` 200, `run-migration` 404, `/ru/login` → `/ru/dashboard` 200. `/api/orbit/agent`-ის 404 და cover-ის არარსებობა live — BUILT_NOT_PROVEN (POST აქედან ვერ იგზავნება; unit ტესტები ფარავს). Rollback: Vercel Instant Rollback `7126682`-ის deployment-ზე (GG) ან merge-ის revert. DB, env, ფასი, ფასიანი გამოძახება არ შეცვლილა. **Verdict: Production Ready — არა.**

## 9. დამატება: schema drift-ის სტატიკური ტესტი (2026-10-09 08:15–08:35Z; მხოლოდ branch-ზე)

| Commit | რა | მტკიცებულება |
|---|---|---|
| ამ ნაწილის commit (PR #50) | `__tests__/schema-drift.test.ts`: კოდი ვერ დაამატებს `.from()` / `.rpc()` სახელს, რომელიც Production-ში არ არის. Snapshot: 52 ცხრილი, 39 ფუნქცია; ცნობილი ხარვეზები: 125 ცხრილი, 11 ფუნქცია, 5 dynamic ფაილი (4.11) | ტესტი 7 / 7; snapshot-ის 4 მუტაცია → 4 ტესტი ვარდება; `tsc` 0; eslint სუფთა |

Production, DB, env, ფასი არ შეცვლილა; Supabase-ზე მხოლოდ `select` გაეშვა. რიგი 11-ის ტრიაჟი (რომელი ფუნქცია მოვაშოროთ / გამოვრთოთ, რომელს სჭირდება ცხრილი) რჩება; ყოველი ახალი ცხრილი GG-ის თანხმობით.

## 10. დამატება: dev და Production phone-ზე ერთნაირად (2026-10-09 08:30–08:55Z; მხოლოდ branch-ზე)

| რა | მტკიცებულება |
|---|---|
| `components/studio/OmniStudio.tsx`: „ჩატში შესვლისას ფურცელი დაიმალოს“ effect ახლა მხოლოდ ჩატში **შესვლისას** ხურავს, mount-ზე არა. Production-ში mount-ზე ეს დახურვა ისედაც არაფერს აკეთებდა (ფურცელი დახურულია), ამიტომ Production-ის ქცევა არ იცვლება; იცვლება მხოლოდ `next dev`, რომელიც ახლა Production-ს ემთხვევა: phone-ზე `?tool=video` Video-ს Create ფურცელს ხსნის | ცვლილების შემდეგ, ტესტების შეცვლამდე, `next dev`-ზე ზუსტად ის 3 phone ტესტი ჩავარდა, რაც production build-ზე, ანუ მიზეზი დადასტურდა |
| `tests/landing.spec.ts`: `openDashboard` phone-ზე ამოწმებს, რომ ფურცელი გაიხსნა, მერე Escape-ით ხურავს; ცარიელი Enter-ის ტესტი `/api/analytics/track`-ს ფონურ მოთხოვნად თვლის (ჯობი არ არის). ძველი კომენტარები StrictMode-ის შემოვლაზე (`ui-image.spec.ts`, OmniStudio) განახლდა | `next dev`, ყველა 27 spec: 240 passed, 10 skipped, 1 failed (`landing.spec.ts:389`, სურათის ჩამოსვლა, dev სერვერის ცნობილი ეფექტი, 4.17); production build: `landing` + `ui-image` + `vfx-genjutsu` 88 / 88; jest 703 / 703 suite; `next build` წარმატებით |

Production, DB, env, ფასი არ შეცვლილა. merge და deploy GG-ის სიტყვას ელის.

## 11. დამატება: schema drift-ის ტრიაჟი (2026-10-09 09:10–09:50Z; მხოლოდ branch-ზე)

| რა | მტკიცებულება |
|---|---|
| ყოველი route-ის და გვერდის import-ის გზა მიყვანილია დაკარგულ ცხრილამდე / ფუნქციამდე, მერე თითო ხელით წაკითხული. 11 ფუნქციიდან არც ერთი ცოცხალ გზაზე არ ტყდება: `debit_wallet_gel` მკვდარია (`deduct: true` არავინ გადასცემს; `filmComposite.ts:1084`), `match_rag_documents` მკვდარია (`useRag: true`-ს კლიენტი არ აგზავნის), დანარჩენი მკვდარ ან გამორთულ გზებზეა | drift doc, „Triage update (2026-10-09)“ |
| `7cc1a781`: `/api/voice/webhook` და `/api/voice/inbound` `VAPI_WEBHOOK_SECRET`-ის გარეშე ხელმოწერას არ ამოწმებდა: ნებისმიერს შეეძლო `voice_calls`-ში ჩანაწერის შექმნა ნებისმიერი `user_id`-ით. ახლა 503. Production-ის `voice_calls` ცარიელია (0 ჩანაწერი, select), ანუ ცოცხალი Vapi არ იყენებდა | ახალი ტესტი 6 / 6, ძველ კოდზე 2 ვარდება; `voice.spec.ts` dev სერვერზე 4 passed; jest 704 / 704 suite; `tsc` 0; eslint სუფთა |
| GG-ის გადაწყვეტილებები: ~~1 ობოლი გვერდების გაუქმება~~ (GG-მა 09:32Z ბარათზე აირჩია „გაუქმება“: სამივე მისამართი redirect-ს აკეთებს, გვერდის ფაილები წაშლილია, `lib/routing/shellRedirects.test.ts`), 2 Deep Research-ის მიგრაცია, 3 Plugins-ის მიგრაცია, 4 Stripe-ის ცხრილები (Stripe Live-თან ერთად), 5 WhatsApp / push ცხრილები | drift doc, „Decisions for the owner“ |

Production, DB, env, ფასი არ შეცვლილა; Supabase-ზე მხოლოდ `select` გაეშვა. merge და deploy GG-ის სიტყვას ელის.
