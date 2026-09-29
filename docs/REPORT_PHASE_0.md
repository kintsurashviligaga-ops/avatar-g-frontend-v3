# ანგარიში · Phase 0 — Higgsfield-ის შეერთება · 2026-09-28

ბრენჩი `feat/studio-higgsfield` (main-ში არაფერი). აუდიტი: [`docs/AUDIT_2026-09.md`](AUDIT_2026-09.md).

## რა გაკეთდა

| # | სამუშაო | მდგომარეობა |
|---|---|---|
| §1 | აუდიტი: git, ბრენჩები, პროვაიდერების ინვენტარი (89 route × 16 პროვაიდერი), ტესტები, build, bundle-ის grep | ✅ `docs/AUDIT_2026-09.md` + `docs/audit/route-provider-map-2026-09.txt` |
| — | ბრიფი repo-ში | ✅ `docs/MYAVATAR_STUDIO_BRIEF.md` (სიტყვასიტყვით) |
| — | საცნობარო UI | ✅ `docs/reference/myavatar-studio.html` (მხოლოდ ეს ერთი მომეცა) |
| 3a | Higgsfield MCP | 🟡 დამატებულია **პროექტის** კონფიგში `.mcp.json` → `higgsfield: { type: http, url: https://mcp.higgsfield.ai/mcp }` (იგივე, რასაც `claude mcp add --scope project` აკეთებს; `claude` CLI ამ გარემოს PATH-ზე არ არის). **ავტორიზაცია ინტერაქტიულია** — შენ უნდა გააკეთო: ახალ სესიაში `/mcp → higgsfield → Authenticate`. მანამდე MCP-ით სურათი/ვიდეო ვერ დავაგენერირე. |
| 3b | API key | 🟡 მივიღე **key ID** → `.env.local` (`HF_API_KEY_ID`; gitignored, კოდში/ლოგში/კომიტში არ არის). **`HF_API_KEY_SECRET` ჯერ არ მაქვს.** `.env.example` განახლდა მნიშვნელობების გარეშე (`HF_API_KEY_ID`, `HF_API_KEY_SECRET`, `HF_CREDENTIALS`, `HF_WEBHOOK_SECRET`, `HF_USD_GEL_RATE`, `HF_GEL_MARGIN`). Vercel Preview/Production env-ში ჯერ არაფერი დამიმატებია — secret-ის გარეშე აზრი არ აქვს. |
| 3c | `scripts/hf-smoke.ts` | ✅ დაწერილია, `npm run hf:smoke`. default = **მხოლოდ estimate** (კრედიტი არ იხარჯება); `--submit` = იაფი პარამეტრებით რეალური გენერაცია + polling; `--only=`, `--image-url=`, `--video-url=`, `--json=`. ცხრილი `model \| estimate \| status \| latency \| output-url`, GEL = usd × 2.7 × 1.35 (env-ით იცვლება), `X-Correlation-ID` ინახება, POST **არასდროს** retry. **გაშვება დღეს:** სწორად უარს ამბობს — `HF_API_KEY_SECRET is empty`, exit 2, არცერთი მოთხოვნა არ გასულა. |
| DoD | secret bundle-ში | ✅ `.next/static`-ში `HF_API_KEY_SECRET`/key-ID **არ არის** |
| DoD | ტესტები | ✅ typecheck 0 შეცდომა · jest **2529/2529** · build OK |

## Phase 0 „დასრულებულია, როცა…" (brief §3)

| პირობა | | ვისზეა |
|---|---|---|
| MCP მუშაობს Claude Code-ში | ⏳ კონფიგი დევს, OAuth შენია | GG |
| API key მუშაობს Preview-ზე | ⏳ secret + Vercel env (Preview ← dev) | GG → მე ვამატებ env-ს, თუ Vercel-ზე მაძლევ; სხვაგვარად Settings → Environment Variables |
| smoke მწვანეა ყველა ჩართულ მოდელზე | ⏳ secret-ის შემდეგ: ჯერ `npm run hf:smoke` (0 ₾), მერე `-- --submit` (~7 იაფი გენერაცია, სავარაუდოდ < $1) | მე |
| secret bundle-ში არ ჩანს | ✅ | — |

## Higgsfield-ის ხარჯი ამ ფაზაში

**0.000 კრედიტი / $0.00** — არცერთი მოთხოვნა არ გასულა (secret არ არის).

## ღია საკითხები / რისკები

1. ✅ **prod-ის Supabase აღდგენილია** (დავალიანება დაფარე → `restore_project` → ACTIVE_HEALTHY 2026-09-28 22:20 UTC). ცოცხლად გადამოწმდა: profiles/credit_ledger/generation_jobs/agent_evolution_traces არსებობს, `deduct_credits`/`refund_credits` მუშაობს, GoTrue პასუხობს. ⚠️ free tier → 7 დღე უმოქმედობისას ისევ პაუზა. ⚠️ `refund_film_clip` RPC არ არსებობს (ცალკე საკითხი).
2. ბრიფის სიაში **Nano Banana, Seedream, GPT Image** Higgsfield-ის კატალოგში არ არის → Nano Banana რჩება არსებულ პროვაიდერზე; registry-ში ისინი `provider: 'nanobanana'`-ით შევა, არა `higgsfield`.
3. **Soul ID**-ის ენდპოინტი ვერ დავადასტურე — Console-ში ნახე „Soul ID" და გამომიგზავნე endpoint id, ან Phase 1-ში MCP-ით გავარკვევ.
4. `origin/feat/omni-studio-production-workspace` — შეურწყმელი Studio-UI ბრენჩი main-ზე ახალი; Phase 3-მდე უნდა გადაწყდეს.
5. ბრიფის `myavatar-v39.html` / `myavatar-v32-copilot.html` არ მაქვს.

## რა მჭირდება შენგან (brief §11)

1. **Higgsfield secret** (dev წყვილი ახლა; prod წყვილი Phase 2-ის ბოლოს). ჩატში ჩააგდე — მე მხოლოდ `.env.local`-ში ჩავწერ.
2. **MCP OAuth** — `/mcp → higgsfield → Authenticate` (Claude Code-ის სესიაში).
3. ~~Supabase~~ — მოგვარდა.
4. GEL მარჟა/კურსი — default `usd × NBG × 1.35`; დღეს `lib/billing/fx.ts`-ის 2.7 ვიყენე. თუ სხვა გინდა, თქვი.
5. ლოგოს მასტერ-ფაილი (SVG/AI) — Phase 3-ისთვის.

## შემდეგი ნაბიჯი (შენი „კი"-ს შემდეგ)

secret მოსვლისთანავე: `npm run hf:smoke` → `--submit` → ცხრილი ამ ფაილში → Phase 1 (`lib/providers/*`, `/api/generate`, `/api/estimate`, webhook, `generation_jobs` + RLS, ტესტები).

---

## განახლება · 2026-09-29 — Phase 0 დახურულია (MCP-ის გარდა)

| პირობა (brief §3) | შედეგი |
|---|---|
| API key მუშაობს | ✅ ახალი key შეიქმნა console-ში, ადგილობრივად შემოწმდა (`npm run hf:credentials -- --from-clipboard`: Higgsfield-მა მიიღო) → `.env.local` (600) + Vercel Production/Preview (`HF_CREDENTIALS`, encrypted). secret არც ჩატში, არც ლოგში, არც git-ში |
| smoke test | ✅ estimate (უფასო): Soul 2 $0.004 · Kling 3 std t2v/i2v $0.139 · Kling 3 pro $0.185 · Seedance 2.5 — token-priced (იხ. ქვემოთ). Motion Control / Genjutsu / Soul ID — გამოტოვებული (საჭიროა წყარო-ვიდეო / endpoint-ის დადასტურება) |
| რეალური გენერაცია | ✅ ოფიციალური SDK-ით (`npm run hf:example`): Seedance 2.5, „A cinematic scene at sunset“, 5 s / 720p / 16:9 → **completed 430.7 s-ში**; ფაილი შემოწმდა ffmpeg-ით: 5.04 s, 1280×720, h264 24 fps, AAC stereo, 4.9 MB |
| secret bundle-ში | ✅ არ არის |
| MCP Claude Code-ში | ⏳ OAuth ინტერაქტიულია (`/mcp → higgsfield → Authenticate`) — მხოლოდ დეველოპმენტისთვის, საიტი არ იყენებს |

**ხარჯი (Higgsfield Analytics):** $1.62 ჩამოიჭრა (სიის ფასი **$2.31**, −30% ფასდაკლება); ამავე დღეს promo-მ +$1.618 cashback დააბრუნა → ბალანსი $23.38.

**ნაპოვნი და გასწორებული:** `/estimate` ორ სხვადასხვა ფორმას აბრუნებს — Kling/Soul: რიცხვი (`usd` = რაც ჩამოიჭრება, `discount.usd` = ფასდაკლება); **Seedance 2.5: მხოლოდ ტექსტი** („~$0.4622 წამში 720p-ზე…“). ჩვენი კლიენტი ამ მეორე ფორმაზე ვარდებოდა → Seedance-ის ფასი ვერ დადგინდებოდა. ახლა ფასი ითვლება provider-ის საკუთარი ფორმულით (`lib/providers/higgsfield/tokenPricing.ts`): ჩვენი გამოთვლა **$2.3112** — Higgsfield-ის „usage before discounts“ **$2.31** ✓.
