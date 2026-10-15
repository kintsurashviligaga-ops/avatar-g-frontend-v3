# Storyboard revisions — §5 (Video Core v1.0)

**ქართულად, მოკლედ.** სტორიბორდის ყოველი რეალური ცვლილება (წარწერა, კადრის თავიდან დაგენერირება, გადაწყობა, სცენის დამატება/წაშლა, ბაზის სურათი, სრული რეგენერაცია) არის **რევიზია** ნომრით და თითის ანაბეჭდით (fingerprint). „ვიდეოს გენერაცია“ ამტკიცებს კონკრეტულ რევიზიას; რენდერი, რომლის დაფა დამტკიცების შემდეგ შეიცვალა, უარყოფადია და არა ჩუმად სხვა ფილმი. ამ ეტაპზე მზადაა **სუფთა მოდული + ტესტები**; ბაზის ცხრილები მხოლოდ **წინადადებაა** (migration არ არის და არ გაშვებულა — §11).

## What exists on this branch (claude/video-core-v1-6gh97e)

| Piece | State | Evidence |
| --- | --- | --- |
| `lib/video/storyboard/revision.ts` — `snapshotRevision`, `fingerprintBoard`, `approveRevision`, `approvalMatches`, `diffRevisions` (pure, browser-safe) | PROVEN (unit) | `lib/video/storyboard/revision.test.ts` — 17 tests, T2 |
| The storyboard flow no longer renders on a miss: plan miss / thrown plan call → the chat's error card with **Retry** (plans the storyboard again) and **Dismiss**; a user Cancel stays silent | BUILT, pinned | `components/studio/create/videoCoreWiring.test.ts` §5 (source pins on `createStoryboard`) |
| Per-scene frame failure → "no frame" tile with Re-roll (pre-existing) | PROVEN before | unchanged |
| Revision numbering wired into the studio's board mutations (`setStoryboard` sites) | MISSING (deferred) | the module is called by nothing yet |
| Approval fingerprint sent with the render and checked by the route | MISSING (deferred) | needs the tables below or a signed approval token |
| Tables `storyboard_revisions`, `storyboard_approvals` | PROPOSAL, NOT APPLIED (revised 2026-10-15, see below) | `proposals/20261012a_storyboard_revisions.sql`; real Postgres B1–B8 in `scripts/lease-isolation/b3-storyboard-revisions.check.sql` |

## What the fingerprint is of

The canonical board = `{ seed, clipSec, scenes: [[ordinal, beat, prompt, frameUrl, edited, anchored]…] sorted by ordinal, scripts }`,
hashed with two FNV-1a 32-bit passes → 16 hex characters. Not in it: React keys (`uid`), the `pending` list, per-scene base
images, frame prompts. A frame that is still `null` and one that landed are different boards (the user sees different things).

## Activation plan (needs GG's separate word — §11; Preview shares the Production project)

1. Review `proposals/20261012a_storyboard_revisions.sql`; apply it as a migration on GG's word (service_role writer only, owner read only).
2. Studio: mint a `boardId` per `createStoryboard`; wrap the board mutations so each produces `snapshotRevision(board, origin, prev)`;
   POST the revision to a new `/api/film/storyboard/revision` route that recomputes the fingerprint server-side and inserts the row.
3. "Generate Video": `approveRevision(current)` → the render body carries `{ boardId, revision, fingerprint }` next to the scenes.
4. Render route: recompute `fingerprintBoard` from the scenes it was sent; `approvalMatches` false → 409 `storyboard_changed`
   before any charge (the same place the duration contract is checked: before `lockTokens`).
5. Report: the film's manifest/log names `boardId@revision fingerprint`.

## Rollback

Drop the two tables (the SQL's footer). The client works without them exactly as today: the board lives in component state.

## Not done on purpose

- No automatic render, no automatic charge, no silent fallback anywhere in the storyboard flow (§5).
- No migration file under `supabase/migrations/` (§11).

## Phase 3 preflight (Video Core final hardening, 2026-10-15)

**ქართულად.** ცხრილს დღეს არც ერთი კოდი არ წერს და არ კითხულობს: დამტკიცება (revision + fingerprint) უკვე კოდის დონეზე
მოწმდება (`lib/video/contracts.ts:118`, `app/api/chat/orchestrate/storyboardApproval.test.ts`). წინადადებაში 3 ხარვეზი
ვიპოვე და გავასწორე; ახლა რეალურ Postgres-ზე ყველა შემოწმება გადის. რეკომენდაცია: **ჯერ არ გავუშვათ Production-ში** —
ცხრილს მნიშვნელობა მხოლოდ მისი ჩამწერი კოდის (§ Activation plan 2–4) გამოჩენისას ექნება; მანამდე ის მხოლოდ ცარიელი ზედაპირია.

| Check | Result | Evidence |
| --- | --- | --- |
| Name collision in Production | none: neither table is in Production's `public` schema (snapshot 2026-10-09 + 20261013a) | `__tests__/schema-drift.snapshot.json`; re-check `select to_regclass('public.storyboard_revisions'), to_regclass('public.storyboard_approvals')` in the same SQL Editor session right before any apply |
| Consumers | **none** (no `.from('storyboard_*')` anywhere; the schema-drift ratchet would list one) | `grep -rn storyboard_revisions lib app components` |
| Defect 1 — `unique (board_id, revision)` across users with a client-minted `board_id` | another user reusing a board id blocked the owner's next revision (`duplicate key … storyboard_revisions_board_id_revision_key`) | old file on real PG16: fails B2 |
| Defect 2 — approval FK on `(board_id, revision)` only | an approval under user 2 naming user 1's revision was stored; an approval could carry another revision's fingerprint | old file: fails B3 (B4 by construction) |
| Defect 3 — `parent_revision` unchecked | a revision naming a parent that never existed was stored | old file: fails B1 |
| Fixed file | B1–B8 pass, applied twice (re-runnable), rolled back with its footer, re-applied, passed again | `scripts/lease-isolation/run.sh` (CI: `video-core-e2e-local.yml`) |
| Locks / data | additive only: `create table` on two new names takes no lock on any existing table; nothing existing is altered or read | the SQL |
| Backup / recovery | not needed for rollback (drop the two empty tables); a backup check stays a precondition of any apply | §Rollback |

Recommendation (one): keep `20261012a` unapplied until the write path (Activation plan 2–4) is built and reviewed; then apply
both in one release on the owner's word. Cost of waiting: none — the approval check already runs in code.
