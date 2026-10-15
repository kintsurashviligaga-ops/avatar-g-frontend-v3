# Video Core v1.0 — საბოლოო GO / NO-GO (2026-10-14)

**ვერდიქტი: საჯარო გახსნა — NO-GO (ისევ). კოდი — RELEASE-CANDIDATE merge-ისთვის, შენი სიტყვით.**
Video Core რჩება admin-only. Production-ზე არაფერი შეცვლილა (არც deploy, არც env, არც მიგრაცია); ფასიანი provider-ის გამოძახება: **0** (დახარჯული: $0 ახალი).

## რა გაკეთდა
- **ბილინგი (დეფექტი 44):** ფასიანი ფილმის „უკვე გადახდილია" მარკერი აღარ არის მხოლოდ Redis-ში. გადახდის მტკიცებულებას ახლა `credit_ledger` იძლევა (ref = `${tokenId}:charge`), ერთჯერადი ხარჯვა — `request_idempotency`-ით (Production-ში უკვე არის), ან ახალი ცხრილით (წინადადება `proposals/20261014a_film_payment_waivers.sql`, **არ არის გაშვებული**). ჩავარდნილი აწყობა waiver-ს აბრუნებს → Retry უფასოა. Commits: `9adde502`, `072235e7`.
- **ტესტები:** tsc ✅ · lint ✅ · build ✅ · Jest: 892 suite ✅; 6 ჩავარდა ამ Mac-ზე — 1 ჩემი (გასწორდა), 5 real-ffmpeg: ადგილობრივი ffmpeg 6.0 იძლევა 890 კადრს 891-ის ნაცვლად (QC სწორად იწუნებს); ჩემს ცვლილებამდეც იგივეა. Linux CI-ში გასაშვებია. · **რეალურ Postgres 16 + PostgREST-ზე**: waiver 4/4 + 11/11 (12 ერთდროული assemble → ზუსტად 1 გათავისუფლება, ორმაგი ჩამოჭრა არ არის) ✅ · Playwright Desktop+iPhone (mock): 92 ✅ / 6 skip / 0 ❌.
- **Vertex/Veo:** V1–V6 unit-ით დადასტურებულია. Google დოკუმენტაცია: `veo-3.1-generate-001` და `veo-3.1-fast-generate-001` GA; lite — Preview. **Production-ს არ აქვს `VEO_TRANSPORT` და `GCP_*`** (Preview-ს აქვს) → იქ Veo Gemini API-ზე წავა. Gemini-API-ს რუკაში ჯერ `-preview` id-ებია (`lib/veo/capabilities.ts`).
- **B3 storyboard_revisions:** მიგრაცია ადგილობრივად შემოწმდა (ხელახალი გაშვება, rollback, ხელახალი გაშვება — სუფთა); RLS CI-ში იყო დადასტურებული. Production-ზე არ გაშვებულა.

## შენი თანხმობა სჭირდება
1. `20261014a_film_payment_waivers.sql` Production-ში (სურვილისამებრ; ფიქსი უამისოდაც მუშაობს, 1 სთ-იანი ლიმიტით).
2. Merge-ის შემდეგ `/api/health` — Redis ok (სანამ არ დადასტურდება, დეფექტი 44 სრულად დახურულად არ ჩაითვლება).
3. **R3 პოლიტიკა:** ჩავარდნილი საბოლოო აწყობისას კლიპების საფასური დარჩეს (ახლა), დაბრუნდეს N წარუმატებლობის შემდეგ, თუ QC-ის უარყოფისას სრულად?
4. Production: `VEO_TRANSPORT=vertex` + `GCP_*`; ცოცხალი Veo ტესტები L2/L3 ($5 ჭერის ფარგლებში).
5. B3 მიგრაცია Production-ზე; `HAWK_API_KEY` (DAST); D1–D12.
6. ამ branch-ის merge (არ გამიკეთებია).

## რაც დაუდასტურებელია
Production E2E ახლიდან (ბოლო: 2026-10-13 14:49Z, 10/10), DAST, ffmpeg სუიტები Linux-ზე, Vertex L2/L3, RLS ლოკალურად (ადგილობრივ სქემაში `auth.uid()` არ არის).

Branch: `claude/video-core-final-20261013-234606` · დეტალები: `FINAL_RUN_2026-10-14.md`.
