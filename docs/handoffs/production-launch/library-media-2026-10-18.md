# Library „Unable to play media" (2026-10-18)

GG's UI/UX plan named it critical. Root cause found and fixed in code; not yet proven on Production (needs a deploy).

## What was wrong

| Check | Result |
|---|---|
| Probe of the demo Library (anonymous, from GG's Mac, 2026-10-18) | Every film under `uploads/remix/*`, `uploads/films/overlay-*` answered **400 `InvalidJWT` "exp" claim timestamp check failed**; images and music answered 206; one external `tempfile.aiquickdraw.com` image answered 404 |
| Why only those | `GET /api/studio/library` re-signs a stored link only when `mayResign(row)` holds. A manual save filed before the save route probed the object (`params.source = 'manual-save'` without `params.storage_verified`) never qualified, so its signed link kept its original token and expired |
| Not the cause | CORS (images from the same bucket played), codec (the files were never served) |

## The fix

- `lib/orchestrator/storage-adapter.ts` `provenOwnSignedLink(url)`: true only when the link is OUR storage's signed URL for a library bucket, its token's `url` claim names exactly that object, and storage answers 200/206 (still valid) or 400 InvalidJWT with the `exp` failure (expired, so the signature was checked first). A forged or repointed token is refused by storage as InvalidSignature and stays unproven.
- `app/api/studio/library/route.ts`: up to 60 such legacy rows per page are proven, re-signed, and marked `storage_verified` so the proof runs once.
- `components/library/MediaUnavailable.tsx`: a tile whose file still fails (an external host that deleted it) shows „ფაილი ვერ ჩაიტვირთა." and „თავიდან ცდა" (fresh links) instead of the browser's error, in `/library` and the studio's Library grid. `/library` refetches once by itself first.

## Proof so far

CI: jest suites for the route, the adapter and both galleries (the two route tests fail on the old code). Production: NOT RUN; after the deploy, re-probe the demo Library: every `uploads/*.mp4` should answer 206.
