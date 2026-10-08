# GCP Part 0 — პირველი ფასიანი Vertex ტესტი: გეგმა (2026-10-08)

სტატუსი: **გეგმა. არაფერი ფასიანი არ გაშვებულა.** ტესტი ეშვება მხოლოდ owner-ის თანხმობით (decision card).
ბიუჯეტი: owner-ის ლიმიტი $5–10; მოსალოდნელი ხარჯი **≈ $0.52**, ზედა ზღვარი **$2**.

## 1. რას ამტკიცებს
| ტესტი | რა მტკიცდება | სტატუსი, რომელსაც აძლევს |
|---|---|---|
| T1 — Veo აპლიკაციიდან (Preview, WIF) | Vercel OIDC → STS → SA impersonation → Veo 3.1 → GCS bucket → signed URL; ხარჯი $300 credit-იდან | **INFERENCE VERIFIED** (Veo) |
| T2 — Gemini text, Gemini image, Lyria Vertex-ზე (owner-ის ანგარიშით, Mac-იდან) | მოდელები ამ პროექტზე Vertex-ით პასუხობენ და credit-ზე იწერება — Part 1-ის (text/image/music → Vertex) წინაპირობა | Vertex-ზე ხელმისაწვდომობა: PROVEN; აპლიკაციის გზა ამ მოდალობებისთვის ჯერ არ არსებობს (§5) |

## 2. როდის არის უსაფრთხო
| პირობა | მდგომარეობა |
|---|---|
| billing ანგარიში ერთადერთია და მხოლოდ ამ პროექტზეა მიბმული | ✓ PROVEN (report §10.1) |
| Billing Alerts (3 budget) | ✓ PROVEN, read-back (report §10.2) |
| owner-ის თანხმობა decision card-ზე | ○ ელოდება |
| **T1-ისთვის დამატებით:** AUTH VERIFIED (`/api/admin/provider-probe` → `auth:mode:wif token:ok bucket:ok sign:ok`) | ○ ელოდება owner-ის ფოტოს |
| **T1-ისთვის დამატებით:** Preview deployment, რომელშიც `/ka/admin/veo-smoke` გვერდია (PR #43) | ○ build push-ის შემდეგ |

T2 WIF-ზე არ არის დამოკიდებული: ის owner-ის Google ანგარიშით ეშვება, ამიტომ თანხმობისთანავე შეიძლება.

## 3. T1 — ერთი Veo კლიპი აპლიკაციის გზით
**ვინ:** owner (admin-ის შესვლა Preview-ზე სჭირდება). **სად:** `<preview>/ka/admin/veo-smoke`.
1. გვერდი აჩვენებს: `veo-3.1-fast-generate-001`, 4 წმ, 720p, ხმით, **≈ $0.40**, `Transport: vertex (pinned)`.
2. „ტესტის გაშვება" → ბრაუზერის დადასტურება → `POST /api/admin/veo-smoke {confirm:"paid-test"}` — **ერთი** submit.
3. გვერდი ყოველ 10 წმ-ში ამოწმებს; მზა კლიპი იქვე ითამაშებს (15-წუთიანი signed URL).
4. Claude ამოწმებს: Vercel runtime log-ში `[veo] submit transport=vertex model=veo-3.1-fast-generate-001 … → ok`
   და bucket-ში `veo/admin-veo-smoke-…/sample_0.mp4`.

რატომ არა სტუდიის Video პანელი: ის storyboard-ს, lipsync-ს და Supabase-ის credit ledger-ს ეხება. Preview და Production
**ერთსა და იმავე Supabase-ს** იყენებენ (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — ერთი ჩანაწერი
development+preview+production-ზე, PROVEN), ხოლო Preview-ში `REPLICATE_API_TOKEN`, `OPENAI_API_KEY`, `RUNWAY_API_KEY`
არის. ტესტის გვერდი არც DB-ს წერს, არც სხვა provider-ს იძახებს და `VEO_TRANSPORT=vertex`-ის გარეშე უარს ამბობს.

## 4. T2 — Vertex-ის სხვა მოდელები (Claude, owner-ის Mac-იდან, `myavatar.ge@gmail.com`)
| # | მოდელი | endpoint | მოთხოვნა | შეფასება |
|---|---|---|---|---|
| T2.1 | `gemini-3.8-flash` (GA) | `global`, `:generateContent` | 1 მოკლე ქართული პასუხი, `maxOutputTokens` 64 | < $0.01 |
| T2.2 | `gemini-3.1-flash-image` (GA) | `global`, `:generateContent`, `responseModalities: [IMAGE]`, 1K | 1 სურათი | ≈ $0.07 |
| T2.3 | `lyria-3-clip-preview` (Preview) | `global`, `:generateContent` | 1 კლიპი | ≈ $0.04 |
შედეგები (სურათი, აუდიო, პასუხი) ინახება Mac-ზე `~/.myavatar-gcloud/test-out/`-ში; token არსად იბეჭდება.

## 5. ხარჯი და გაჩერების წესები
- ჯამი ≈ $0.40 + $0.12 = **$0.52**. ზედა ზღვარი $2 — ამაზე მეტი არცერთი ნაბიჯით არ შეიძლება.
- თითო ტესტი **ერთხელ**. ხელახლა მხოლოდ მაშინ, როცა Google-მა job **არ** შექმნა (HTTP 429/503 submit-ზე) და მაქსიმუმ ერთხელ;
  timeout ან 5xx შეიძლება უკვე დარიცხული job იყოს, ამიტომ არ მეორდება.
- safety refusal (`filtered`) ან 4xx — ტესტი ჩერდება, მიზეზი ანგარიშში იწერება.
- Budget alert ხარჯს **არ აჩერებს** (report §10.2) — ლიმიტს ეს წესები და ტესტების რაოდენობა იცავს.

## 6. ტესტის შემდეგ: credit-მა დაფარა? (owner-ის პუნქტი 7)
Billing-ის მონაცემები რამდენიმე საათით, ზოგჯერ 24 საათზე მეტით, აგვიანებს. ~24 სთ-ის შემდეგ owner Console-ში
(`myavatar.ge@gmail.com`) ამოწმებს და ფოტოს უგზავნის Claude-ს:
1. **Billing → Reports**, project `gen-lang-client-0671348730`, Group by SKU: Veo / Gemini / Lyria-ს ხაზები ≈ $0.52 და
   ამავე ოდენობის უარყოფითი ხაზი Credits/Promotions-ში; **Subtotal ≈ $0.00**.
2. **Billing → Credits:** ნაშთი ≈ $299.48.
3. **AI Studio → Billing:** $13.21-ის ბალანსი ამ ტესტებმა არ უნდა შეცვალოს. შენიშვნა: Production ახლა Gemini Developer API-ზეა
   (report §10.4), ამიტომ ეს ბალანსი შეიძლება მომხმარებლების ტრაფიკმა შეამციროს — ეს ტესტს არ ეხება.
4. budget **„MyAvatar out-of-pocket cost - after credits" ($1)** არ უნდა აფრთხილებდეს. თუ გააფრთხილა, credit ხარჯს არ ფარავს —
   შემდეგი ფასიანი ნაბიჯი ჩერდება, სანამ owner-თან ერთად არ გაირკვევა.

## 7. რას არ ამოწმებს
- Production: მისი env არ იცვლება; Vertex იქ არ არის კონფიგურირებული (report §10.4).
- სტუდიის სრული ნაკადი (storyboard, lipsync, credit ledger) — Part 1-ის შემდეგ.
- Imagen 4: ამ პროექტზე Vertex-ში არ არის (404), ამიტომ არ ტესტდება (report §10.3).

## 8. შედეგები
owner-ის თანხმობა: decision card, „ორივე ტესტი", 2026-10-08 11:47 UTC.

### T2 — 11:49–11:52 UTC, owner-ის Mac, `myavatar.ge@gmail.com`, `locations/global`
| # | მოდელი | HTTP | შედეგი | usage | შეფასებული ხარჯი |
|---|---|---|---|---|---|
| T2.1 | `gemini-3.8-flash` | 200 | ქართული ტექსტი; `finishReason: MAX_TOKENS` | 12 in, 20 out + **488 thinking** | ≈ $0.002 |
| T2.2 | `gemini-3.1-flash-image` | 200 | PNG 1024×1024 | 18 in, 1120 image | ≈ $0.067 |
| T2.3 | `lyria-3-clip-preview` | 400 → 200 | MP3 30.8 წმ, stereo 44.1 kHz, 192 kbps, `<instrumental>` + caption | 533 audio | $0.04 |
ჯამი ≈ **$0.11**. T2.3-ის პირველი მოთხოვნა (`responseModalities: ["AUDIO"]`) 400 `INVALID_ARGUMENT` იყო — Google ასეთ
მოთხოვნას არ არიცხავს; მეორე (`["AUDIO","TEXT"]`) წარმატებით დასრულდა. სხვა განმეორება არ ყოფილა.
სტატუსი: Vertex-ზე ამ სამი მოდელის inference — **PROVEN** owner-ის ანგარიშით. credit-ით დაფარვა — ~24 სთ-ში (§6).
შედეგების ფაილები: Mac `~/.myavatar-gcloud/test-out/` (`image-0-0.png`, `music-a.mp3`, პასუხების JSON-ები).

Part 1-ისთვის: (1) Gemini 3.8 Flash ნაგულისხმევად „ფიქრობს" (488 token 512-იანი ლიმიტიდან) — აპლიკაციამ thinking-ის
დონე ან output-ის ლიმიტი მკაფიოდ უნდა დააყენოს, თორემ პასუხი წყდება და ხარჯი იზრდება. (2) Lyria 3 Vertex-ზე
`:generateContent`-ით მუშაობს მხოლოდ `responseModalities: ["AUDIO","TEXT"]`-ით.

### T1 — Veo
ელოდება: owner-ის შესვლა Preview-ზე (email + პაროლი), AUTH VERIFIED, შემდეგ ღილაკი `/ka/admin/veo-smoke`-ზე.
