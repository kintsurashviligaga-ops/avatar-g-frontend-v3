# Video Core v1.0: financial integrity report

Status 2026-10-15, branch `claude/video-core-v1-6gh97e`, draft PR #69 (head 979141f6 for code; later commits are
documents). Brief: GG 2026-10-13 17:34Z, Phases 1 and 4. Nothing here was run with real money; the one paid Production
test (Phase 5) is recorded in `VIDEO_CORE_PAID_E2E_EVIDENCE.md`.

Labels: **VERIFIED FACT** (run or read, with the evidence named) · **INFERENCE** (read from code or docs, not run) ·
**NOT TESTED** · **BLOCKED** · **OWNER ACTION REQUIRED**. Tiers: T1 = unit test with mocks, PG = real Postgres 16 +
PostgREST (`scripts/lease-isolation/run.sh`, CI job "billing on real Postgres"), T6 = Production.

## მოკლედ

1. ფილმი იჭრება **ერთხელ**, დაწყებისას, Quote-ის ფასით, ref `filmpay:<token>`-ით. ეს ჩანაწერი ledger-შია, ანუ მუდმივია.
2. აწყობა (stitch) ამ ფასშია. ადრე ამის დადასტურება მხოლოდ Redis-ში ინახებოდა (დეფექტი 44, ორმაგი ჩამოჭრის რისკი).
   ახლა: ledger + ცხრილი `film_billing` (მიგრაცია 20261014a). Redis მხოლოდ cache-ია; გაურკვევლობისას სისტემა ჩერდება და
   არაფერს ჭრის.
3. ერთი დაჭერა = მაქსიმუმ ერთი ჩამოჭრა: 20 პარალელური დაჭერიდან მხოლოდ ერთი იწყებს ფილმს (რეალური Postgres).
4. რასაც სერვერი ვერ მიაწოდა, ბრუნდება ზუსტად ერთხელ. Owner-ის არჩევანით (R3-A) ახლა ბრუნდება სცენაც, რომელიც Google-მა
   მიიღო და მერე ჩააგდო, მხოლოდ Google-ის საკუთარი პასუხით.
5. ფასები უცვლელია (`lib/credits/videoPricing.ts`). ადმინს კოდი არასოდეს ჭრის.
6. 2026-10-15-დან ეს Production-შია: მიგრაცია 20261014a (~11:32Z) და PR #69 (b46bb44, ~12:00Z). ადმინის ერთმა ფასიანმა
   ტესტმა 0 კრედიტი დახარჯა (892 → 892), როგორც კოდი ამბობს (`VIDEO_CORE_PAID_E2E_EVIDENCE.md`). ჩვეულებრივი მომხმარებლის
   ჩამოჭრა Production-ში ჯერ არ შემოწმებულა (**NOT TESTED** on Production; PG tier-ზე დამტკიცებულია).

## 1. The money path of a film (as built on PR #69)

| Step | What happens | Where | Label |
|---|---|---|---|
| Quote | `videoCredits({seconds, quality, mode})`: 25/8 credits a second on Fast, ×0.6 Lite, ×3.3 Standard, ×1.4 music video; 1 credit = 0.10 ₾. A 4 s Fast film = 13 credits | `lib/credits/videoPricing.ts`, `lib/credits/pricing.ts:50` | VERIFIED FACT (code, unchanged by this branch) |
| Free slot | a film of ≤ 8 s uses the account's one free film if it is unused (atomic `consume_free_film`), and the slot comes back if no clip dispatches | `lib/chat/filmComposite.ts:965-972` | VERIFIED FACT (T1) |
| Admin | an admin is never billed (`founderBypass`); the free slot is checked first | `lib/chat/filmComposite.ts:976` | VERIFIED FACT (code) |
| Duplicate start | one key per Generate press (`metadata.filmRequestId`, or a derived key inside a 330 s window); a replayed press returns the same film, no second charge | `lib/chat/filmBilling.ts filmStartKey`, the R2 store `request_idempotency` (Production since 2026-10-13) | VERIFIED FACT (T1 + PG: 20 parallel presses → one claimed, the rest replay) |
| Charge | one atomic debit of the quote under `filmpay:<token>` before the first provider call; a ledger that refuses or cannot answer stops the film with nothing dispatched | `filmComposite.ts:999-1011`, `lib/orchestrator/ledger.ts deductCredits` | VERIFIED FACT (T1) |
| Durable record | `record_film_billing` writes the film's kind, credits and charge ref; a paid row must match a debit in the ledger | proposal `20261014a` | VERIFIED FACT (PG) |
| Stitch | `/api/video/assemble` leases one waiver (660 s, longer than the route's 600 s), spends it only on a delivered master, hands it back otherwise; a crashed lease expires. Paid film: 2 waivers, free film: 1 | `decideFilmWaiver`, `lease_film_waiver`, `settle_film_waiver` | VERIFIED FACT (T1 + PG) |
| Fallbacks | no table (migration not applied): ledger + Redis cache as before; a film the ledger says is PAID is never billed on the cache's silence; an unreadable ledger stops with nothing charged | `lib/chat/filmBilling.ts:18-19, 222-228` | VERIFIED FACT (PG "before" phase) |
| Refunds | dispatch failure of every scene → full quote back on `:refund`; some scenes → their share on `:refund:dispatch`; R3-A → a scene Google failed after accepting it, on `:refund:scene:<n>` | `R3_REFUND_MATRIX.md` rows 3–5 | VERIFIED FACT (T1 + PG) |

## 2. Invariants and their proof

| # | Invariant | Proof | Label |
|---|---|---|---|
| I1 | one Generate press is charged at most once, whatever the retries, double clicks or lost answers | `lib/chat/filmUpfrontCharge.test.ts` (replay tests); `filmBilling.pg.test.ts` "the film START on the same database: 20 parallel presses → one claimed" | VERIFIED FACT (T1 + PG) |
| I2 | the stitch of a paid film is never charged again, also when Redis is down, flushed or on another instance (defect 44) | `filmBilling.pg.test.ts` (lifecycle, no cache, crash, expiry); `filmBillingWaiver.test.ts` | VERIFIED FACT (PG) |
| I3 | a stitch that did not deliver spends nothing; two stitches of one film cannot both use its last waiver | `filmBilling.pg.test.ts` (busy, crash, expiry recovery) | VERIFIED FACT (PG) |
| I4 | every refund has its own ref and is paid at most once; a refund never exceeds what the ref still holds | `lib/orchestrator/ledger.refundByRef.test.ts` (15); unique index `credit_ledger_user_ref_positive_uniq` | VERIFIED FACT (T1 + PG) |
| I5 | R3-A: a scene is settled once; the share is capped by the film's net debit; only Google's terminal verdict on the operation the SERVER recorded counts; another user naming the film settles nothing | `lib/chat/filmSceneRefund.pg.test.ts` 9/9 (CI run 38721595510), `filmSceneRefund.test.ts`, `filmPollSceneRefund.test.ts` | VERIFIED FACT (T1 + PG) |
| I6 | only the service role can read or change `film_billing` / `film_scenes` or call their functions; anon and signed-in users get nothing | `filmSceneRefund.pg.test.ts` (role lockout), `filmBilling.pg.test.ts`; the SQL Editor script's verify row | VERIFIED FACT (PG) |
| I7 | prices are unchanged | `git diff fef867a6..HEAD -- lib/credits/` is empty | VERIFIED FACT |
| I8 | the client-held `film:` token is never trusted for money: payment, waivers and scene operations are read server-side, keyed by the signed-in user | `lib/chat/filmSceneRefund.ts` header, `filmComposite.ts:1462-1482` | VERIFIED FACT (code + T1) |

CI on 979141f6, job "billing on real Postgres" (run 38721595510): `filmBilling.pg` 13/13 after the migration (plus its
"before" phase), `filmSceneRefund.pg` 9/9, the B3 checks B1–B8 ok, the lease queue, ledger and R2 suites green.

## 3. What is not covered (honest gaps)

| Gap | Effect | Label |
|---|---|---|
| A refund that fails (ledger down) is logged `REFUND FAILED … needs manual credit`, not retried | an operator credits by hand; never reported as done | VERIFIED FACT (T1); fix proposed in `R3_REFUND_MATRIX.md` §4 |
| Stop of a film while scenes render | submitted scenes keep rendering at Google, nothing new is dispatched, no refund | INFERENCE; NOT TESTED as a money path |
| Google's bill for a failed operation | assumed $0 (Google bills generated seconds) | INFERENCE |
| Debit on a real paid account in Production | Phase 5 runs as admin (owner's card 10:22Z "ადმინით"), so the debit is proven on real Postgres, not with money | NOT TESTED in T6 by the owner's choice |
| Films on another engine | Production is Google-only for films; other engines are not recorded for R3-A | VERIFIED FACT (code) |
| Every signed-in user can start a Veo film in Production today | after the Vertex switch their clips bill the Google Cloud project; since PR #71 (2026-10-15) every Veo submit is refused once the day's reserved spend would pass `VEO_DAILY_LIMIT_USD` ($10 in Production, `lib/veo/dailyCap.ts`); the budgets still only alert | VERIFIED FACT (code: `providerRouter.ts` `refuseAnonymousGeneration` only); **OWNER ACTION REQUIRED** if this should be admin-only until the public opening |

## 4. Reconciliation (how to check the ledger after any film)

Read-only, in the Supabase SQL Editor, for one film token `f…` and its user:

```sql
select metadata->>'ref' as ref, delta, reason, created_at
  from public.credit_ledger
 where user_id = '<user>' and (metadata->>'ref' = 'filmpay:<token>' or metadata->>'ref' like 'filmpay:<token>:%')
 order by created_at;
select kind, credits, charge_ref, waivers_total, waivers_used, lease_until from public.film_billing
 where user_id = '<user>' and token_id = '<token>';
select ordinal, state, credits, refunded from public.film_scenes
 where user_id = '<user>' and token_id = '<token>' order by ordinal;
```

Expected: one negative row equal to the quote; positive rows only under `:refund`, `:refund:dispatch` or
`:refund:scene:<n>`; the sum of the positives ≤ the debit; `waivers_used ≤ waivers_total`; `refunded` > 0 only on
`state = 'refunded'`. An admin film has no debit row (founderBypass) and no `film_billing` row unless it used the free slot.

## 5. Owner actions

* **OWNER ACTION REQUIRED:** migration 20261014a in Production (the SQL Editor script with its preflight and verify row
  is prepared; GG presses Run).
* **OWNER ACTION REQUIRED:** merge of PR #69 and its Production deploy.
* Open, unchanged: whether films stay open to every signed-in user until the public opening (§3, last row).
