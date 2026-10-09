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
- **ამ branch-ზე (Production-ში არა):** `/api/ai` აღარ იძახებს Anthropic-ს (`claude-sonnet-4-6`) — ახლა Gemini-ა, `76e8c525`.
- **მტკიცებულება:** სერტიფიკაცია §L; PR #44-ის აუდიტი (3.2).
- **DoD:** სტატიკური ტესტი, რომელიც ვარდება, თუ `app/`, `lib/`, `workers/`, `services/` რომელიმე აკრძალულ host-ს იძახებს; Production-დან ამოღებულია Replicate / Udio / Higgsfield / HeyGen გასაღებები; Google-ის ძრავის გარეშე დარჩენილი სერვისები კატალოგში „მალე“-ა.

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
- **DoD:** კოდის ყოველი `.from()` სახელი Production-ში არსებობს, ან ის გზა წაშლილია / გამორთულია; სტატიკური ტესტი Production-ის სქემის snapshot-ით ახალ drift-ს არ უშვებს.

### 4.12 Security
- **სტატუსი:** PARTIAL. დახურულია: STORAGE-1 (P0), ფუნქციების 17 warning, request-ით დასახელებული მედიის ხელმოწერა, share გვერდის `javascript:` ბმული, ElevenLabs voice id, avatars `owner_id` გაჟონვა, `jobs`-ის ორი გზა. ღიაა:
  - `renders` bucket public (494 ობიექტი) → `20261009b` მზადაა, **GG-ის „კი“ სჭირდება**;
  - leaked-password protection (4.2);
  - `vector` გაფართოება `public`-ში (დაბალი; გადატანას `match_memories`-ის `search_path`-ის შეცვლაც სჭირდება);
  - `avatars` bucket public (პროფილის და Live avatar-ის ფოტოები `getPublicUrl`-ით; დიზაინის გადაწყვეტილებაა, GG);
  - HawkScan DAST არ გაშვებულა (`HAWK_API_KEY` არ არის);
  - prompt injection-ის adversarial ტესტი და DB დონის RLS ტესტი CI-ში — MISSING.
  - ამ branch-ზე დახურულია, Production-ში ჯერ არა (`76e8c525`): ანონიმური realtime voice token, ცნობილი dev secret-ით ხელმოწერა, `mock-stt` ყალბი transcript, `/api/ai`-ის უფასო ფასიანი გამოძახება.
- **პასუხისმგებელი:** GG (`20261009b`-ის თანხმობა, Auth პარამეტრი, `HAWK_API_KEY`), Claude (ტესტები).
- **DoD:** Advisor 0 warning (ან თითოეული წერილობით მიღებული); `renders` private და ძველი signed ბმულები მუშაობს; DAST high finding-ების გარეშე; adversarial ტესტები CI-ში.

### 4.13 Library
- **სტატუსი:** BUILT_NOT_PROVEN; ცხრილების იზოლაცია PROVEN Production-ში (2026-10-08 22:20Z: anon და ორი მომხმარებელი, rollback-იანი ტრანზაქციებით). დუბლიკატის ამოცნობა MISSING (launch blocker არ არის).
- **პასუხისმგებელი:** Claude + GG (ცოცხალი ტესტისთვის შესული მომხმარებელი).
- **DoD:** შესული მომხმარებელი ქმნის, ინახავს, ხელახლა ხსნის და შლის ნამუშევარს; ფაილი storage-იდანაც იშლება; სხვა მომხმარებელი მას ვერ ხედავს.

### 4.14 Admin
- **სტატუსი:** Production-შია (PR #45). `run-migration` 404 PROVEN live; ერთიანი admin წესი BUILT_NOT_PROVEN live. „Pipeline“ ბარათი Production-ში ჯერ მცდარს ამბობს („Udio (primary)“, FLUX anchor, Kling); ამ branch-ზე გასწორებულია (`d387508e`). სხვაგან დარჩენილი ძველი ტექსტი: `app/api/health/providers/route.ts:69` („FLUX 1.1 Pro“ anchor), `lib/ai/lyriaMusic.ts`-ის შეცდომის ტექსტი (Udio / MusicGen fallback, რომელიც აღარ არსებობს).
- **პასუხისმგებელი:** Claude (ბარათის გასწორება), GG (admin-ით შესვლის ცოცხალი შემოწმება; „Confirm email“, 4.2).
- **DoD:** GG admin-ით შედის და პანელი იხსნება; არა-admin `/api/admin/*`-ზე 404-ს იღებს; Pipeline ბარათი კოდის რეალურ ძრავებს აჩვენებს (ტესტით).

### 4.15 KA / EN / RU
- **სტატუსი:** key parity PROVEN დღეს (`[i18n-parity] OK`; 2026-10-08-ზე 742 / 742 / 742). ეკრან-ეკრან აუდიტი არ გაკეთებულა.
- **პასუხისმგებელი:** Claude.
- **DoD:** ყველა გვერდი სამ ენაზე სქრინებით, უთარგმნელი სტრიქონების ავტომატური ძებნა (ლათინური ტექსტი ka/ru UI-ში) ნულზე.

### 4.16 Mobile
- **სტატუსი:** BUILT_NOT_PROVEN. ტელეფონის viewport-ის (375×812) E2E ლოკალურად გადის; რეალური მოწყობილობები — არა.
- **პასუხისმგებელი:** GG (iPhone + Android), Claude (ჩავარდნების გასწორება).
- **DoD:** iPhone და Android-ზე: სტუდიო, შესვლა, Live voice, checkout — ჩავარდნის გარეშე.

### 4.17 E2E
- **სტატუსი:** PARTIAL. CI-ში მხოლოდ `tests/preview-e2e.spec.ts` გადის (mock-ებით, „E2E - Preview Contract“, მწვანე `66d7163f`-ზე). სრული ლოკალური Playwright (27 spec, 251 ტესტი) ბოლოს 2026-10-08-ზე: 239 passed, 10 skipped, 2 ჩავარდა დატვირთვით და ცალკე გაშვებისას გადის. 2026-10-09-ის ლოკალური გაშვება მიმდინარეობს; შედეგი აქ ჩაიწერება. Preview-სა და Production-ზე ავტორიზებული E2E (შესული მომხმარებლით) არ არსებობს.
- **პასუხისმგებელი:** Claude; GG — Preview-სა და Production-ის Supabase-ის გაყოფა (owner action 11) და სატესტო ანგარიში.
- **DoD:** CI-ში E2E Preview-ზე, სატესტო ანგარიშით, ცალკე Supabase-ზე: შესვლა, ერთი უფასო მოქმედება, Library, გასვლა.

### 4.18 GCP Billing → Credits ფოტო
- **სტატუსი:** BLOCKED_OWNER (Part 0, პუნქტი 7).
- **პასუხისმგებელი:** GG, 2026-10-09 16:00Z-ის შემდეგ.
- **DoD:** Billing → Reports (project `gen-lang-client-0671348730`, SKU-ით) და Billing → Credits-ის ფოტო; მოსალოდნელია Subtotal ≈ $0 და კრედიტი ≈ $299.49 (სულ ≈ $0.51 დაიხარჯა, გამოთვლილი).

## 5. შეჯამება: DONE / PROVEN / NOT PROVEN / BLOCKED / NEXT ACTION

**DONE (კოდი Production-შია):** AUTH-1; ერთიანი admin წესი და `run-migration` 404; request-ით დასახელებული მედიის მფლობელის შემოწმება; share ბმულები მხოლოდ https; ჩუმი fallback-ების მოხსნა (image, text, music, voice); ServiceCatalog და `/hub` → სტუდიო; voice id-ის შემოწმება; avatars `user_id`-ზე; `jobs`-ის ორი გზა დახურული; uploads 50 MB / მხოლოდ მედია; STORAGE-1; ფუნქციების hardening.

**DONE branch-ზე, Production-ში არა (deploy GG-ის თანხმობას ელის):** PR #43-ის დარჩენილი Part 0 სამუშაო (`0d239f26`); `20261009b` (არ არის გაშვებული); PR #44-დან Redis fast-fail, `/api/ai` → Gemini, ხმის hardening (`76e8c525`); Admin Pipeline ბარათი (`d387508e`).

**PROVEN:** Production `66d7163`; CI მწვანე; 14 მიგრაცია; Advisor 0 error / 2 warning; 52 / 52 ცხრილი RLS-ით; anon storage-ში მხოლოდ `music`-ს ხედავს; deploy-ის შემდეგი public შემოწმებები; Vertex AUTH + INFERENCE Preview-ზე (Gemini, Veo); key parity; jest 696 / 696.

**NOT PROVEN:** Live voice ცოცხალ ზარზე; director run; Library ცოცხლად; admin წესი ცოცხლად; mobile მოწყობილობებზე; search / scrape ცოცხლად; analytics events; Production-ის Vertex.

**BLOCKED (GG):** Resend დომენი; leaked-password + „Confirm email“; BOG credentials; Stripe Live events; კანონიკური ფასები; action 9; Browser Control-ის ინფრასტრუქტურა; Production Vertex (IAM + env); `20261009b`-ის თანხმობა; Supabase-ის გაყოფა; რეალური მოწყობილობები; Billing ფოტო; `HAWK_API_KEY`.

## 6. გამოსწორების რიგი

ჯერ ის, რაც ყველაზე მეტს ხსნის და ყველაზე ნაკლები დრო სჭირდება.

| რიგი | ვინ | რა | რას ხსნის |
|---|---|---|---|
| 1 | GG | Resend-ში `myavatar.ge`-ის დადასტურება (DNS TXT / MX → Verify) | შესვლა, რეგისტრაცია, აღდგენა; ყველა ცოცხალი ტესტი, რომელსაც შესული მომხმარებელი სჭირდება |
| 2 | GG | Supabase Auth: leaked-password protection ჩართვა, „Confirm email“-ის დადასტურება | Advisor warning; admin წესის საფუძველი |
| 3 | GG → Claude | `20261009b`-ზე „კი“ → გაშვება და შემოწმება | `renders` public gap |
| 4 | GG → Claude | BOG live credentials (≈ 2026-10-10) → უფასო 10 ₾ შემოწმება → ერთი რეალური გადახდა | billing blocker |
| 5 | GG → Claude | კანონიკური ფასების ცხრილი → ერთი SSoT კოდში + ტესტი | pricing blocker |
| 6 | GG → Claude | action 9 (აკრძალული provider-ების მოხსნა) და image ძრავის გადაწყვეტილება (მხოლოდ Google, თუ reseller მომხმარებლის არჩევით) → PR #44-ის #1 და #3 + აკრძალული host-ების ტესტი | provider boundary blocker |
| 7 | GG + Claude | Production Vertex: `part0-wif.sh` production-ისთვის, env, deploy → probe + ერთი Veo smoke | Vertex migration; $300 კრედიტის გამოყენება |
| 8 | GG → Claude | Preview-ზე ერთი director run → ledger-ის შემოწმება → Production flag-ის გადაწყვეტა | V1–V6 blocker |
| 9 | GG | რეალური ტელეფონით Live voice ზარი | Live voice blocker, mobile |
| 10 | GG | Browser Control: ინფრასტრუქტურა თუ launch-იდან ამოღება | browser blocker |
| 11 | Claude | schema drift-ის ტრიაჟი → თითო ფუნქციაზე GG-ის გადაწყვეტილება | drift |
| 12 | Claude | ~~Admin Pipeline ბარათი~~ (`d387508e`); providers health-ის და Lyria-ს ძველი ტექსტი; ka/en/ru ეკრანების აუდიტი; აკრძალული host-ების და drift-ის სტატიკური ტესტები | admin, i18n, regression guard |
| 13 | GG → Claude | Supabase-ის გაყოფა (action 11) → ავტორიზებული E2E CI-ში | E2E |
| 14 | GG | Billing → Credits ფოტო 16:00Z-ის შემდეგ | Part 0 დახურვა |

Claude-ის დამოუკიდებელი შემდეგი სამუშაოები (Production / Billing / ბაზის ცვლილების გარეშე): 12-ე რიგი; PR #44-ის #3-ის photoshoot / interior ნაწილი; Vertex Production-ის ზუსტი ბრძანებების მომზადება GG-სთვის. PR #44-ის #2, #4, #5 უკვე ამ branch-ზეა.
