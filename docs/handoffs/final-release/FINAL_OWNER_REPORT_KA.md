# საბოლოო ანგარიში GG-სთვის — Final Integration (2026-10-15)

სტატუსი: **release ჯერ არ მომხდარა.** ბრენჩი მზადაა (PR #74), ელოდება CI-ს release-ის commit-ზე, Video Core-ის ფასიანი
ტესტის დასრულებას და GG-ის merge + deploy ბარათს. deploy-ის შემდეგ ეს ფაილი განახლდება 10-ე პუნქტით.

## 1. რა იყო Production-ზე და რა არის ახალი

Production ახლა: main 5517047, dpl_vKQqsez4BP8vRpi33HM8E3GGmBsR (Video Core PR #77, 20:46Z; მანამდე PR #76, defects 47/48).
ახალი ამ release-ით: Image Studio (admin), Music Studio (გამორთული), Voice v2 (გამორთული) და ხმის უსაფრთხოება, Google-ის
საზღვარი ჩართული, dubbing/პრეზენტაცია გამორთული ფასის დამტკიცებამდე, Phase 1 შესწორებები (GO_NO_GO_KA.md, „რას ცვლის").

## 2. ინტეგრირებული PR-ები

| PR | head commit | ბრენჩზე |
|---|---|---|
| #60 Image Studio v1 | be9edee3 | 7bbc4a88 |
| #65 Music Studio v1 | 9d25c7a4 | dfdb7bdd |
| #68 Voice Experience v2 | f93f1bc1 | e71e484a (+ adapter 0dc444e2) |
| #67 Global E2E (provider boundary) | 731e9612 | 7aaf1eed |
| Phase 1 შესწორებები | — | e80d88b4 |
| main (PR #75, #76, #77) | b21506bb, de15464d, 55170471 | bea302a1, f52f918e, 6f52934f (01 rows 7, 9) |

არ შევიდა: #64 (ჩანაცვლდა; 47/48 Video Core-მა გადაიტანა #76-ით), #66 phone (migration-ის სახელი ემთხვევა), uid race.

## 3. რა მუშაობს რეალურ Production-ზე პირდაპირი მტკიცებით

ამ release-მდე უკვე PROVEN: საიტი KA/EN/RU, რეგისტრაცია/შესვლა, admin guard, კრედიტები, ატვირთვა, admin chat montage,
admin 4 წმ Veo კლიპი, ჩვეულებრივი ანგარიშის ფასიანი 16 წმ ფილმი, BOG admin 10 ₾. ამ release-ის ცვლილებები Production-ზე
ჯერ არ არის, ამიტომ მათთვის Production მტკიცება ჯერ არ არსებობს. Production-ის read-only შემოწმება 19:11Z: `/api/version`
de15464 (20:52Z: 5517047), `/api/health` healthy, `/api/health/public` 5 ok, voice down (ElevenLabs probe, 2026-09-დან).

## 4. რა რჩება გამორთული, დაბლოკილი ან დაუმტკიცებელი

Music Studio, Voice v2 UI, Image Studio საჯაროდ, dubbing/პრეზენტაცია, გარე ძრავის ყველა ხელსაწყო (06), phone, V2V,
ვოკალი. Preview იზოლირებული არ არის (FR-2). BOG sandbox: UNAVAILABLE (ბანკი ობიექტს ვერ ქმნის).

## 5. რეალური მედია

ამ thread-ს ფასიანი გენერაცია არ გაუშვია (ნებართვა არ ყოფილა). Video Core-ის რეალური ფილმები მის ანგარიშშია.

## 6. ფასი, კრედიტი, refund, ledger

ფასი არ შეცვლილა. FR-7: ბარათზე „სრული სიმღერა" 12 კრედიტია, როგორც route ჩამოჭრის. Exactly-once debit და refund
დამტკიცებულია იზოლირებულად (Video Core real Postgres, Image isolated-db, Music live E2E, BOG fake bank). Production-ის
ledger-ის delta ამ release-ისთვის: ჯერ არ არის.

## 7. ტესტები

CI 10/10 მწვანე ba35a07e-ზე. Jest სრული main de15464d-ით (f52f918e): suites 939/0/12, tests 14,372/0/114, ერთი
წარუმატებელიც არ არის; + 2 ახალი regression suite (20 ტესტი). დეტალები: 04_FULL_TEST_MATRIX.md.

## 8. რეალური და სიმულირებული

რეალური: მხოლოდ Production-ის read-only შემოწმება. იზოლირებული (ყალბი პროვაიდერი, ლოკალური ბაზა): ყველა E2E.
სიმულირებული: Gemini Live ხმა. არ ჩატარებულა: ფასიანი Imagen/Lyria/Veo ახალ სტუდიებზე, ტელეფონზე ხმის ტესტი.

## 9. GG-ის მოქმედებები

1. merge + deploy ბარათზე დაჭერა (Video Core-ის ფასიანი ტესტის შემდეგ).
2. deploy-ის შემდეგ admin-ით შესვლა www.myavatar.ge-ზე canary-სთვის (09, ნაბიჯი 7). ფული არ იხარჯება.
3. რეალური ტელეფონის ხმის ტესტი (08).
4. სურვილისამებრ, ცალ-ცალკე: იზოლირებული Supabase Preview-სთვის, ფასიანი ტესტები, dubbing/პრეზენტაციის ფასი.

## 10. Deploy

ჯერ არა. Rollback target: dpl_vKQqsez4BP8vRpi33HM8E3GGmBsR (5517047), release-ის წინ ხელახლა შემოწმდება.

## 11. შემდეგი ნაბიჯი, თუ სესია დასრულდება

CONTINUE_FROM_HERE.md.
