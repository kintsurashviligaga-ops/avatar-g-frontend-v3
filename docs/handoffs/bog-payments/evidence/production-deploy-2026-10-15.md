# BOG Payments: PR #62 Production-ში (2026-10-15)

## 1. რა მოხდა

| | |
|---|---|
| შენი სიტყვა | 10:29:25Z ბარათი „Merge + deploy“, 10:30:03Z „კი“. მხოლოდ PR #62-ის merge და deploy |
| Merge | PR #62 → `main`, merge commit `3516a61` (10:33Z). მიგრაცია, env-ის ცვლილება და `vercel.json`-ის ცვლილება არ ყოფილა |
| CI merge-მდე (head `0144488`) | verify 38718292142 · BOG payments E2E (isolated) 38718292362 · preview-e2e 38718292123 · billing on real Postgres + live E2E 38718292263: ყველა **success**. Sandbox job „success“ ნიშნავს **not run**: სატესტო გასაღებები GitHub-ში ჯერ არ არის |
| Deployment | `dpl_jQrS5XWa2xm7zVLAnAUizS4B6ToD`, აწყობა 10:33:07Z, **READY ~10:37:36Z**; myavatar.ge და www.myavatar.ge მასზეა |
| BOG-ის რეჟიმი | უცვლელი: `BOG_CHECKOUT_MODE=admin`, გეგმები გამორთული. ანონიმურს BOG არ უჩანს |

## 2. შემოწმებები (ანონიმური, read-only)

| შემოწმება | შედეგი | იარლიყი |
|---|---|---|
| `/api/health` 10:38:26Z | `ok: true`, `healthy`, commit `3516a61` | PROVEN |
| `/api/checkout/capabilities` | `stripe: true`, `bog: false`, `bogPlans: false` | PROVEN |
| workflow „BOG Production smoke (read-only)“, run 38721671183, main `3516a61`, 10:38:12–10:38:29Z | success: BOG ანონიმურს არ უჩანს; ხელმოუწერელი callback, cron და admin API იკეტება (cron-ის 403 10:38-ზე ამ შემოწმებისაა) | PROVEN |
| cron `/api/cron/bog-billing` ახალ deployment-ზე | 10:40Z-ის ტიკი 200, `dpl_jQrS5XWa2xm7zVLAnAUizS4B6ToD`-ზე (Vercel observability, deployment-ის მიხედვით). 10:30Z-ის ტიკი ჯერ ძველ deployment-ზე იყო, ისიც 200 | PROVEN |
| 5xx 10:30Z-დან | არცერთი მთელ პროექტზე, 10:30Z-დან შემოწმებამდე (10:43Z), Vercel observability | PROVEN |
| Production DB-ის read-only შეჯერება | ჩემი გარემოს უფლებამ SELECT არ დაუშვა, გვერდს არ ვუვლი | NOT RUN |
| მერჩანტის სახელი BOG-ის გვერდზე | ადმინის ღილაკი სჭირდება (§4). Production-ში მე არ შევდივარ | NOT RUN |
| HawkScan | `HAWK_API_KEY` არ არის | NOT RUN |

## 3. უკან დაბრუნება (თუ რამე აირია)

- **BOG-ის გამორთვა:** `BOG_CHECKOUT_MODE=off` და მიმდინარე deployment-ის Redeploy. ამას მე ვაკეთებ, შენი სიტყვით.
- **კოდის დაბრუნება:** Vercel Instant Rollback → `dpl_53vwsPFRs9cppPcvxjhUviH8hSwd` (`fef867a`, წინა Production). `git revert` ან ძველი commit-ის Redeploy არ გამოიყენო.
- Vercel-ში Redeploy-ს ნუ დააჭერ.

## 4. რისი ნახვა შეგიძლია (არასავალდებულო, თანხა არ მოძრაობს)

ბანკმა თქვა, რომ სახელი გაასწორა. გადამოწმება: https://myavatar.ge/ka/admin → „ბილინგი“ → BOG-ის ბარათი → „მონაცემების შემოწმება BOG-თან“. ქვემოთ გამოჩნდება „სახელი BOG-ის გადახდის გვერდზე: …“ (ბოლო გადახდილი შეკვეთის ქვითრიდან). თუ ისევ „ჩემი ავატარი“ / „My avatar“ წერია, ბანკს ვწერთ. შეკვეთა არ იქმნება, თანხა არ ჩამოიჭრება.

## 5. რა რჩება

| | ვისზეა |
|---|---|
| ორი დადასტურებული ხელშეკრულება (PDF ან ფოტო; ID-ები შეგიძლია დაფარო) | შენ |
| Sandbox-ის ორი სატესტო გასაღები GitHub Actions secrets-ში (`BOG_SANDBOX_CLIENT_ID`, `BOG_SANDBOX_SECRET_KEY`), [გეგმა §8](../BOG_PUBLIC_LAUNCH_PLAN.md). ამის შემდეგ S1–S7-ს მე ვუშვებ | შენ → მე |
| ~~მეორე წერილი ბანკს~~ ✓ 11:40Z გაიგზავნა; ველოდებით პასუხს | ბანკი |
| ~~B4: refund-ისას კრედიტების კორექციის წესი~~ ✓ 11:28Z: ხელით, როგორც ახლა | შენ |
| BOG ყველასთვის, ავტომატური გეგმები | შენი ცალკე სიტყვით, ზემოთა პუნქტების შემდეგ |

Production-ში ამ deploy-ის გარდა არაფერი შეცვლილა: გადახდა, refund, env, credential ან მიგრაცია არ ყოფილა.

## 6. მეორე deploy: PR #70 (2026-10-15 14:36Z)

შუალედში Production-ში PR #69 (Video Core, `b46bb44`) შევიდა სხვა თრედიდან, 12:05Z-ზე; BOG smoke მასზეც მწვანე იყო (run 38732005645).

| | |
|---|---|
| შენი სიტყვა | 14:23:51Z ბარათი „PR #70 შევაერთო და Production-ში გავუშვა?“ → „Merge + deploy“ (CI-ის მწვანე გახდომის შემდეგ) |
| რა მოაქვს | ბანკის მიერ უარყოფილი refund (`actions[]`, `rejected`, `refund_amount` 0) შეკვეთას `refund_requested`-იდან `completed`-ში აბრუნებს, მხოლოდ სტატუსს; cron-ის refund-ის შეჯერება 60-ის ნაცვლად 93 დღეს კითხულობს (BOG refund-ს 3 თვემდე იღებს); docs |
| CI merge-მდე (head `afd0506`) | verify 38749319198 · live E2E (desktop + phone) და billing on real Postgres 38749319120 · BOG E2E isolated 38749319290 · preview-e2e 38749319068 · Vercel Preview: ყველა **success**. Sandbox job კვლავ **not run** (სატესტო გასაღებები GitHub-ში ჯერ არ არის) |
| Merge | PR #70 → `main`, merge commit `4fc0377` (14:36:33Z). მიგრაცია, env-ის ან `vercel.json`-ის ცვლილება არ ყოფილა |
| Deployment | `dpl_5kNkFQWWfxju5Q4V1FBVpi92ako5`, აწყობა 14:36:34Z, **READY 14:40:23Z**; myavatar.ge და www.myavatar.ge მასზეა |
| BOG-ის რეჟიმი | უცვლელი: `BOG_CHECKOUT_MODE=admin`, გეგმები მხოლოდ ადმინისთვის |

| შემოწმება (ანონიმური, read-only) | შედეგი | იარლიყი |
|---|---|---|
| `/api/health` 14:42:57Z | `ok: true`, `healthy`, commit `4fc0377` | PROVEN |
| `/api/checkout/capabilities` 14:43:02Z | `stripe: true`, `bog: false`, `bogPlans: false` | PROVEN |
| workflow „BOG Production smoke (read-only)“, run 38753844415, main `4fc0377`, 14:43:06Z | 9/9: `/ka` `/en` `/ru` 200; BOG ანონიმურს არ უჩანს; checkout 401, ხელმოუწერელი callback 401, შეკვეთის სტატუსი 401, admin API 403, cron 403 (ამ შემოწმების საკუთარი 403-ია) | PROVEN |
| cron `/api/cron/bog-billing` ახალ deployment-ზე | 14:50Z-ის ტიკი 200 `dpl_5kNkFQWWfxju5Q4V1FBVpi92ako5`-ზე (Vercel observability, deployment-ის მიხედვით). 14:40Z-ის ტიკი ჯერ ძველ deployment-ზე იყო, ისიც 200; 14:43Z-ის 403 smoke-ისაა | PROVEN |
| 5xx 14:36Z-დან | არცერთი მთელ პროექტზე, 14:36–14:56Z (Vercel observability). Runtime errors-ში მხოლოდ ძველი ჯგუფი: `/api/app/worker/tick` → `public.service_jobs` არ არსებობს (2026-10-02-დან, BOG-ს არ ეხება, ლოგის ჩანაწერია, 5xx არა) | PROVEN |
| უარყოფილი refund-ის გზა ცოცხლად | Production-ში უარყოფილი refund ჯერ არ ყოფილა; იზოლირებულად E22 (CI + ლოკალურად) | PROVEN იზოლირებულად · Production-ში NOT RUN |
| HawkScan | `HAWK_API_KEY` არ არის | NOT RUN |

უკან დაბრუნება ახლა: Vercel Instant Rollback → `dpl_6AaKtWBNgxyvjZSv4eF48DdSdTE7` (`b46bb44`, Video Core-ითურთ). უფრო ძველზე (`dpl_jQrS5XWa2xm7zVLAnAUizS4B6ToD`) დაბრუნება Video Core-ის Vertex-ს და film billing-ს წაიღებს, ამიტომ მხოლოდ ორივე თრედის შეთანხმებით. BOG-ის გამორთვა: `BOG_CHECKOUT_MODE=off` + მიმდინარე deployment-ის Redeploy. Vercel-ში Redeploy-ს შენ ნუ დააჭერ.

ამ deploy-ის გარდა Production-ში არაფერი შეცვლილა: გადახდა, refund, env, credential ან მიგრაცია არ ყოფილა.
