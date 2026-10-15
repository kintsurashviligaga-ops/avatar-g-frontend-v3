# Evidence — ბანკის პასუხები (2026-10-15)

ანგარიში: [BOG_POST_LAUNCH_REPORT.md](../BOG_POST_LAUNCH_REPORT.md) §v1.5. აქ არ არის Merchant ID, Terminal ID, Client INN, პირადი ნომერი, საიდუმლო, IP, user id ან ბალანსი.

## 1. წყაროები

| წყარო | რა გამოვიყენე |
|---|---|
| ბანკის წერილი 2026-10-15 08:03Z (Gmail, 7 კითხვის პასუხი) | სახელი, ლიმიტები, recurring, refund, callback, sandbox, response კოდები |
| „Sand Box Geo.pdf“ (წერილის დანართი, 6 გვ.) | sandbox-ის თვითმომსახურება Business Manager-ში: Sandbox ობიექტი → Test Public Key / Test Secret Key |
| https://api.bog.ge/docs | Payment Details (`transaction_id`, `code`, `code_description`, `client.brand_ka/en`, `refund_amount`, `actions[]`), Callback, Refund (`POST /payment/refund/:order_id`, `Idempotency-Key`), Response codes, Sandbox test cards (…0001 / …0002 / …0003) |
| ორი დადასტურებული ხელშეკრულება | **არ მაქვს** (Gmail-ში არ არის). შინაარსი არ ვივარაუდე |

## 2. CI (PR #62, head `523e735`)

| Check | Run / job | შედეგი |
|---|---|---|
| BOG payments E2E → isolated (local Postgres 16 + PostgREST v12.2.3, ყალბი BOG) | run 38717026119, job 116362116959 | **success**: SQL T1–T11 ALL OK, concurrency C1–C3 ALL OK, route-level **21/21** (E1–E21) |
| BOG payments E2E → sandbox (api-sandbox.bog.ge) | run 38717026119, job 116362116852 | success = **not run**: `BOG_SANDBOX_CLIENT_ID` / `BOG_SANDBOX_SECRET_KEY` არ არის, job ამას `::notice`-ით წერს |
| billing on real Postgres | run 38717026145 | success |
| preview-e2e | run 38717026197 | success |

## 3. ლოკალური გაშვებები (sandbox კონტეინერი, Postgres 16, PostgREST 12.2.3)

- `npm run test:bog-e2e`: SQL ALL OK, concurrency ALL OK, **21/21**, ორჯერ ზედიზედ.
- ჩადებული SQL შეცდომით `scripts/bog-e2e.sh` ახლა exit 1-ით მთავრდება (ადრე `ERROR`-ს ბეჭდავდა და წარმატებით მთავრდებოდა).
- `bog-sandbox.e2e.test.ts`: გარდის ტესტი (`assertAllowedTarget`) გადის; სცენარები S1–S7 გასაღებების გარეშე იკეტება. ცრუ გასაღებებით: S1 → „oauth: no usable answer“ (ქსელი ჩაკეტილია), checkout → 502 + `init_failed` რიგი: კოდის გზა ქსელის საზღვრამდე მუშაობს.
- `bogSandboxPayer.ts` შემოწმდა ადგილობრივ ცრუ გვერდებზე: ჩვეულებრივი ფორმა → `pay=success`; უარი → `pay=failed`; მეთოდის არჩევა + iframe + 3-D Secure → success; ფორმის გარეშე → „no card-number field found“.
- მთელი jest: 13 867 გავიდა, 18 ჩავარდა სამ ffmpeg სუიტაში (main-ის იდენტური ფაილები, BOG-ს არ ეხება). `tsc --noEmit` 0, eslint 0.

## 4. Production (read-only)

| შემოწმება | შედეგი |
|---|---|
| workflow „BOG Production smoke (read-only)“, run 38717181786, job 116362618365, `https://myavatar.ge`, `expect_bog=false`, main `fef867a`, 2026-10-15 10:00:50–10:01:02Z | **success**: ანონიმურს BOG არ უჩანს, ხელმოუწერელი callback / cron / admin API იკეტება |
| Production DB-ის read-only შეჯერება | **NOT RUN**: ჩემი გარემოს უფლებამ SELECT არ დაუშვა; გვერდის ავლით არ ვცდილობ. ბოლო შეჯერება 2026-10-13 09:58Z ([post-launch-2026-10-13.md](post-launch-2026-10-13.md) §3) |
| HawkScan | **NOT RUN** (`HAWK_API_KEY` არ არის) |

Production-ში არაფერი შეცვლილა: გადახდა, refund, env, credential, მიგრაცია, merge ან deploy არ ყოფილა.
