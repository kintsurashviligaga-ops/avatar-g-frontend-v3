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

## GG-სთვის: მოკლე ვერსია (A–D, დაახლოებით 6 წუთი)

1. გახსენი Preview Chrome-ში და შედი Google-ით როგორც **kintsurashviligaga@gmail.com**.
2. **A.** ჩატში გაგზავნე: `ამოიღე MP3 ამ ვიდეოდან: https://raw.githubusercontent.com/mdn/shared-assets/main/videos/flower.mp4`
   → დააჭირე **Start** → როცა MP3 გამოჩნდება, დააჭირე **Save to Library**.
3. **B.** გაგზავნე: `ამოიღე MP3: https://www.youtube.com/watch?v=dQw4w9WgXcQ` → ბარათი უნდა ამბობდეს, რომ ეს პლატფორმა არ იკითხება, და გთავაზობდეს Upload-ს. არაფერს აჭერ.
4. **D.** ისევ გაგზავნე A-ს შეტყობინება → **Start** → მაშინვე **Stop**.
5. **C.** იმავე ტაბში გახსენი `<Preview>/api/tasks` და გადაუღე ფოტო.
6. Master Task-ში დაწერე: **„A–D მზადაა“**. დანარჩენს (ჯობები, აუდიტი, ფაილი, ბიბლიოთეკა) მე ვამოწმებ ბაზიდან, მხოლოდ წაკითხვით.
7. ამის შემდეგ გამოგიგზავნი ერთი ჯობის id-ს: გახსენი private window, შედი როგორც **myavatar.ge@gmail.com** და გახსენი
   `<Preview>/api/tasks?id=<id>`. უნდა აჩვენოს `not_found`. ფოტო გადაუღე.

E და F (worker-ის „სიკვდილი“ და retry) უკვე დამტკიცებულია იზოლირებულ ბაზაზე (ქვემოთ). საერთო ბაზაზე მათ არ ვუშვებ,
სანამ ცალკე არ დაწერ „E/F გაუშვი“.

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

## E and F: proven in isolation (2026-10-10); on the shared database only on GG's word

Since GG's 04:59Z 2026-10-10 rule ("E/F not on Production's shared data without isolation and my consent"), E and F ran
against a throwaway local Postgres 16 with the Production shape of `generation_jobs`, `credit_ledger`, `profiles` and the
real `deduct_credits` / `refund_credits` bodies (read from Production with SELECT only), behind a real PostgREST:
`scripts/lease-isolation/run.sh` → `lib/agent/media/leaseIsolation.pg.test.ts`, **7/7 passed**. Every write goes through
the live code (`supabaseLeaseStore`, `lib/orchestrator/ledger`, the live montage billing); only the render, the probe,
the clock and the heartbeat timer are the test's.

- **E (montage):** a worker dies mid-render; while its lease runs the sweep leaves the row alone; once it lapses the
  sweep takes it over as attempt 2 and delivers; the dead worker wakes late and every write it tries is fenced off
  (`lost`); one debit, no refund.
- **E (URL-to-Audio):** a dead extraction is retried once and delivered (attempt 2).
- **F:** two deaths → the sweep fails the row with "the render stopped twice…", refunds the charge once, and a second
  sweep pays nothing more; a late claim answers `final`. The same for the audio lane (nothing charged, nothing owed).
- **Races:** eight workers claim one queued job at once through PostgREST: exactly one gets it.

Running E/F on the Preview as well would change one row of GG's own test job in the shared database (the lease end moved
into the past). It adds only "Vercel's runtime does the same", so it stays optional and runs only if GG writes
"E/F გაუშვი" at that moment. The steps, if wanted:

1. Attach `clip-a.mp4`, `clip-b.mp4` and `click-120bpm.mp3` (in `/mnt/project-files/reports/preview-test-media/`), send
   `დაამონტაჟე მუსიკაზე`, press Start, keep the chat open, write "E დაწყებულია".
2. Claude moves that one row's `params._exec.leaseUntil` into the past (version + 1). Expected: attempt 2 delivers in the
   same card. F: the same twice, then `failed`, nothing owed.

## G. Refund: proven in isolation against the real ledger functions

Both Agent G lanes cost 0 credits, so a Preview run can only show "0 charged, 0 owed". The isolated run above charges
real credits through `deduct_credits` and shows: a failed render pays back exactly what was debited, once; a debt left
on a row when the refund call failed is paid by the next sweep, once; an owner's Stop pays back once; a charge whose
request died before it lifted the billing hold is failed after `HOLD_MS` and paid back. The balance ends where it began
in every case. A live refund on Production still needs a priced lane (the owner's pricing decision).

## Claude's checks after "A–D მზადაა" (read-only SQL, Production project)

```sql
-- A and D: the two MP3 jobs since the run started (attempt, status, error)
select id, status, params->'_exec'->>'attempt' as attempt, left(coalesce(error,''),60) as error,
       result->>'audioUrl' is not null as has_mp3, signed_url is null as not_in_library_yet, created_at
from generation_jobs where params->'_exec'->>'kind' = 'agent-audio-extract' and created_at > now() - interval '2 hours'
order by created_at;
-- the audit trail of one job: quote → run → delivered (A), or → cancelled (D)
select props->>'phase' as phase, props->>'outcome' as outcome, props->>'detail' as detail, created_at
from analytics_events where event_name = 'audit.agent_g.media' and props->>'jobId' = '<job id>' order by created_at;
-- Save to Library filed the MP3 once
select count(*) from generation_jobs where params->>'source' = 'manual-save' and created_at > now() - interval '2 hours';
-- nothing charged
select count(*) from credit_ledger where created_at > now() - interval '2 hours' and metadata->>'ref' like 'agent-%';
```

The MP3 itself is probed with ffprobe from its signed link (codec mp3, length within a second of the source's).

## Afterwards

Claude records each step as PROVEN or FAILED with job ids and times in PROJECT_MASTER (AG-8, AU-8, EF-7, EF-9) and in
the certification, and stores the screenshots under `/mnt/project-files/reports/`. A FAILED step becomes a fix on the cert
branch, then the step runs again.
