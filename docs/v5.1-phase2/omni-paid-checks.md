# Omni 1.2: the three paid checks (v5.1 M-3, GG D-07)

These checks are owed before M-3 (#295, Omni 1.1 → 1.2, already in production) is called done. The budget is about $2 (D-07); one full run costs at most ✦70, about $1.04.

| | What | Expected | Price |
|---|---|---|---|
| C1 | A new clip with a Georgian line, 4 s, 720p | Made on `gemini-omni-1.2-flash` (`m2` in its id), the line spoken in Georgian | ✦20 |
| C2 | „გააგრძელე" on C1's clip, +4 s | Continued on 1.2 | ✦25 |
| C3 | „გააგრძელე" on a clip made before #295 (1.1), +4 s | Continued on 1.1, or, once Google has dropped the interaction (Vertex keeps it 7 days), a failure with the credits refunded | ✦25, or ✦0 if refunded |

**Needs Supabase.** Every step reads the wallet and writes the ledger, so nothing runs while the database is down. A dry run (step 3) shows that at once.

**Time limit for C3.** No 1.1 clip has been made since #295 went live (2026-11-12 ~21:16Z), and Google keeps an interaction for 7 days. So every 1.1 clip expires by **2026-11-19 ~21:16Z** at the latest. After that, C3 can only show the refunded-failure path. To see a real 1.1 continuation after that date, we would need a short `VERTEX_OMNI_MODEL=gemini-omni-1.1-flash-preview` rollback in production to make a new 1.1 clip. That is a production change and waits for GG.

## Where it runs

It runs on GG's Mac, against myavatar.ge, signed in as GG. It cannot run from localhost, because localhost cannot reach Vertex (Workload Identity allows only Preview and Production). It cannot run from a Preview either, because Previews refuse paid work. The script uses only Node's built-in `fetch`, so no `npm install` is needed (Node 18 or newer).

The script talks to the same routes the app uses (`/api/video/clip`, `/api/video/omni-edit`, `/api/genjutsu/status`). So the price check, the debit, the refund and the Library filing are the real ones.

## Steps

1. **Get the script.** In your probe clone:
   ```sh
   git fetch --depth 1 origin claude/omni-paid-checks && git reset --hard FETCH_HEAD
   ```
   Once this PR is merged, use `main` instead.

2. **Find a 1.1 clip for C3.** In the Supabase SQL editor for zwksnayknzggdcenqqxy, run the query below. It is read-only and lists your newest Omni clips made before 1.2:
   ```sql
   select m.created_at,
          jsonb_path_query_first(m.metadata, '$.**.omniJob') #>> '{}' as omni_job
   from public.chat_messages m
   join auth.users u on u.id = m.user_id
   where u.email = '<your sign-in email>'
     and jsonb_path_exists(m.metadata, '$.**.omniJob')
     and (jsonb_path_query_first(m.metadata, '$.**.omniJob') #>> '{}') !~ 'm2(~|$)'
     and m.created_at > now() - interval '7 days'
   order by m.created_at desc
   limit 5;
   ```
   Copy the `omni_job` of the newest row. It is your own signed id, and the route checks that it belongs to you. If the query returns no rows, run without C3 (`--skip-c3`) and tell me.

3. **Sign in for the script, without saving anything.**
   - Open myavatar.ge, signed in.
   - Open DevTools → Network, click any `/api/...` request, and under Request Headers copy the whole `cookie` value.
   - In Terminal:
     ```sh
     read -s MYAVATAR_COOKIE && export MYAVATAR_COOKIE    # paste, then Enter; nothing is shown or kept in history
     ```

4. **Dry run (free).**
   ```sh
   node scripts/omni-checks/run.mjs --from11 '<omni_job from step 2>'
   ```
   It asks each route for its price by sending `expectedCredits: 0`, which the route refuses with the real price before reserving anything. It makes nothing. You should see `C1 … quotes ✦20` and `C3 … quotes ✦25`. If a route answers 503, Supabase or the ledger is still down. If a price is not the price book row, the script stops.

5. **Paid run.**
   ```sh
   node scripts/omni-checks/run.mjs --go --from11 '<omni_job from step 2>'
   ```
   Before each paid step, the script re-checks the price and the ✦70 cap. It then polls every 10 s (up to 6 minutes a clip) and prints PASS or FAIL for each check. It also prints the balance before and after, and whether the difference matches the run. A copy of the result, with no cookie, signed link or charge token, goes to `omni-checks-out/`.

6. **Listen to the clips** in the Library: two from C1 and C2, and C3's if it continued. Check that the Georgian line is spoken once, in the character's own voice, with no narrator and no music. Then send me the printed result, or the saved file.

7. **Clean up:** `unset MYAVATAR_COOKIE`, and close the DevTools tab.

## What each verdict means

- **PASS ready:** a clip came back on the expected model and op, at the price book's price.
- **PASS failed_refunded (C3 only):** Google refused to continue an old 1.1 interaction, and the credits came back. This is the honest path for clips older than 7 days.
- **FAIL:** something else happened: the wrong model, a different price, a failure without a refund, or no answer within 6 minutes. The line under it says which, and `job:` gives the clip's id so it can be found in the Library.
- **FAIL unknown:** the start request got no answer (network or a 90 s timeout). The clip may be running and charged. The script stops at once and does not send it again. Look in the Library and at the balance before you run anything again.
- **no final state (signed_out):** the sign-in expired while waiting. The clip keeps going on the server; check the Library, then sign in again before the next run.

If the script stops half way (a later price differs, or a start got no answer), it still saves the result file with what was already paid for, its job id and the reason it stopped (`stoppedBecause`).

## Safety

- The sign-in is read only from the environment. It is sent only to `--base` (myavatar.ge or a vercel.app deployment), and is never printed or written.
- The script never sends a price it did not get from the route. It never sends `--go` steps past ✦70, and stops on the first price that differs from the approved row.
- The route's own guards still apply: one start at a time, the daily slot, the rate limit, the balance check, and a refund on any failed render.
