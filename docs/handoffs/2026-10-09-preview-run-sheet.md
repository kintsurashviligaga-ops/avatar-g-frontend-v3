# Preview run sheet: Agent G montage, URL-to-Audio and the Task API (2026-10-09, finalization item 3)

**What it proves.** The parts of AG-8, AU-8 and EF-7/EF-9 that unit tests and mocked browser tests cannot: the real
Preview, a real admin session, the real database, real FFmpeg on Vercel. Already PROVEN on this Preview and not repeated:
a montage Stop (job 2bb56123, 16:49Z) and a full montage delivered (job cf55ed33, 16:58:24Z), both 0 credits.

**Where.** The cert-branch Preview, once the build of the latest commit on `claude/launch-certification-wmvitt` is Ready:
<https://avatar-g-frontend-v3-git-ef1fad-kintsurashviligaga-ops-projects.vercel.app>

**Who does what.** GG presses (Claude never signs in to Production auth, and this Preview uses the Production project).
Claude then reads the job rows, the audit rows and the files, and records the result here and in PROJECT_MASTER.
Every Agent G job is free (the owner's choice), so nothing here spends credits. Steps E and F change one row of GG's own
test job in the shared database, so Claude does them only on GG's word at that moment.

## Before you start

1. Open the Preview link above in Chrome.
2. Sign in with Google as **kintsurashviligaga@gmail.com** (the admin address; the Google picker's default is the
   other account). The Agent G cards appear only for an admin on this Preview.

## A. URL-to-Audio, a licensed file (AU-8), about 2 minutes

1. In the chat, send:
   `ამოიღე MP3 ამ ვიდეოდან: https://raw.githubusercontent.com/mdn/shared-assets/main/videos/flower.mp4`
2. Expected: Agent G's card shows the plan (source, length, rights, **0 credits**) and a Start button. Nothing runs yet.
3. Press **Start** once. Expected: the card's steps tick through to a player with the MP3, Download and Save to Library.
4. Press Download and Save to Library. Take one screenshot of the finished card.
5. Write "MP3 მზადაა" in the Master Task thread.

Claude checks: the row is `completed` with `_exec.attempt = 1`; audit rows quote → run → delivered; the MP3 probes as MP3
with the source's length; the Library lists it once.

## B. A blocked platform (no bypass), about 1 minute

1. Send: `ამოიღე MP3: https://www.youtube.com/watch?v=dQw4w9WgXcQ`
2. Expected: the card says this platform cannot be fetched and offers **Upload**. No request leaves for YouTube.
3. Optional: tap Upload, pick any short video of your own, press Start. Expected: plan "rights: yours", then an MP3.

## C. The Task API and its owner check (EF-7), about 2 minutes

1. In the same signed-in tab, open `<Preview>/api/tasks`. Expected: JSON with your newest jobs, the MP3 from A on top
   (`"status":"completed"`). Screenshot.
2. Claude replies with that job's id. Open a **private window**, sign in as **myavatar.ge@gmail.com** (not admin) and
   open `<Preview>/api/tasks?id=<that id>`. Expected: `not_found` (404). Another person's job is invisible.

## D. Stop through the Task API on an MP3 job, about 1 minute

1. Send the message from A again and press Start, then press **Stop** on the card while it is still running.
2. Expected: the card says stopped; nothing is delivered.

Claude checks: the row is `failed` "cancelled by the user", the stop came through `POST /api/tasks`, no delivery audit,
0 credits.

## E. Recovery after a lost worker, with one retry (EF-3/EF-9), about 3 minutes

1. Attach 2–3 short clips and one song, send `დაამონტაჟე მუსიკაზე`, press Start, and keep the chat open.
2. Write "E დაწყებულია" in the thread. **On your word**, Claude moves that one row's lease into the past (one update of
   `params._exec` on your own test job: lease end in the past, version + 1). That is what a crashed worker looks like.
3. Expected: the running worker notices at its next heartbeat (≤ 15 s) and stops; the card's next status read through
   `/api/tasks` starts a new worker (attempt 2), and the master is delivered in the same card.

Claude checks: `_exec.attempt = 2`, an audit row `lost` ("lease taken over") followed by a delivery, the MP4 probes.

## F. Retries run out, about 3 minutes

1. Start a second montage as in E.
2. On your word, Claude lapses the lease twice (once per attempt).
3. Expected: after the second lapse the job ends `failed` (attempts exhausted); the card says it failed; nothing is
   delivered and nothing is owed.

## G. Refund

Both Agent G lanes cost 0 credits, so a Preview run can only show "0 charged, 0 owed". The refund path itself (a failing
write records the debt, the next reader pays it back, never twice) is covered by `jobLease.test.ts`,
`montageWorker.test.ts` and `audioWorker.test.ts` against the ledger's `refundDebitByRef`. Proving a real refund live
needs a priced lane, which is the owner's pricing decision.

## Afterwards

Claude records each step as PROVEN or FAILED with job ids and times in PROJECT_MASTER (AG-8, AU-8, EF-7, EF-9) and in
the certification, and stores the screenshots under `/mnt/project-files/reports/`. A FAILED step becomes a fix on the cert
branch, then the step runs again.
