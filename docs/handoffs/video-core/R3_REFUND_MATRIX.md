# Video Core v1.0 final hardening — Phase 4: R3, what a film's credits do in every outcome

Status 2026-10-15: review of the code on `claude/video-core-v1-6gh97e` (PR #69 head). No price was changed. **One refund
rule was added on the owner's word (decision card 10:16:26Z, "კი, დაუბრუნე"): R3-A, §3 and §5.** Everything else is as it
was. Labels: PROVEN T1 = unit test, PROVEN PG = real Postgres 16 (`scripts/lease-isolation/run.sh`), INFERENCE = read
from code or Google's docs, not run. Nothing here was run with real money.

## მოკლედ

1. ფილმი ერთხელ, წინასწარ, Quote-ის ფასით იჭრება (`filmpay:<token>`); აწყობა (stitch) ამ ფასშია (2 უფასო ცდა).
2. რასაც სერვერი თავად ამტკიცებს, რომ ვერ მიაწოდა, ბრუნდება ზუსტად ერთხელ: ყველა სცენა dispatch-ზე უარყოფილი → სრული თანხა;
   ნაწილი → იმ სცენების წილი.
3. აწყობის ან QC-ის ჩავარდნა: კლიპების ფასი რჩება (Google-მა ისინი უკვე დაარენდერა და გადაახდევინა), აწყობის თავიდან ცდა უფასოა.
   **ეს პოლიტიკა არ შემიცვლია.**
4. **ხარვეზი (R3), დახურულია კოდში (R3-A):** სცენა, რომელიც Google-მა მიიღო და მერე ჩააგდო (safety, შეცდომა), ადრე არ
   ბრუნდებოდა. Owner-მა აირჩია „კი, დაუბრუნე“ (2026-10-15 10:16Z). ახლა სერვერი Google-ს თავად ეკითხება იმ ოპერაციაზე,
   რომელიც ფილმის დაწყებისას ჩაიწერა, და სცენის წილს ერთხელ აბრუნებს. Production-ში ჯერ არ არის (მიგრაცია 20261014a +
   PR #69-ის deploy).
5. ფასები არ იცვლება. Google ჩავარდნილ ოპერაციაზე, სავარაუდოდ, არაფერს გვახდევინებს (INFERENCE).

## 1. The matrix

| # | Outcome | What the user is charged | What happens to it | Google's bill | Evidence | State |
|---|---|---|---|---|---|---|
| 1 | **Delivered** (every scene, stitched, QC passed) | the film's quote, once, before the first provider call, on `filmpay:<token>` | kept; the stitch is covered (paid film: 2 stitch waivers, one spent) | every scene | `lib/chat/filmUpfrontCharge.test.ts:134,160`; `lib/chat/filmBilling.pg.test.ts` (lifecycle) | PROVEN T1 + PG |
| 2 | Balance below the quote / the ledger refuses the debit | nothing | nothing dispatched; the start key is released | nothing | `filmUpfrontCharge.test.ts:169,179,363,373` | PROVEN T1 |
| 3 | **Provider failure at dispatch, every scene** | the quote | refunded in full, once, `filmpay:<token>:refund`; a free slot is handed back; the start key is released | nothing (no job exists) | `filmUpfrontCharge.test.ts:205,259,380` | PROVEN T1 |
| 4 | **Partial at dispatch** (some scenes refused) | the quote | each refused scene's share (`floor(quote / scenes)`) refunded once, `filmpay:<token>:refund:dispatch`; the film continues on the rest; the durable record holds the net | the accepted scenes | `filmUpfrontCharge.test.ts:215`; PG: "partial refund net 26" | PROVEN T1 + PG |
| 5 | **Provider failure after dispatch** (a scene Google accepted, then failed: safety refusal, error, a finished operation with no video) | the quote | **R3-A (§5):** that scene's share comes back once, on `:refund:scene:<n>`, when the server's own check of the operation it recorded finds Google's terminal failure. The studio still stitches the survivors (≥ 2) or the film fails. Before: not refunded | INFERENCE: a failed operation produces no video and is not billed (Google bills per generated second) | `lib/chat/filmSceneRefund.test.ts`, `lib/chat/filmPollSceneRefund.test.ts`, `filmUpfrontCharge.test.ts` (R3-A), `lib/chat/filmSceneRefund.pg.test.ts` | **BUILT** on the owner's word (10:16Z); PROVEN T1 + PG; in Production since b46bb44 (PR #69), not yet seen live |
| 6 | **Render (stitch) failure** (ffmpeg, upload, dispatch) | the quote (no extra charge) | the stitch waiver is handed back (`settleWaiver(false)`), the saga compensates once; the clips stay paid; a retry is free while a waiver is left | every rendered scene | `lib/orchestrator/assembleQcGate.test.ts:104,194,206`; `lib/chat/filmBillingWaiver.test.ts:20` | PROVEN T1 |
| 7 | **QC failure** (frames, duration, fps, resolution, audio) | the quote | as 6: nothing hosted, film recorded FAILED, waiver back, compensated once, retry free | every rendered scene | `assembleQcGate.test.ts:56,91,120,128,175` | PROVEN T1 |
| 8 | **Timeout / crash** of a stitch | the quote | the waiver lease (660 s > the route's 600 s) lapses and the waiver comes back; a twin during a live stitch gets 409 | every rendered scene | `filmBilling.pg.test.ts` (failed / crash / expiry recovery; lease 660 s) | PROVEN PG |
| 9 | **User cancel** (Stop in the studio) | the quote | scenes already submitted keep rendering at Google; nothing new is dispatched; no refund. Long-form: a cancel refunds the charged, undelivered scenes and keeps the delivered ones | the submitted scenes | film: INFERENCE (`lib/chat/filmStudioClient.ts` abort); long-form `app/api/video/longform/e2e.test.ts:157` | film NOT TESTED as a money path; long-form PROVEN T1 |
| 10 | **Retry** | start: a lost answer or a double press replays the same film, no second charge; stitch: free while a waiver is left; a new Generate press is a new film and a new charge | — | — | `filmUpfrontCharge.test.ts:281,296,314,332`; `assembleQcGate.test.ts:73` | PROVEN T1 + PG (20 parallel → 1 charge) |
| 11 | Both waivers spent, a third stitch | the quote + the third stitch at its own quote | billed as any assemble | — | `lib/chat/filmBilling.test.ts:50,103` | PROVEN T1 |
| 12 | Payment reuse (another user, another film) | their own price | billed as their own; the payer's waiver untouched | — | `filmBilling.test.ts:124,132`; PG payment reuse | PROVEN T1 + PG |
| 13 | A refund that fails (ledger down) | — | never claimed as done; logged `REFUND FAILED … needs manual credit` | — | `filmUpfrontCharge.test.ts:226` | PROVEN T1; no automatic retry (§4) |

Idempotency: every refund has its own ref (`:refund`, `:refund:dispatch`, `:refund:scene:<n>`); `refund_credits` is idempotent per ref and
`refundDebitByRef` pays back at most the net debit under the ref (`lib/orchestrator/ledger.refundByRef.test.ts`, 15 tests).
Price SSoT: `lib/credits/videoPricing.ts` (`VIDEO_CREDITS_PER_SEC = 25/8`, Fast ×1, Lite ×0.6, Standard ×3.3, music video ×1.4;
1 credit = 0.10 ₾, `lib/credits/pricing.ts:50`) — unchanged by this branch.

## 2. The policy

* What the server can prove it did not deliver is given back, once. (Unchanged.)
* What Google rendered stays paid, even when the stitch or QC fails; the stitch can be retried for free. (Unchanged.)
* An async provider failure used to stay paid, because only the browser saw it. **R3-A (owner's word 10:16Z):** the
  server now checks it itself and gives the scene's share back (§5).

## 3. One recommendation (the owner chose it: "კი, დაუბრუნე", 2026-10-15 10:16:26Z; built as §5)

**R3-A — give back a scene that Google itself failed, verified by the server.**

* At start, the server records each scene's operation name next to the film's durable payment (a new table or columns, a
  migration of its own).
* When the studio reports a dead scene, the server asks Google about **that recorded operation** (never a client-supplied
  one). Only a terminal provider failure (safety refusal, error, expired) counts; 429 / 5xx / still running do not.
* Then `floor(quote / scenes)` comes back once, on `filmpay:<token>:refund:scene:<n>`, capped by the net debit.
* Delivered scenes, failed stitches and QC failures stay exactly as in §2.

Financial impact (INFERENCE until a Google bill shows a failed operation at $0):

| Film | Quote | One failed scene gives back | Google's cost of that scene |
|---|---|---|---|
| 32 s, Fast, 4 × 8 s | 100 credits (10.00 ₾) | 25 credits (2.50 ₾) | ≈ $0 (no video generated); a delivered 8 s Fast scene with audio costs $0.80 at 720p |
| 24 s, Fast, 3 × 8 s | 75 credits (7.50 ₾) | 25 credits (2.50 ₾) | ≈ $0 |
| 32 s, Standard | 330 credits (33.00 ₾) | 82 credits (8.20 ₾) | ≈ $0 |

So the platform gives back only revenue for which it delivered nothing and paid nothing. The cost is engineering (one PR
plus one migration) and one more read of Google per reported failure.

Option kept: **leave it as it is.** No work, and a user keeps paying the full quote for a shorter film.

## 4. Smaller gaps found (no business choice, engineering only)

* Row 13: a refund that fails is only logged. The lease queue already pays a recorded refund debt on its next sweep;
  films have no such debt record. Fix: record the debt next to the durable payment and pay it on the next read.
* Row 9: a film's Stop is not tested as a money path (the long-form one is).

## 5. R3-A as built (2026-10-15)

* **Start** (`lib/chat/filmComposite.ts`): a paid film records, next to its durable payment, each QUEUED Veo scene's
  operation and its share `floor(quote / scenes)` (`film_scenes`, in proposal 20261014a). A scene dead at dispatch is not
  recorded: the dispatch refund already returned it. The shares never exceed what the film still holds (the SQL refuses).
* **Poll** (`lib/chat/providerRouter.ts` → `lib/chat/filmSceneRefund.ts`): a clip that reads `failed` is only a hint. For
  the signed-in user, the server asks Google about the operation **it recorded** (`pollVeoClip`). Only a finished
  operation that returned an error, a safety refusal or no video counts (`finished: true`, added to
  `lib/veo/vertexClient.ts finishedOperationOutcome`). Still running, 429/5xx, no config, a bad name or an unknown/expired
  operation (Gemini 404) prove nothing: the scene stays open and is asked about again on a later poll.
* **Settle** (`settle_film_scene`, one statement under the film's billing-row lock): `failed` → the share, capped by the
  film's net debit, via `refund_credits` on `filmpay:<token>:refund:scene:<n>`; rendered → kept (stays paid). Each scene
  settles once (20 parallel → 1 refund, PG). Another user naming the film settles nothing. Service role only.
* **Told to the user**: the poll says `💳 N კრედიტი დაბრუნდა…` and returns `metadata.film.creditsGivenBack`.
* **Not covered (unchanged)**: free films, scenes on another engine (Production is Google-only), a film nobody polls
  again (it settles when it is next opened), Gemini 404 (an expired operation is not proof), long-form films (their own
  per-scene refund, row 9).
* **Before 20261014a is applied**: nothing is recorded or given back, exactly as before (fail-open in the old direction).
