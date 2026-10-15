# Video Core v1.0 — საბოლოო ავტონომიური გაშვება (2026-10-14, გაგრძელება)

## 1. PR
**PR შექმნილი არ არის — ბლოკერი:** `gh` არ არის ავტორიზებული (`gh auth status`: not logged in), გარემოში არ არის GitHub ტოკენი/კრედენციალი, ხოლო საჯარო API ამ ბრენჩზე PR-ს არ აჩვენებს (`total_count: 0`). PR-ის გახსნას ტოკენი სჭირდება.
ხელით: https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/compare/main...claude/video-core-final-20261013-234606?expand=1 (Draft).

## 2. ბრენჩი
`claude/video-core-final-20261013-234606` — main-ზე (`fef867a6`) წინ; ძალისმიერი push და main-ში merge არ ყოფილა.

## 3. ცვლილებები
ამ გაშვებაში ახალი კოდი არ დამატებულა. დეფექტი #44 (ფილმის გადახდის waiver-ის გამძლეობა Redis-ის გარეშე) დახურულია კოდში commit-ებით `9adde502`, `072235e7`.
ექვსივე Jest-ჩავარდნა გამოკვლეულია: `schema-drift` — ჩემი, გასწორებულია; დანარჩენი ხუთი — macOS-ის `ffmpeg-static` ბინარი (6.0 vs. Linux), არა პროდუქტის დეფექტი. ტესტები არ შემიცვლია.

## 4. გადამოწმება (ამ მანქანაზე, macOS)
| შემოწმება | შედეგი |
| --- | --- |
| `tsc --noEmit` | გავიდა, 0 შეცდომა |
| schema-drift + filmWaiverStore | 21/21 |
| ffmpeg-ის 5 ჯგუფი, `FFMPEG_BIN=/opt/homebrew/bin/ffmpeg` (8.1) | 7 სუიტი გავიდა; 1 ჩავარდა: `effects.ffmpeg` F7 „steady" (vidstab, ბარიერი 40 %-ს 0.03 px-ით ვერ აღწევს) |
| ESLint / Build / სრული Jest / Playwright T2 (92 passed) | წინა გაშვებიდან (იხ. `FINAL_RUN_2026-10-14.md`), ამჯერად არ გამიმეორებია |
| **Linux CI** | **არ გაშვებულა** (PR არ არის; `ci.yml` მხოლოდ `pull_request`-ზე). Docker/Linux ლოკალურად მიუწვდომელია |
| Production E2E, DAST | არ გაშვებულა (წვდომა/`HAWK_API_KEY` არ არის) |

## 5. ღია ბლოკერები
1. PR/Linux CI — GitHub-ის ავტორიზაცია.
2. F7 vidstab: დაუდგენელია, არის თუ არა Mac/ffmpeg-ის განსხვავება (Linux-ზე დადასტურება საჭიროა).
3. D1–D12, Vertex ცოცხალი ტესტები L2/L3, B3 (storyboard_revisions) Production მიგრაცია, DAST — მოსაგვარებელია მფლობელთან.
4. Mock ტესტები არ არის Production-ის მტკიცებულება.

## 6. Production-ის მზადყოფნა
**NO-GO (დაუდასტურებელი):** კოდი ლოკალურად მწვანეა, მაგრამ Linux CI ამ ბრენჩზე არ გასულა და გარე მოთხოვნები დაუდასტურებელია.

## 7. საჭირო თანხმობა მფლობელისგან
1. GitHub-ის ტოკენი ან PR-ის ხელით გახსნა → Linux CI-ის გაშვება.
2. `proposals/20261014a_film_payment_waivers.sql`-ის გამოყენება Production-ში (სურვილისამებრ, 1 სთ-იანი ლიმიტის მოსახსნელად).
3. R3 რეფანდის პოლიტიკა (A/B/C); B3 მიგრაცია.
4. Vertex: `VEO_TRANSPORT=vertex` + `GCP_*` Production-ში და L2/L3 ბიუჯეტი (≤ $5).
5. Merge main-ში — მხოლოდ მწვანე Linux CI-ის შემდეგ.

ფასიანი პროვაიდერის გამოძახება: 0. Production-ში ცვლილება: არ ყოფილა.
