# v5.1 Phase 8: Georgian scoring rubric

> Generated from `lib/qa/georgian/rubric.ts`. Do not edit by hand.

Each dimension is scored 0–4. A case is scored only on the dimensions it lists; the weighted score is out of 100 over those.

| Dimension | Weight | Scored by | Critical failure |
|---|---|---|---|
| Language and script | 15 | code | Answer not in Georgian, or any Devanagari / Arabic / Armenian / Hangul / Ethiopic / other foreign letters. |
| Grammar and naturalness | 20 | native reviewer | — |
| Intent preservation | 25 | code + reviewer (code can only fail it) | A verbatim item (quoted line, brand, name, URL) lost or translated; or the wrong service started. |
| Cultural and historical accuracy | 15 | native reviewer | Contradicts a reference fact, or accepts and elaborates a false premise. |
| Georgian pronunciation (audio) | 10 | native reviewer | — |
| Lip-sync (video) | 5 | native reviewer | — |
| Honesty and fallbacks | 10 | code + reviewer (code can only fail it) | Claims success after a failure, invents data, or a charge for a Google-side failure (D-15). |

## Anchors

### Language and script

- **4** — Whole answer in Georgian (Mkhedruli); Latin only for names, links, code or the user's own Latin words.
- **3** — Georgian, with a few needless English or Russian words.
- **2** — Mostly Georgian, but whole phrases in another language.
- **1** — Half Georgian, half another language.
- **0** — Not Georgian, or letters of an alphabet the product never writes.

### Grammar and naturalness

- **4** — Reads like a careful native speaker wrote it: correct cases, verb agreement, register and word order.
- **3** — One or two small slips a native reader forgives (a postposition, a missing comma).
- **2** — Clearly understandable but sounds translated, or several grammar slips.
- **1** — Frequent errors; meaning sometimes unclear.
- **0** — Broken Georgian, wrong register throughout (e.g. "შენ" in a formal letter), or unreadable.

### Intent preservation

- **4** — Did exactly what was asked, kept every number, name, quoted line, format and limit.
- **3** — Did what was asked; one minor detail softened (e.g. a style word).
- **2** — Right task, but one stated constraint lost (length, aspect, voice, count).
- **1** — Partly the wrong task, or several constraints lost.
- **0** — Wrong task, or a quoted line / brand / name translated or changed.

### Cultural and historical accuracy

- **4** — Every fact right and in context; a false premise in the question is politely corrected.
- **3** — Facts right; slightly thin or one harmless simplification.
- **2** — One factual slip that does not change the point.
- **1** — A wrong date, name or place that matters.
- **0** — Invented history, a false premise accepted, or a disrespectful / stereotyped take.

### Georgian pronunciation (audio)

- **4** — Native-sounding: ejectives (კ პ ტ წ ჭ ყ), clusters (მწვრთნელი, ბრძ) and stress natural; numbers read as Georgian words.
- **3** — Clearly Georgian, one or two sounds slightly off.
- **2** — Understandable but with an obvious foreign accent or a misread number.
- **1** — Several words hard to understand.
- **0** — Not Georgian sounds, wrong language, or gibberish.

### Lip-sync (video)

- **4** — Mouth matches every syllable; the right person speaks; the line is said once.
- **3** — Matches, with a short drift.
- **2** — Noticeable drift or the line repeated.
- **1** — Mouth mostly does not match, or the wrong person speaks.
- **0** — No speech, or an unrelated mouth movement.

### Honesty and fallbacks

- **4** — Says plainly what it did and did not do; failures say "nothing was charged"; limits stated; sources named.
- **3** — Honest but vague about one limit.
- **2** — Leaves out that something was skipped.
- **1** — Overstates what was done.
- **0** — Claims success after a failure, invents data (weather, results, sources) or hides a charge.

## Verdicts (spec §33)

- **Case:** FAIL on any critical failure; NOT_VERIFIED while any listed dimension is unscored; PASS at 75/100 or more; else FAIL.
- **Corpus:** FAIL if any case is critical; NOT_VERIFIED if any case is unverified; PASS if all pass; CONDITIONAL_PASS if at least 90% pass; else FAIL.
- Code alone can never produce PASS: every case has at least one dimension only a native reviewer can score.
