# BOG Payments — რა უნდა გააკეთოს Owner-მა (v1.3)

2026-10-12 · PR #59 · ეს ფაილი ცვლის [`OWNER_ACTION_CHECKLIST_ka.md`](OWNER_ACTION_CHECKLIST_ka.md)-ს (v1.2). OAuth-ის შემოწმების ნაბიჯი იგივე დარჩა.

**არასდროს:** Secret Key არ ჩასვა ჩატში, ფოტოში, GitHub-ში, ელფოსტაში, ბრძანების ხაზში ან Vercel-ის Preview / Development scope-ში. Sandbox წყვილი Vercel-ში არცერთ scope-ში არ ჩაწერო. ჩემთვის საკმარისია შედეგის ერთი ხაზი (`✓ ok · HTTP 200 · …`).

## ნაბიჯი 1 — Vercel კონექტორი ✓ (2026-10-13 03:16Z)

Owner-მა კონექტორი ხელახლა დააკავშირა. 03:20Z-ზე ჩავწერე `BOG_CHECKOUT_MODE=admin` და `BOG_ENV=production` (Production); override-ები არ არსებობდა; `CRON_SECRET` არის; Preview / Development-ში BOG ცვლადი არ არის.

<details><summary>ძველი ინსტრუქცია</summary>


1. https://claude.ai/customize/connectors → **Vercel** → გათიშე და თავიდან დააკავშირე. Vercel-ის ფანჯარაში აირჩიე გუნდი **kintsurashviligaga-ops-projects**.
2. პროექტის Project settings → Connectors: Vercel ჩართულია.
3. თრედში მომწერე „მზადაა".

ამის შემდეგ მე: წავშლი override-ებს (`BOG_CALLBACK_PUBLIC_KEY`, `BOG_API_BASE`, `BOG_OAUTH_URL`, `BOG_CALLBACK_IP_ALLOWLIST`, თუ არსებობს), ჩავწერ `BOG_CHECKOUT_MODE=admin`-ს და `BOG_ENV=production`-ს, შევამოწმებ `CRON_SECRET`-ს, `NEXT_PUBLIC_SITE_URL`-ს და scope-ებს. საიდუმლოს მნიშვნელობას არ წავიკითხავ.

თუ კონექტორს ვერ დააკავშირებ: ეს ყველაფერი ხელით გააკეთე Vercel-ში და გამომიგზავნე env გვერდის ფოტო, ძებნაში „BOG" ჩაწერილი (მნიშვნელობები დამალულია).

</details>

## ახლა: ნაბიჯი 2 — OPAY წყვილი (მხოლოდ შენ)

### 2-ა. წყვილის შემოწმება Mac-ზე (ერთი OAuth მოთხოვნა, თანხა არ ჩამოიჭრება)

```zsh
node -v
cd ~/Downloads
curl -fsSLo bog-oauth-check.mjs https://raw.githubusercontent.com/kintsurashviligaga-ops/avatar-g-frontend-v3/18b2a157da7fc4ca79c52d90a2cc824e64b03c82/scripts/bog-oauth-check.mjs
shasum -a 256 bog-oauth-check.mjs
node bog-oauth-check.mjs
```

- `shasum` ზუსტად `3be96bb82ab038fbdf3751db5b2d374e7e23061b7da7f450757fabe8a55c93be` უნდა იყოს, თორემ **ნუ** გაუშვებ.
- სკრიპტი ჯერ Client ID-ს გკითხავს, მერე Secret Key-ს. Secret Key-ის ჩასმისას ეკრანზე არაფერი ჩანს, ეს ნორმალურია; დააჭირე Enter. Ctrl+C წყვეტს, მოთხოვნა არ იგზავნება.
- მომწერე **მხოლოდ** პასუხის პირველი ხაზი.
- Node-ის გარეშე: zsh-ის ვარიანტი ძველ checklist-შია (§2-ბ).

| შედეგი | მნიშვნელობა |
|---|---|
| `✓ ok · HTTP 200` | BOG იღებს წყვილს, merge-ის პირობა №3 შესრულდა |
| `credentials_refused · HTTP 400/401` | წყვილი არასწორად დაკოპირდა, ან ეს Online Payments-ის წყვილი არ არის. ხელახლა დააკოპირე; თუ ისევ ასეა, ბანკს კითხვა №1 |
| `forbidden · HTTP 403` | API არ არის ჩართული, ბანკს მიმართე |
| `no_answer` | ქსელი, სცადე თავიდან |

### 2-ბ. Vercel → Production scope (OAuth 200-ის შემდეგ)

https://vercel.com/kintsurashviligaga-ops-projects/avatar-g-frontend-v3/settings/environment-variables

- `BOG_CLIENT_ID` → ⋯ → Edit → OPAY Client ID → Save (ცვლადი უკვე არსებობს, 2026-10-02-დან).
- `BOG_SECRET_KEY` = OPAY Secret Key, მონიშნე **Sensitive**.
- Environment: **მხოლოდ Production**.

⚠️ env მხოლოდ შემდეგ deploy-ზე მოქმედებს. თუ წყვილის ჩაწერის შემდეგ PR #59-მდე სხვა რამე (მაგ. PR #58) გავა Production-ში, იმ კოდს `BOG_CHECKOUT_MODE` არ ესმის და მუშა BOG ყველასთვის გამოჩნდება. ამიტომ წყვილს ვწერთ merge-ის წინ და PR #59 პირველი შედის.

როცა ორივე მზადაა (ფოტო / „მზადაა" + `✓ ok · HTTP 200`), merge-ის 10 პირობას გადავამოწმებ და PR #59-ს შენი 19:39Z-ის უფლებით შევაერთებ.

## ნაბიჯი 3 — deploy-ის შემდეგ, ცოცხალი 10 ₾ (შენი ცალკე სიტყვით)

1. https://myavatar.ge → შედი **kintsurashviligaga@gmail.com**-ით.
2. Admin → Billing → „Bank of Georgia — readiness": Credentials set · PRODUCTION · `client …XXXX` (შენი Client ID-ის ბოლო 4) · Schema OK · CRON_SECRET · „Checkout: admins only". დააჭირე „Test credentials with BOG" → `ok`.
3. Credits → **10 ₾** → BOG-ის გვერდი → გადაიხადე შენი ბარათით (3-D Secure შენ ადასტურებ) → დაბრუნდი საიტზე.
4. მოსალოდნელი: **+100 კრედიტი** ერთხელ; ადმინ ბარათზე შეკვეთა `completed`; „24h 10/1000 ₾ · 30d 10/5000 ₾"; Business Manager-ში 10 ₾-იანი ტრანზაქცია.
5. თუ რამე ჩავარდა ან გაურკვეველია: **ნუ** გაიმეორებ. გამომიგზავნე ადმინ ბარათის შეკვეთის ხაზის ფოტო. მეორე ფასიან ცდას მხოლოდ შენი სიტყვით ვაკეთებთ.
6. Stripe-ის გვერდზე ნუ გადაიხდი; გეგმას (54 ₾, ავტო-განახლება) ნუ შეამოწმებ, სანამ ბანკი ავტომატურ გადახდებს არ დაადასტურებს.

## ბანკისთვის ღია კითხვები

1. OPAY Client ID / Secret Online Payments API-ისაა (`oauth2.bog.ge`, `api.bog.ge/payments/v1`)?
2. 1 000 ₾ / 24სთ და 5 000 ₾ / 30 დღე მერჩანტზეა თუ ბარათზე? მოძრავია თუ კალენდარული? როგორ გავზარდოთ?
3. ჩართულია თუ არა ბარათის შენახვა ავტომატური გადახდებისთვის?
4. Sandbox წყვილი იმავე API-სთვის.
5. ჩვენი 4 წარუმატებელი მცდელობის (2026-10-03, 10-06) ლოგი.
