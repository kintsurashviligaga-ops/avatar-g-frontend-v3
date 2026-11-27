# v5.1 Phase 8 prep: Georgian language QA

**Status: PREPARED, NOT RUN.** Draft PR off `main`. No model is called, nothing is charged, nothing is wired.

GG 2026-11-13 13:44Z: "Start drafting Phase 8 (Georgian Language QA). Create the 20+ realistic Georgian test prompts and the scoring rubric as specified in the v5.1 document."

Spec §28 asks for: a Georgian QC corpus of at least 20 prompts; intent preservation; Georgian pronunciation and lip-sync where applicable; cultural and historical accuracy checks where requested; honest user-facing fallback messages. Verdicts follow §33 (PASS, CONDITIONAL_PASS, FAIL, NOT_VERIFIED).

## 1. What is here

| File | What |
|---|---|
| `lib/qa/georgian/corpus.ts` | 25 cases a Georgian user would really type or say, across chat, history and culture, formal letters, images (with Georgian lettering, a brand, Latin-typed Georgian), video with a spoken Georgian line, avatar, music, read-aloud with numbers, Live voice, web search, browser, code run, montage, audio extract, a switched-off service, a simulated Google failure and a stop. Each case lists what must survive, what must never be said, the rubric dimensions and, for history and culture, reference facts with a source. |
| `lib/qa/georgian/rubric.ts` | Seven dimensions scored 0–4 with written anchors and weights (language 15, grammar 20, intent 25, culture 15, pronunciation 10, lip-sync 5, honesty 10), critical failures, and the case and corpus verdicts. |
| `lib/qa/georgian/score.ts` | The automatic half: script and language share, foreign alphabets (reuses `lib/voice/heardScript`), kept numbers, names and quoted lines (in the answer or in the brief sent to the model), required content, sentence counts, forbidden phrases. Code can fail a dimension; it can never pass one a person must judge. |
| `docs/v5.1-phase8/01-corpus.md`, `02-rubric.md`, `scoresheet.csv` | Generated from the code for reviewers. `scoresheet.csv` has one row per case and human-scored dimension. |

Tests: corpus shape, the router baseline, the scorer against written good and bad sample answers, and the generated files staying in sync.

## 2. Critical failures (any one fails the case and the corpus)

- The answer is not Georgian, or contains letters of an alphabet the product never writes (the Live transcript bug class from 2026-10-26).
- A quoted line, brand, name or URL is lost or translated (KA-07, 09, 10, 12, 13, 14, 19).
- A false premise is accepted (KA-04, Rustaveli in the 18th century) or a reference fact is contradicted (KA-02, KA-03).
- Success is claimed after a failure, data is invented (KA-17 weather), or a Google-side failure is charged (KA-24, D-15).

## 3. Finding today: the deterministic router (free, offline)

`lib/agent/intent` reads 16 of the 25 labelled cases as expected. The 9 it reads differently are listed in `ROUTER_KNOWN_MISSES` so they stay visible (the test fails if one starts passing or a new one appears):

| Case | Expected | Router today | Note |
|---|---|---|---|
| KA-09 poster with Georgian caption | image | conversation | caption wording not recognised |
| KA-10 logo, mixed ka/en | image | conversation | "logo" not recognised |
| KA-11 Georgian typed in Latin | image | conversation | Latin-typed Georgian not read |
| KA-14 "have my avatar say …" | talking avatar | conversation | phrasing not recognised |
| KA-18 web search | research | conversation | left to the chat model today |
| KA-19 open gov.ge | browser | conversation | left to the chat model today (admin-only, D-08) |
| KA-20 write and run Python | code run | conversation | left to the chat model today (admin-only, D-08) |
| KA-23 3D from a photo | not available | 3D as a live service | 3D is off; the route refuses before any charge, but the user should hear "not available" up front |
| KA-25 "გააჩერე, აღარ მინდა." | stop | conversation | stop followed by a second clause |

"Conversation" does not always mean the user is failed: the chat model can still reach a tool. But it is the cheapest place to fix these, and it belongs to the Phase 3.5 wiring work. No router change is in this PR.

## 4. How the paid run will work (needs GG: DB back, budget)

1. For each case, send the prompt as a signed-in test user on Production (Previews block paid generation), with the listed attachments. Save the answer text, the brief sent to the model, and the media.
2. Run `scoreCase` on each saved output. Code failures are final.
3. Native Georgian reviewers fill `scoresheet.csv` (grammar, culture, pronunciation, lip-sync, and the human half of intent and honesty). Two reviewers per case; disagreements of more than one point are discussed.
4. `corpusVerdict` gives the Phase 8 verdict. Until reviewers score, it is honestly NOT_VERIFIED.

Estimated cost of one full run: mostly the media cases (KA-08…16, 21, 22, 24). It will be priced from the Phase 5 price book before anything runs, and only within a budget GG approves.

## 5. Open questions for GG

1. Who are the native reviewers (GG plus one more?), and is two per case right?
2. Pass bar: 75/100 per case and 90% of cases for CONDITIONAL_PASS. Keep, or stricter?
3. Fix the 9 router findings in Phase 3.5, or earlier as a small separate PR?
