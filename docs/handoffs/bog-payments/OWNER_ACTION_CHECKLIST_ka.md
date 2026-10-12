# BOG გადახდები — რა უნდა გააკეთო შენ (Owner Action Checklist)

2026-10-12 · PR #59 (draft) · დეტალები: [`2026-10-12-bog-payments-v1-ka.md`](2026-10-12-bog-payments-v1-ka.md)

**ახლანდელი მდგომარეობა (PROVEN):**
- Production უკვე აჩვენებს BOG-ით გადახდას ყველა შესულ მომხმარებელს: `myavatar.ge/api/checkout/capabilities` → `bog: true`.
- Vercel-ში რომელი წყვილი წერია, ჩვენ არ ვიცით.
- ოთხივე წინა მცდელობა ჩავარდა.
- Credits ფანჯარაში BOG-ის ჩავარდნისას მომხმარებელი ბარათით (Stripe) ვერ იხდის, მხოლოდ შეცდომას ხედავს.

**არასდროს:**
- Secret Key არ ჩასვა ჩატში, ფოტოში, GitHub-ში, ელფოსტაში და Vercel-ის Preview / Development scope-ში.
- ჩემთვის საკმარისია HTTP კოდი, შეცდომის ხაზი ან client id-ის ბოლო 4 სიმბოლო.

---

## 1. Business Manager (https://manager.bog.ge/login)

- [ ] შედი და იპოვე Online Payments / OPAY განყოფილება: **OPAY Client ID** და **OPAY Secret Key**. Merchant ID და Terminal ID არ გვჭირდება.
- [ ] ნახე (საიდუმლოს გარეშე, ფოტოც შეიძლება):
  - არის თუ არა ცალკე **Test / Sandbox** წყვილი;
  - არის თუ არა პარამეტრი „ბარათის დამახსოვრება / recurring / subscriptions";
  - რომელი გადახდის მეთოდებია ჩართული;
  - სად ჩანს ლიმიტები.
- [ ] თუ სადმე ითხოვს callback / notification URL-ს: `https://myavatar.ge/api/billing/bog/webhook`. Success / fail მისამართი არ სჭირდება, შეკვეთას თან ახლავს.
- [ ] ბანკს გაუგზავნე ღია კითხვები — ანგარიშის §10 (7 პუნქტი). მთავარი ოთხია:
  1. OPAY წყვილი Online Payments API-ისაა თუ არა;
  2. ლიმიტი მერჩანტზეა თუ ბარათზე;
  3. ავტომატური გადახდები ჩართულია თუ არა;
  4. ჩვენი 4 მცდელობის ლოგი.

## 2. წყვილის შემოწმება შენს Mac-ზე (ერთი OAuth მოთხოვნა, თანხა არ ჩამოიჭრება)

Terminal-ში ჩასვი ეს სამი ხაზი. Secret Key აკრეფისას ეკრანზე არ გამოჩნდება და shell history-ში არ ჩაიწერება:

```bash
read -r -p "OPAY Client ID: " BOG_ID; read -r -s -p "OPAY Secret Key: " BOG_SK; echo
curl -sS -u "$BOG_ID:$BOG_SK" -d grant_type=client_credentials -w '\nHTTP %{http_code}\n' https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token | sed -E 's/"access_token":"[^"]*"/"access_token":"[hidden]"/'
unset BOG_ID BOG_SK
```

(ან, თუ რეპო გაქვს ამ branch-ზე: `node scripts/bog-oauth-check.mjs` — იგივე, ქართული ახსნით.)

| შედეგი | რას ნიშნავს | შემდეგი ნაბიჯი |
|---|---|---|
| `HTTP 200` | BOG იღებს წყვილს | §3 |
| `HTTP 400` ან `401` | წყვილი არასწორია ან ეს Online Payments-ის წყვილი არ არის | ხელახლა დააკოპირე ორივე, ზედმეტი ჰარის გარეშე. თუ ისევ ასეა, ბანკს კითხვა №1 |
| `HTTP 403` | წყვილს იცნობს, მაგრამ API არ არის ჩართული | ბანკი |
| `HTTP 000` / შეცდომა | ქსელი | სცადე თავიდან |

მომწერე მხოლოდ HTTP კოდი. თუ შეცდომის ხაზს მომწერ, ჯერ შეამოწმე, რომ მასში Secret Key არ ერიოს.

## 3. Vercel → Environment Variables (მხოლოდ **Production** scope)

https://vercel.com/kintsurashviligaga-ops-projects/avatar-g-frontend-v3/settings/environment-variables

- [ ] `BOG_CLIENT_ID` = OPAY Client ID. თუ უკვე არსებობს: Edit → ჩაანაცვლე.
- [ ] `BOG_SECRET_KEY` = OPAY Secret Key, მონიშნე **Sensitive**.
- [ ] `BOG_ENV` — წაშალე, ან ჩაწერე `production`.
- [ ] წაშალე, თუ არსებობს: `BOG_CALLBACK_PUBLIC_KEY`, `BOG_API_BASE`, `BOG_OAUTH_URL`, `BOG_CALLBACK_IP_ALLOWLIST`.
- [ ] შეამოწმე: `NEXT_PUBLIC_SITE_URL` = `https://myavatar.ge`.
- [ ] შეამოწმე: `CRON_SECRET` არსებობს.
- [ ] `BOG_CLIENT_ID` / `BOG_SECRET_KEY` **არ** უნდა იყოს Preview-სა და Development-ში. Preview-ები Production-ის ბაზას იყენებს.
- [ ] (გზა B-სთვის, §4) `BOG_CHECKOUT_MODE` = `admin`.

სახელების შემოწმება მნიშვნელობების გარეშე (პროექტის ფოლდერში, Mac-ზე):

```bash
vercel env ls production | grep -E 'BOG_|NEXT_PUBLIC_SITE_URL|CRON_SECRET'
```

ამ ბრძანების გამოტანა შეგიძლია მომწერო: მასში მხოლოდ სახელები და scope-ებია.

⚠️ env-ის ცვლილება მოქმედებს **მხოლოდ ახალი deploy-ის შემდეგ**.

## 4. აირჩიე გზა (შენი გადაწყვეტილება; შენი სიტყვის გარეშე არაფერს ვაკეთებ)

**გზა B — რეკომენდებული (კონტროლირებადი):**
1. Vercel-ში ჩაწერე `BOG_CHECKOUT_MODE=admin`.
2. მომწერე „PR #59 merge + deploy".
3. მე PR-ს მზადყოფნაში მოვიყვან (CI მწვანე, draft-იდან გამოყვანა) და შენი სიტყვით შევაერთებ. main-ში შერწყმა = Production deploy.

შედეგი:
- BOG ღილაკს მხოლოდ შენ (ადმინი) დაინახავ.
- მომხმარებლები იმავდროულად ბარათით (Stripe) იყიდიან.
- ეს გამოასწორებს ამჟამინდელ მდგომარეობას, როცა Credits ფანჯარაში ყიდვა ყველასთვის ჩავარდება.

**გზა A — სწრაფი, კოდის გარეშე:**
1. Vercel → Deployments → ბოლო Production → **Redeploy**.
2. ახალი წყვილი მაშინვე ჩაირთვება **ყველასთვის**. ადმინის ცალკე ეტაპი არ არის.
3. თუ წყვილი არასწორია, მომხმარებლები ისევ შეცდომას ნახავენ.

## 5. ცოცხალი ტესტი (შენი ცალკე სიტყვით: „ცოცხალი ტესტი")

1. შედი https://myavatar.ge-ზე **kintsurashviligaga@gmail.com**-ით (ადმინი).
2. (გზა B) Admin → Billing → **„Bank of Georgia — readiness"**. შეამოწმე:
   - Credentials set; PRODUCTION;
   - `client …XXXX` = შენი OPAY Client ID-ის ბოლო 4 სიმბოლო;
   - Schema OK; CRON_SECRET;
   - „Checkout: admins only".
   
   შემდეგ დააჭირე **„Test credentials with BOG"** → უნდა იყოს `ok`.
3. Credits ფანჯარა → **10 ₾ პაკეტი** → BOG-ის გვერდი → გადაიხადე შენი ბარათით → დაბრუნდი საიტზე.
4. მოსალოდნელი შედეგი:
   - **+100 კრედიტი**;
   - ადმინ ბარათზე შეკვეთა `completed`;
   - ლიმიტის ხაზი: „24h 10/1000 ₾";
   - Business Manager-ში ჩანს 10 ₾-იანი ტრანზაქცია.
5. თუ შეცდომა მოხდა: ნუ გაიმეორებ რამდენჯერმე. ადმინ ბარათზე შეკვეთის ქვეშ მიზეზი ეწერება (BOG-ის პასუხი, საიდუმლოს გარეშე). გამომიგზავნე ამ ხაზის ფოტო.
6. ტესტის დროს Stripe-ის გვერდზე **ნუ** გადაიხდი. თუ BOG-ის ნაცვლად Stripe გაიხსნა, ეს ნიშნავს, რომ BOG ჩავარდა.
7. გეგმა (54 ₾ ავტომატური განახლებით) ჯერ **ნუ** შეამოწმებ, სანამ ბანკი ავტომატურ გადახდებს არ დაადასტურებს.
8. დაბრუნება (refund) Business Manager-იდან შესაძლებელია, მაგრამ კრედიტები ავტომატურად არ ჩამოიჭრება (ბლოკერი B4). მომწერე და ერთად გადავწყვეტთ.

## 6. ყველასთვის გახსნა (ტესტის შემდეგ, შენი სიტყვით)

- [ ] Vercel Production-ში წაშალე `BOG_CHECKOUT_MODE` → **Redeploy**.
- [ ] პირველ დღეებში ადმინ ბარათზე უყურე ლიმიტის ხაზს: 1 000 ₾ / 24სთ, 5 000 ₾ / 30 დღე. თუ ბანკი იტყვის, რომ ლიმიტი მერჩანტზეა, ლიმიტის გაზრდა საჯარო გაშვებამდე ითხოვე.
- [ ] საჭიროების შემთხვევაში BOG-ის გამორთვა: `BOG_CHECKOUT_MODE=off` → Redeploy. უკვე გადახდილი შეკვეთების ჩარიცხვა გაგრძელდება.
