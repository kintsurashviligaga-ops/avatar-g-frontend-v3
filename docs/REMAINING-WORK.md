# Remaining work — as of 2026-08-07

Written after a two-day sweep that shipped 49 commits and 2,510 green tests. Everything below is **not
started**, and each entry says why it was left rather than done — a reason is more useful than a ticket.

---

## Blocked on the owner, not on code

| | Blocks |
|---|---|
| **Vercel billing** — every route returns `402 DEPLOYMENT_DISABLED` | THE WHOLE PRODUCT. None of the 49 commits are reachable by a user. |
| **Google AI prepayment** — Veo returns `429 RESOURCE_EXHAUSTED` | All video generation. The agent queue's paid `drain` path cannot be proven end to end until this clears. |
| **`SUPABASE_ACCESS_TOKEN`** — expired; no `exec_sql` RPC | Every migration must be pasted into the SQL editor by hand. `/api/admin/run-migration` documents a "turnkey curl" that answers `management_api: 401 \| exec_sql_rpc: 404`. |

---

## 1. Film async-failure refund

A clip that QUEUES and then dies at the provider is still charged. The in-request cases are fixed
(partial-failure rollback, and a dispatch that returns an id while reporting failure is no longer filed as
`queued`).

⚠️ **Do not "just add a refundCredits call" on the poll path.** `film:` is an unsigned, client-held token
and a transient 429 reads as `failed`, so a token-driven refund lets anyone mint credits. It needs a
server-authoritative per-clip charge record (`film_clip_charges` + a `refund_film_clip` RPC gate) — which
means a migration, which means the DDL blocker above.

## 2. The 14 quarantined E2E specs

`tests/{dashboard-contracts,dashboard-deep-flows,film-studio-nav,smoke,voice,voice-v2v-smoke}.spec.ts` are
marked `fixme`. They assert a UI that no longer exists — a "Service hub" button (the picker moved into the
chat-input popup), a hardcoded greeting with the owner's name, and `"One Window Dashboard"`, a string that
appears **zero** times in the source.

They had been red for a long time, and that is not a footnote: a genuinely broken delete shipped and hid
among them, caught only once a NEW spec ran green beside them. Rewrite against the current dashboard.

## 3. The 19 quarantined UI primitives

`components/ui/deadPrimitives.test.ts` holds a shrink-only list. Fifteen files were deleted; what remains
is `Skeleton.tsx`'s two unused exports and the rest of the quarantine. **Wiring one in or deleting it is a
product decision, not a cleanup** — a Skeleton for a page not yet written is the one case where "not used
yet" is plausible rather than an excuse.

## 4. Visual audit with real data

A local pass found and fixed a Georgian heading that wrapped to two lines, and disproved a "clipped
sidebar" that was a screenshot artifact. The rest needs the live site: real balances, real library
contents, a signed-in session. Empty local screens hide exactly the layout problems worth finding.

⚠️ Measure, do not eyeball. Both of today's layout conclusions were wrong until measured in the browser.

## 5. Admin panel — the remaining audit findings

The auth gate is done (four routes moved to the imported allowlist; a guard walks every `route.ts` under
`app/api/admin`). Outstanding from the same audit: figures that silently render `0` when their query
errors, and panels with no loading/empty state. An admin acting on a wrong number is worse than one seeing
an error.

---

## The rule that earned its keep

**Run it. Read the row back. Prove the guard fails without the fix.** On 2026-08-06/07 that caught, among
others: a payout approvable by its own payee, three admin endpoints that had 403'd real admins since they
were written, three tables the code had always assumed existed, and a chat delete whose every unit was
correct in isolation. Reading the code found none of them.
