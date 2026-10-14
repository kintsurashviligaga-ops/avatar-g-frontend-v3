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
| Tables `storyboard_revisions`, `storyboard_approvals` | PROPOSAL, NOT APPLIED | `proposals/20261012a_storyboard_revisions.sql` |

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
