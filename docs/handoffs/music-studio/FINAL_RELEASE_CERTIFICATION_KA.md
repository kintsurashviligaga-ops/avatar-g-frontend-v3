# Music Studio v1.0 — საბოლოო სარელიზო სერტიფიკაცია (2026-10-14)

ავტორიზაცია: **GG-20261014-MUSIC-LYRIA-E2E-USD5** (მფლობელი, ლიმიტი $5). მოდელი: Claude Opus 5.5.

კატეგორიები: PROVEN_PRODUCTION · PROVEN_PREVIEW · PROVEN_ISOLATED · BUILT · PARTIAL · BLOCKED · NOT_TESTED.

## 1–2. ბრენჩი, commit, PR
- ბრენჩი `claude/music-studio-v1-20261014`; საბოლოო SHA და CI — §21 (ბოლო docs-commit შეიძლება მის შემდეგ იყოს, მხოლოდ დოკუმენტაცია).
- PR: https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/pull/65 — **Draft** რჩება.

## 3–4. Lyria მოდელი, რეგიონი, ტრანსპორტი
`lyria-3-clip-preview` · Vertex AI · `global` endpoint · `generateContent` · `responseModalities: ["AUDIO","TEXT"]` · ავთენტიფიკაცია:
Vercel OIDC → GCP STS → keyless SA (WIF პირობა მხოლოდ `environment:preview`). ამიტომ live ზარი შესაძლებელია მხოლოდ Preview build-დან —
`scripts/music-studio/preview-lyria-check.cjs` (request-ფაილით, ერთჯერადი, retry-ის გარეშე). **PROVEN_PREVIEW.**

## 5–8. შესაძლებლობები და აუდიო QC (FINAL_REAL_LYRIA_E2E.md)
| ტესტი | შედეგი | კატეგორია |
|---|---|---|
| A — ინსტრუმენტული | HTTP 200, MP3 30.77 წმ, 44.1 kHz სტერეო, 194 kb/s, decode შეცდომა 0, −12.07 LUFS, −0.20 dBTP, სტუდიის QC **PASS** | PROVEN_PREVIEW |
| B — ინგლისური ვოკალი | HTTP 200, იგივე ფორმატი, QC PASS; მოდელმა ტექსტები დროით დაალაგა (4 სტრიქონი, სიტყვა-სიტყვით). True peak +0.07 dBTP | PROVEN_PREVIEW (მოთხოვნა/აუდიო); **სიმღერა = საჭიროა მოსმენა** |
| C — ქართული ვოკალი (ექსპერიმენტული) | HTTP 200, QC PASS; ქართული სტრიქონები დროით დაბრუნდა. ქართული Google-ის ოფიციალურ ენების სიაში არ არის | PARTIAL / EXPERIMENTAL; **საჭიროა მოსმენა** |

ვოკალის არსებობა აკუსტიკურად დადასტურებული **არ არის**: აქ არ არის STT/სეპარატორი, ბიუჯეტი სხვა მოდელს არ ფარავს. mid/side ევრისტიკა
(B 13.4 dB, C 10.0 dB, A 5.3 dB) ცენტრალურ ხმას მიანიშნებს, მაგრამ მტკიცებულება არ არის. ფაილები: `evidence/lyria-live/`.
**ვოკალი გამორთული რჩება** (`MUSIC_LYRIA_VOCALS_VERIFIED` არ არის დაყენებული), ქართული სიმღერა საჯაროდ არ ირთვება.

## 9. Google-ის ხარჯი (FINAL_SPEND_REPORT.md)
3 ზარი (3×200, retry 0, გაურკვეველი 0). შეფასება ≈ **$0.12** ($0.04/კლიპი). **ფაქტობრივი billing აგენტისთვის მიუწვდომელია** — მფლობელმა
Cloud Billing-იდან უნდა ჩაწეროს. შემდეგი build-ები: `skipped: no request file`.

## 10–13. Pipeline, Library, კრედიტები, refund, კონკურენცია
| საკითხი | კატეგორია |
|---|---|
| ნამდვილი Lyria ბაიტები (replay, SHA-256 შემოწმებით) → quote → Create → ერთი ჩამოჭრა → QC → კერძო Storage → Library → player → download (digest უცვლელი) → reload | PROVEN_ISOLATED (`real-lyria-replay.spec.ts`, run 38569894358; ჩამოჭრა 40→35; signed TTL 3600 წმ) |
| სტუდიის worker-ის live Vertex ზარი რეალურ ანგარიშზე | **BLOCKED** — Vertex მხოლოდ Preview-ზე, Preview = Production Supabase |
| ერთი quote = ერთი job; ნაჩვენები = ჩამოჭრილი; 4 პარალელური confirm = 1 debit; double tap = 1 | PROVEN_ISOLATED |
| refund ზუსტად ერთხელ: provider/QC failure, cancel, crash, sweep ×2 | PROVEN_ISOLATED |
| quota 429, model 404, 503, safety block, timeout, network — 1 ზარი, retry არა; Storage write failure → refund 1× | BUILT (deterministic unit) |
| ხმოვანი ბრძანება თავად არ ხარჯავს | PROVEN_ISOLATED |

## 14. Desktop / Mobile
Chromium desktop + iPhone 13 viewport (Playwright) — PROVEN_ISOLATED. ფიზიკური მოწყობილობა — NOT_TESTED (viewport ≠ ფიზიკური ტელეფონი).

## 15–16. Voice
`music_studio` tool-dispatch (plan/status/edit/join/download/cancel, KA/RU) — PROVEN_ISOLATED, მიკროფონის გარეშე.
ნამდვილი მიკროფონი — **BLOCKED** (ადამიანი + იზოლირებული Preview).

## 17. უსაფრთხოება / RLS
ანონიმური, cross-user, Storage RLS, signed URL ვადა და scope, tampering, 402, SSRF — PROVEN_ISOLATED. stand-in provider fail-closed
(Vercel-ზე ან hosted Supabase-ით არასოდეს). ახალი build-step მხოლოდ request-ფაილით ხარჯავს.

## 18. Video / Image თავსებადობა
merge-tree: #65 × main / #60 / #64 / Astra — clean. 3-გზიანი ხე (#65 `1b13388f` + #60 `be9edee3` + #64 `bcb724a1`): tsc 0, ESLint 0,
Jest 914 suite pass / 5 fail (20 ტესტი) — იგივე 5 ffmpeg suite ვარდება სუფთა main-ზეც ამ Mac-ზე → რეგრესია არ არის. PROVEN_ISOLATED.

## 19. Shared-chat (data-authed → data-uid) ხარვეზი
**ღიაა.** პატჩი ცალკე ბრენჩზე `claude/shared-chat-uid-race-proposal-20261014` (`7fe06fb5`, main-იდან): `archiveWriteDeferred()` +
`myavatar:uid-ready`; unit 12/12, tsc 0 — BUILT. #65-ში არ არის, Astra-ს ფაილები შეხებული არ არის მის ბრენჩზე. გადაწყვეტილად არ ცხადდება,
სანამ რეალური E2E (phone reload spec `data-uid` ლოდინის გარეშე) არ დაამტკიცებს და chat-ის მფლობელი/Astra არ მიიღებს.

## 20. Preview
FINAL_PREVIEW_EVIDENCE.md: Preview = Production DB (ხელახლა შემოწმდა) → სტუდიის flag-ები Preview-ზე არ ჩართულა, mutating ტესტი არ ჩატარებულა.

## 21. CI
საბოლოო კოდის SHA **`134c4f33`** — ყველა workflow მწვანე:
- Music Studio E2E 38569894358 — **27 passed / 0 failed / 0 not run** (desktop + iPhone 13 + API, real-Lyria replay ორივეზე)
- CI 38569893967 ✓ · Video Core E2E 38569893885 ✓ · Preview Contract 38569893762 ✓ · Vercel Preview ✓
- https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38569894358
`134c4f33`-ის შემდეგ commit-ები მხოლოდ დოკუმენტაციაა; მათზე CI თავიდან გაეშვება — სტატუსი PR-ზე.

## 22. დარჩენილი ბლოკერები
1. სტუდიის live Lyria ზარი რეალურ ანგარიშზე — საჭიროა იზოლირებული Supabase Preview-სთვის (ახალი რესურსი → მფლობელის ნებართვა).
2. B/C ფაილების მოსმენა (სიმღერა? ტექსტი? ქართული გამოთქმა?).
3. ფაქტობრივი billing თანხა.
4. ნამდვილი მიკროფონი; ფიზიკური ტელეფონი.
5. Shared-chat uid პატჩის მიღება.

## 23. საჭირო ნებართვები
იზოლირებული Preview DB; ვოკალის გადაწყვეტილება მოსმენის შემდეგ; merge (მხოლოდ მფლობელი); provider-boundary და per-user rate-limit
ცვლილებების დამტკიცება (PHASE2_RELEASE_CHECKLIST.md).

## 24. Rollback
სწრაფი: `MUSIC_STUDIO_ENABLED=0` (deploy-ის გარეშე; sweep ვალებს იხდის). სრული: merge commit-ის revert (მიგრაცია არ არის).
build-step უსაფრთხოა: request-ფაილის გარეშე არაფერს აკეთებს; საჭიროების შემთხვევაში `vercel.json`-იდან ერთი ბრძანების წაშლა.

## 25. ვერდიქტი
**ინსტრუმენტული Music Studio — GO (Preview/Production-ზე ჩართვა მფლობელის გადაწყვეტილებით), პირობით:** ჯერ ერთი instrumental მფლობელის
ანგარიშზე Production-ში და `music_studio_unsettled` მონიტორინგი. Lyria ინსტრუმენტული live-ში დადასტურდა, მთელი ჯაჭვი ნამდვილი ბაიტებით
იზოლირებულად დადასტურდა, ბილინგი/refund/RLS მწვანეა.
**ვოკალი (ინგლისური და ქართული) — NO-GO** მოსმენამდე; ქართული ექსპერიმენტული რჩება ოფიციალური მხარდაჭერის გამოჩენამდეც.
**PR #65 Draft რჩება; merge/deploy — მხოლოდ მფლობელი.**
