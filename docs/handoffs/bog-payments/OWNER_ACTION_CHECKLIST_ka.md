# BOG გადახდები — რა უნდა გააკეთო შენ (Owner Action Checklist)

2026-10-12 · v1.2 · PR #59 (**draft**, merge მხოლოდ შენი ცალკე სიტყვით) · დეტალები: [`2026-10-12-bog-payments-v1-ka.md`](2026-10-12-bog-payments-v1-ka.md)

**ახლანდელი მდგომარეობა:**
- PROVEN (2026-10-12 18:54Z): Production ყველას აჩვენებს BOG-ით გადახდას: `myavatar.ge/api/checkout/capabilities` → `{"stripe":true,"bog":true}`.
- Vercel-ში რომელი წყვილი წერია, ჩვენ არ ვიცით. ოთხივე წინა მცდელობა ჩავარდა.
- PROVEN (კოდი): BOG-ის უარის შემდეგ Credits ფანჯარა Stripe-ზე არ გადადის, მომხმარებელი მხოლოდ შეცდომას ხედავს.
- BUILT_NOT_PROVEN: Stripe Production-ში კონფიგურირებულია (`stripe:true`), მაგრამ მისით ერთი გადახდაც არ დასრულებულა.

**არასდროს:**
- Secret Key არ ჩასვა ჩატში, ფოტოში, GitHub-ში, ელფოსტაში, ბრძანების ხაზში და Vercel-ის Preview / Development scope-ში.
- Sandbox (სატესტო) წყვილი არ ჩაწერო Vercel-ში არცერთ scope-ში. ყველა Vercel deployment Production-ის ბაზას იყენებს. ახალი კოდი ასეთ შემთხვევაში BOG-ს მთლიანად ბლოკავს (`BOG_SANDBOX_BLOCKED`, ადმინ ბარათზე წითელი ხაზი).
- ჩემთვის საკმარისია შემოწმების ერთი ხაზი (`✓ ok · HTTP 200 · …`) ან client id-ის ბოლო 4 სიმბოლო.

---

## 1. Business Manager (https://manager.bog.ge/login)

- [ ] შედი და იპოვე Online Payments / OPAY განყოფილება: **OPAY Client ID** და **OPAY Secret Key**. Merchant ID და Terminal ID არ გვჭირდება.
- [ ] ნახე (საიდუმლოს გარეშე, ფოტოც შეიძლება):
  - არის თუ არა ცალკე **Test / Sandbox** წყვილი;
  - არის თუ არა პარამეტრი „ბარათის დამახსოვრება / recurring / subscriptions";
  - რომელი გადახდის მეთოდებია ჩართული;
  - სად ჩანს ლიმიტები.
- [ ] თუ სადმე ითხოვს callback / notification URL-ს: `https://myavatar.ge/api/billing/bog/webhook`. Success / fail მისამართი არ სჭირდება, შეკვეთას თან ახლავს.
- [ ] ბანკს გაუგზავნე ღია კითხვები (ანგარიშის §10). მთავარი ოთხია:
  1. OPAY წყვილი Online Payments API-ისაა თუ არა;
  2. ლიმიტი მერჩანტზეა თუ ბარათზე;
  3. ავტომატური გადახდები ჩართულია თუ არა;
  4. ჩვენი 4 მცდელობის ლოგი.

## 2. წყვილის შემოწმება შენს Mac-ზე (ერთი OAuth მოთხოვნა, თანხა არ ჩამოიჭრება)

### 2-ა. სკრიპტით (რეკომენდებული)

Terminal-ში, თითო ხაზი:

```zsh
node -v
cd ~/Downloads
curl -fsSLo bog-oauth-check.mjs https://raw.githubusercontent.com/kintsurashviligaga-ops/avatar-g-frontend-v3/18b2a157da7fc4ca79c52d90a2cc824e64b03c82/scripts/bog-oauth-check.mjs
shasum -a 256 bog-oauth-check.mjs
node bog-oauth-check.mjs
```

- `node -v` უნდა აჩვენოს `v18` ან მეტი. თუ წერს `command not found`, გამოიყენე §2-ბ.
- `shasum`-ის პასუხი ზუსტად ეს უნდა იყოს: `3be96bb82ab038fbdf3751db5b2d374e7e23061b7da7f450757fabe8a55c93be`. თუ განსხვავდება, **ნუ** გაუშვებ და მომწერე.
- ფაილი იგივეა, რაც თრედში მიმაგრებული `bog-oauth-check.mjs`; ჩამოტვირთვის მაგივრად ისიც შეგიძლია გამოიყენო (იგივე `shasum` შემოწმებით).
- სკრიპტი ჯერ Client ID-ს გკითხავს (ჩანს ეკრანზე), მერე Secret Key-ს. Secret Key-ის ჩასმისას (Cmd+V) ეკრანზე **არაფერი გამოჩნდება**, ეს ნორმალურია; დააჭირე Enter.
- Secret Key არ ჩაიწერება shell history-ში და არ გამოჩნდება პასუხში არცერთი ფორმით, არც token. Ctrl+C ნებისმიერ დროს წყვეტს, მოთხოვნა არ იგზავნება.
- პასუხი ერთი ხაზია, მაგალითად `✓ ok · HTTP 200 · production · client …1234 · 180 ms`, ქვემოთ ქართული ახსნით. **მომწერე მხოლოდ ეს ხაზი.**
- **ნუ** გაუშვებ `BOG_SECRET_KEY=… node …` ფორმით: ასე საიდუმლო shell history-ში ჩაიწერება.

### 2-ბ. Node-ის გარეშე (მხოლოდ თუ `node -v` არ მუშაობს)

Mac-ის Terminal-ში (zsh). თუ ფანჯრის სათაურში `bash` წერია, ჯერ აკრიფე `zsh`.

```zsh
read -r "BOG_ID?OPAY Client ID: "; read -rs "BOG_SK?OPAY Secret Key: "; echo
printf 'header = "Authorization: Basic %s"\n' "$(printf '%s:%s' "$BOG_ID" "$BOG_SK" | base64 | tr -d '\n')" | curl -sS -K - -o /dev/null -w 'HTTP %{http_code}\n' -d grant_type=client_credentials https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token
unset BOG_ID BOG_SK
```

- Secret Key აკრეფისას არ ჩანს. პასუხი მხოლოდ `HTTP 200` / `401` / … ხაზია: BOG-ის პასუხის ტექსტი და token საერთოდ არ იბეჭდება, საიდუმლო ბრძანების ხაზშიც არ ხვდება.

**რატომ შეიცვალა წინა ვერსია (v1.1):** ის `read -r -p`-ს იყენებდა. Mac-ის zsh-ში `-p` სხვა რამეს ნიშნავს (`read: -p: no coprocess`), ცვლადები ცარიელი რჩებოდა და შემოწმება ყალბ `401`-ს აჩვენებდა. ამასთან `sed` მხოლოდ `"access_token"` ველს მალავდა, სხვა ფორმით დაბრუნებულ საიდუმლოს არა. ორივე გამოსწორებულია და ტესტებით დადასტურებულია (zsh 5.9, ნამდვილი ტერმინალი).

| შედეგი | რას ნიშნავს | შემდეგი ნაბიჯი |
|---|---|---|
| `✓ ok · HTTP 200` | BOG იღებს წყვილს | §3 |
| `credentials_refused · HTTP 400/401` | წყვილი არასწორია ან ეს Online Payments-ის წყვილი არ არის | ხელახლა დააკოპირე ორივე, ზედმეტი ჰარის გარეშე. თუ ისევ ასეა, ბანკს კითხვა №1 |
| `forbidden · HTTP 403` | წყვილს იცნობს, მაგრამ API არ არის ჩართული | ბანკი |
| `no_answer · HTTP —` (ან `HTTP 000`) | ქსელი | სცადე თავიდან |

## 3. Vercel → Environment Variables (მხოლოდ **Production** scope)

https://vercel.com/kintsurashviligaga-ops-projects/avatar-g-frontend-v3/settings/environment-variables

- [ ] `BOG_CLIENT_ID` = OPAY Client ID. თუ უკვე არსებობს: Edit → ჩაანაცვლე.
- [ ] `BOG_SECRET_KEY` = OPAY Secret Key, მონიშნე **Sensitive**.
- [ ] `BOG_ENV` — წაშალე (ან `production`). `sandbox` აქ არასდროს.
- [ ] წაშალე, თუ არსებობს: `BOG_CALLBACK_PUBLIC_KEY`, `BOG_API_BASE`, `BOG_OAUTH_URL`, `BOG_CALLBACK_IP_ALLOWLIST`.
- [ ] შეამოწმე: `NEXT_PUBLIC_SITE_URL` = `https://myavatar.ge`.
- [ ] შეამოწმე: `CRON_SECRET` არსებობს.
- [ ] `BOG_CLIENT_ID` / `BOG_SECRET_KEY` **არ** უნდა იყოს Preview-სა და Development-ში.
- [ ] `BOG_CHECKOUT_MODE` = `admin` (შენი არჩევანი „Admin ტესტი", 18:12Z).

სახელების შემოწმება მნიშვნელობების გარეშე (პროექტის ფოლდერში, Mac-ზე):

```zsh
vercel env ls production | grep -E 'BOG_|NEXT_PUBLIC_SITE_URL|CRON_SECRET'
```

ამ ბრძანების გამოტანა შეგიძლია მომწერო: მასში მხოლოდ სახელები და scope-ებია.

⚠️ env-ის ცვლილება მოქმედებს **მხოლოდ ახალი deploy-ის შემდეგ**. ამჟამინდელ Production კოდს (30be5a2) `BOG_CHECKOUT_MODE` არ ესმის: ის PR #59-შია.

## 4. Merge = deploy (შენი ცალკე სიტყვით)

შენ აირჩიე გზა B („Admin ტესტი"). 18:23Z-ის შენი შეტყობინებით PR #59 რჩება **draft**, ამიტომ OAuth 200-ის შემდეგაც არ შევაერთებ, სანამ არ მომწერ „PR #59 merge".

როცა მომწერ: შევამოწმებ CI-ს, გამოვიყვან draft-იდან და შევაერთებ main-ში (= Production deploy). შედეგი:
- BOG ღილაკს მხოლოდ ადმინი დაინახავს (`BOG_CHECKOUT_MODE=admin`).
- დანარჩენებს Credits ფანჯარა ბარათით (Stripe) გადახდას შესთავაზებს. ეს გზა BUILT_NOT_PROVEN-ია: Production-ში Stripe-ით ჯერ არავის გადაუხდია.
- დღევანდელთან შედარებით უარესი არაფერი ხდება: ახლა BOG ყველასთვის ჩანს და ჩავარდნის შემდეგ ყიდვა ყველასთვის წყდება.

მიგრაცია არ სჭირდება (SQL ცვლილება არ არის).

## 5. ცოცხალი ტესტი (შენი ცალკე სიტყვით: „ცოცხალი ტესტი")

1. შედი https://myavatar.ge-ზე **kintsurashviligaga@gmail.com**-ით (ადმინი).
2. Admin → Billing → **„Bank of Georgia — readiness"**. შეამოწმე:
   - Credentials set; PRODUCTION; წითელი „sandbox" ხაზი **არ** ჩანს;
   - `client …XXXX` = შენი OPAY Client ID-ის ბოლო 4 სიმბოლო;
   - Schema OK; CRON_SECRET;
   - „Checkout: admins only".

   შემდეგ დააჭირე **„Test credentials with BOG"** → უნდა იყოს `ok`.
3. Credits ფანჯარა → **10 ₾ პაკეტი** → BOG-ის გვერდი → გადაიხადე შენი ბარათით → დაბრუნდი საიტზე.
4. მოსალოდნელი შედეგი:
   - **+100 კრედიტი**;
   - ადმინ ბარათზე შეკვეთა `completed`;
   - ლიმიტის ხაზი: „24h 10/1000 ₾ · 30d 10/5000 ₾" (მოძრავი ფანჯრები; ითვლის გადახდილს, დაბრუნებულსაც და განსახილველსაც, ამიტომ რეალურზე მეტს თუ აჩვენებს, ნაკლებს არა);
   - Business Manager-ში ჩანს 10 ₾-იანი ტრანზაქცია.
5. თუ შეცდომა მოხდა: ნუ გაიმეორებ რამდენჯერმე. ადმინ ბარათზე შეკვეთის ქვეშ მიზეზი ეწერება (BOG-ის პასუხი, საიდუმლოს გარეშე). გამომიგზავნე ამ ხაზის ფოტო.
6. ტესტის დროს Stripe-ის გვერდზე **ნუ** გადაიხდი. თუ BOG-ის ნაცვლად Stripe გაიხსნა, მომწერე: ეს ნიშნავს, რომ BOG შენთვის არ ჩაირთო.
7. გეგმა (54 ₾ ავტომატური განახლებით) ჯერ **ნუ** შეამოწმებ, სანამ ბანკი ავტომატურ გადახდებს არ დაადასტურებს.
8. დაბრუნება (refund) Business Manager-იდან: შეკვეთა ზუსტად BOG-ის სტატუსს მიჰყვება — `refund_requested` (მოთხოვნილია) → `refunded_partially` (ნაწილობრივ) → `refunded` (სრულად). უკან არ ბრუნდება, და დაბრუნებულ შეკვეთას განმეორებითი „completed" ხელახლა აღარ ჩაურიცხავს. კრედიტები ავტომატურად **არ** ჩამოიჭრება: ეს დაბრუნების წესია და უცვლელია (ბლოკერი B4, შენი გადაწყვეტილება).

## 6. ყველასთვის გახსნა (ტესტის შემდეგ, შენი სიტყვით)

- [ ] Vercel Production-ში წაშალე `BOG_CHECKOUT_MODE` → **Redeploy**.
- [ ] პირველ დღეებში ადმინ ბარათზე უყურე ლიმიტის ხაზს: 1 000 ₾ / 24სთ, 5 000 ₾ / 30 დღე. თუ ბანკი იტყვის, რომ ლიმიტი მერჩანტზეა, ლიმიტის გაზრდა საჯარო გაშვებამდე ითხოვე.
- [ ] საჭიროების შემთხვევაში BOG-ის გამორთვა: `BOG_CHECKOUT_MODE=off` → Redeploy. უკვე გადახდილი შეკვეთების ჩარიცხვა გაგრძელდება.
