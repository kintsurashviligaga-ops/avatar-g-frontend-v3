# GO / NO-GO — საბოლოო ინტეგრაცია (2026-10-15, 18:30Z)

**ვერდიქტი: NO-GO ახლა, CONDITIONAL GO ერთი პირობით.** ბრენჩი PR #74 (main b21506b + #60, #65, #68, #67 + შესწორებები). CI-ს ყველა 10 შემოწმება მწვანეა იზოლირებულ გარემოში. Production-ზე ჯერ არაფერი გასულა.

## რატომ NO-GO ახლა

1. **FR-1 (defects 47/48):** სხვისი ფილმის ტოკენით გადახდის შეცდომა. ის არსებობს main-ზეც. გასწორება Video Core-ის PR #76-შია (CI მიმდინარეობს). სანამ #76 main-ში არ შევა და ამ ბრენჩზე ხელახლა არ შემოწმდება, release არ ხდება.

## რა მზადაა (PROVEN_ISOLATED)

- Video Core, Image Studio, Music Studio, Voice (სიმულაციით), BOG (ყალბი ბანკით): ყველა isolated E2E მწვანეა (04_E2E_MATRIX.md).
- ხმით "კი" ფულს აღარ ხარჯავს. გენერაცია მხოლოდ ღილაკით იწყება.
- ორი უფასო გარე პროვაიდერის გზა დაიხურა. ფასი ბარათზე და ჩამოჭრილი თანხა ახლა ერთნაირია (ფასი არ შეცვლილა).
- `/ka/create` აღარ არის 404.

## რა რჩება გამორთული release-ის შემდეგაც

Music Studio, Voice v2 UI, Image Studio საჯაროდ, AGENT_G_MEDIA_EXEC საჯაროდ და ყველა public flag. თითოეულს GG-ის ცალკე სიტყვა სჭირდება.

## GG-ის გადასაწყვეტი (ცალ-ცალკე, ბარათით)

1. **Merge + staged deploy** PR #74-ისა, #76-ის შემდეგ: admin canary, flag-ები გამორთული, rollback მზადაა.
2. იზოლირებული Supabase პროექტი Preview-სთვის (FR-2).
3. ფასიანი რეალური ტესტები (Veo/Lyria/Imagen) ამ ბრენჩზე.

## Rollback

Vercel Instant Rollback b21506b-ის deployment-ზე (dpl_2bSktQyb9CrcLZZxWTyZNCd82PBG). ბაზის migration არ არის, ამიტომ rollback სუფთაა.
