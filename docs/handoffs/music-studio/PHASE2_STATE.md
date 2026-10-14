# Music Studio v1 — Phase 2 state (live file; updated after each phase)

Branch `claude/music-studio-v1-20261014` · PR #65 (Draft) · worktree `/Users/giorgikintsurashvili/music-studio-wt`
(the main checkout belongs to Video Core). Final-session start head `da292939`; see PHASE2_E2E_MATRIX.md for the final SHA and run.

## DONE
- Phase 0 recovery (2026-10-14, second session): head = remote `da292939`; one untracked doc (this folder's matrix) kept; CI / Preview
  Contract / Postgres billing green on `da292939`; Music E2E run 38550746462 = 15 passed / 4 failed / 6 not run.
- Phase 2 Live Voice (`music_studio` tool, no start/confirm path) — b59a2c82. Phase 1 Playwright suite + CI workflow — 199ee7e6.
- **Defects fixed this session**
  1. *Vocal refusal copy* — the card localizes refusals by code, so a refused SONG showed the generic "This option is not verified…".
     Now a song refused as `unsupported` says why (vocals unverified), that it was not turned into an instrumental, and that nothing was
     charged — KA/EN/RU (`musicCardCopy.songRefused`). The spec additionally asserts the server's `400 unsupported` on `/quote` (no price).
  2. *KA/RU card "not found"* — not a card bug: after `goto('/ru/…')` the plan was dispatched 4 ms after `data-authed`, before OmniStudio's
     live-action listener mounted (trace: `took:false, reply:null`). Specs now wait for a read-only `status` probe to be taken.
  3. *Reload recovery* — OmniStudio deliberately opens every reload on a FRESH empty chat (owner rule, `currentConversationId()`); past
     threads return only from History. The spec now follows that path: reload → empty chat → open the thread from History → the card finds
     its job (`recall`) → completes; one debit, one job row. Desktop proved it on run 38557521565.
  4. *Stand-in provider gate* — required only ONE of `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` to be local; a mixed config could bill a
     hosted project for a synthetic track. Now every configured address must be local (unit-tested). Stricter, never weaker.
- Phase 3 isolation: no edits to `liveTools.ts`, `liveActions.ts`, `GeminiLiveConversation.tsx`, `OmniStudio.tsx` this session. Astra's
  branch `astra/agent-g-voice-experience-v2-20261014` (local only, `01457c3c`) has not touched those four files vs main; `git merge-tree` with
  #65 is clean.
- Phase 4: Preview env checked read-only — `NEXT_PUBLIC_SUPABASE_URL`, anon and service-role keys are single rows targeting
  Production + Preview + Development → Preview = Production database. No `MUSIC_*` / fake-provider variables on Preview.
- Phase 6: merge-tree #65×#60 (`be9edee3`), #65×#64 (`bcb724a1`), #60×#64, #65×main (`fef867a6`) all clean. Disposable 3-way tree
  (`/private/tmp/ms-integration`, #65 `0ea8aadf` + #60 + #64): tsc 0; Jest 912 suites pass / 5 fail (20 tests) — the same 5 ffmpeg suites and
  20 tests fail on clean `origin/main` `fef867a6` on this Mac (ffmpeg-static baseline), so not a regression.

## OPEN DEFECT (shared chat infrastructure — NOT patched here)
**History uid race.** `components/studio/ChatChrome.tsx` publishes `<html data-authed="1">` as soon as a session is seen, but `data-uid`
only after `getUser()` resolves. `OmniStudio`'s autosave keys the archive with `currentUid()` (`lib/chat/historyKeys`), so a turn made in
that gap is saved to `myavatar-archive::conversations::anon` and never shows in the user's History (run 38557521565, phone). Affects any
first turn, not only music; the music job itself is unaffected (it completes, one debit, Library row).
Proposed isolated patch (for the chat owner, not applied): in OmniStudio's autosave effect, skip the write while
`dataset.authed === '1' && !currentUid()`, and have ChatChrome dispatch `myavatar:uid-ready` after publishing `data-uid` so OmniStudio
re-runs the upsert once. No migration of the `anon` slot (it may hold another guest's chats). OmniStudio is a contested file (Astra).

## FINAL SESSION (2026-10-14, approval GG-20261014-MUSIC-LYRIA-E2E-USD5)
- **Live Lyria on Vertex: 3 calls, 3 × HTTP 200** from the Preview build of `c4c8792e` (gated build step
  `scripts/music-studio/preview-lyria-check.cjs`; request file deleted in `abe8b234`; later builds skip). ≈ $0.12 estimate; actual billing
  not readable by the agent. Instrumental / English-lyrics / Georgian-lyrics (experimental) — all valid 30.77 s MP3 44.1 kHz stereo,
  0 decode errors, studio QC PASS. Sung vocals = LISTENING REVIEW REQUIRED; vocals stay OFF. → FINAL_REAL_LYRIA_E2E.md, FINAL_SPEND_REPORT.md.
- `[e2e:replay]`: the isolated E2E pushes the real Lyria file through quote → Create → debit → QC → Storage → Library → play → download
  (`tests/music-studio-live/real-lyria-replay.spec.ts`).
- Deterministic fault tests added: quota 429, unsupported model 404, unavailable 503, safety block, timeout, network (one provider call, no
  retry); Storage write failure and quota → refund once.
- Shared-chat uid race: proposal patch on a SEPARATE branch `claude/shared-chat-uid-race-proposal-20261014` (`7fe06fb5`, off main, unit
  tested 12/12, tsc clean). Not merged, not in #65; OPEN until a real E2E proves it and the chat owner / Astra accept it.

## BLOCKED (owner)
- ~~Paid Lyria E2E~~ DONE at provider level (above). The studio worker's own live dispatch needs an isolated Preview DB (below).
- Preview Library/credits tests: Preview uses the Production Supabase project → not run. Needs an isolated Preview project or approval.
- Real-microphone E2E: needs a person with a microphone (+ Gemini Live key on the target).

## NEXT ACTION
See PHASE2_CONTINUATION.md.
