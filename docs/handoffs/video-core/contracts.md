# Video Core v1.0 — contracts and the working architecture (§3 · §4 · §5 · §7 · §8 · §9)

Everything below is read from the code on `claude/video-core-v1-6gh97e`; a field named here exists in the file named.

## 0. The sketch

```text
 user text (KA/EN/RU) ──► lib/agent/intent.ts · lib/chat/studioIntent.ts · lib/video/durationWords.ts · lib/agent/params.ts
        │                 (kind, requested length AS SAID, music source offset, selection, aspect, end text)
        ├─ video.generate / video.music-video ─► chat step `open` the Video tool (OmniStudio) with the plan SAID
        │        └► lib/video/durationContract.planFinalDuration → requested · native · final (30 fps grid) | refusal
        │              ├─ ok      ► storyboard (app/api/video/storyboard → createStoryboard; miss ⇒ error card + Retry, no render)
        │              │            ► Start ► scene clips (Veo/Vertex, mocked in tests) ► app/api/video/assemble
        │              │               └► finalCutForAssemble(stitchedSeconds, final) BEFORE any charge | 400 final_duration_invalid
        │              │               └► lib/orchestrator/ffmpeg-assembly: 30 fps, -t final, frame count QC (masterQa)
        │              │            ► single clip: lib/video/finalCut.cutMasterToLength (fail-CLOSED)
        │              └─ longform_closed ► refusal said; LONGFORM_ORDER_WIRED=false (lib/video/longform exists, not wired)
        ├─ montage (clips + track) ─► lib/agent/media/montageChat → montageExec quote (free) → quoteToken
        │        ► Start ► lease queue (lib/orchestrator/jobLease) ► montageWorker ► beatPlan/montagePlan/sourceSelect
        │        ► lib/video/surgicalOps.runSequence (exact round(len×30) frames per segment and master) ► mix/mux
        │        ► QC montageAsk.qcAvSync (frames = planned, sound ends with picture, every kept source seen) ► deliver | refund once
        └─ video.editing ─► editChat → editExec → editWorker → editLive / layerRender (parent kept, revision = new artifact)
 artifacts: hosted master (signed URL, 7 d) + Library row owned by the caller; job row is the server-authoritative state
```

## 1. Command contract (§3.2 · §3.3)

| Field | Where it is read | Values |
| --- | --- | --- |
| `kind` | `lib/agent/intent.ts` (`classifyAgentIntent`), `lib/chat/studioIntent.ts`, `lib/agent/media/montageChat.ts` | `video.generate` · `video.music-video` (new) · `video.editing` · `video.remix` · `video.product-ad` · montage (media exec, by clips + track + cutting words) |
| requested length, **as said** | `lib/video/durationWords.ts` (`readDurationSec`): digits, decimals with `.` or `,`, clocks `m:ss`, words „ერთწუთიანი“/„ოთხწუთიანი“/"one-minute"/«одноминутное», compounds "2 min 30 s" | a number in seconds, or `undefined` = not said (then the panel default, **named**) |
| music source offset | `lib/agent/params.ts` (`mineMusicStart`: „0:58-დან“, „58-ე წამიდან“, "from 0:58", «с 0:58») | seconds into the track; kept exactly (never beat-snapped) |
| music timeline start | `beatPlan.audioTiming().timelineStartSec` | always `0` today (a delayed start is MISSING, see blockers) |
| selection | `lib/agent/media/sourceSelect.ts` (`selectSources(text, pictures)`) | `{mode:'all'}` · `{mode:'subset', keep[], excluded[], phrase}` · `{mode:'invalid'}` (the phrase names the files left out) |
| aspect, end text, logo, captions | `lib/agent/media/layerWords.ts`, montage quote | `9:16` / `1:1` / `16:9`; Georgian text layers as typed |
| disambiguation | montage needs clips + track (else `no_track`); a music video is one clip + the user's track; "edit" needs a delivered artifact; multi-scene = a film above one clip | missing input is asked, nothing is guessed silently |

The normalized command is **immutable per run**: the montage quote is signed (`quoteToken`) and the film's render snapshot
carries `finalDurationSec` only when the request was planned on the grid that renders (`videoCoreWiring.test`).

## 2. Duration contract (§4) — `lib/video/durationContract.ts`

Five numbers are kept apart and named:

| Name | Symbol | Source |
| --- | --- | --- |
| Requested Final Duration | `requestedSec` | the user's words, as said (29.7) |
| Scene Duration | `SCENE_SEC = 8` | the film grid |
| Provider Clip Duration | `nativeSec` | scenes × clip − joins × overlap (`stitchedSeconds`, `JOIN_OVERLAP_SEC = 1` for a soft join) |
| Final Duration | `finalSec = quantizeToFrames(requestedSec)` at `VIDEO_FPS = 30` | 29.7 → 891 frames; 60 → 1800; 240 → 7200 |
| Music Source Offset / Music Timeline Start | `musicStartSec` / `timelineStartSec` | montage lane (§4 of this file) |

```text
planFinalDuration(requestedSec, caps, opts) →
  { ok:true, requestedSec, nativeSec, finalSec, finalFrames, trimSec, scenes, route:'film'|'clip' }
  | { ok:false, reason:'too_short'|'too_long'|'longform_closed'|'joins_exceed_film', requestedSec, maxSec }
finalCutForAssemble(masterSec, finalSec) →
  { ok:true, finalSec, finalFrames, trimSec }
  | { ok:false, reason:'not_a_number'|'off_frame_grid'|'too_short'|'longer_than_master'|'trim_exceeds_scene', masterSec, finalSec }
```

Rules: the plan line always says **requested · native (rendered) · final**; trimming is explicit and priced on the native;
a final that is longer than the master is refused before any encode or charge; a final is never changed silently; a film
is never freeze-padded under a contract (the legacy 30 s brand pad applies only to a render with no contract — PARTIAL).
Frame accuracy is proven on decoded frames (`lib/video/frameCount.ts`), not container metadata (`masterQa frame_count_mismatch`).

## 3. Storyboard and revision contract (§5) — `lib/video/storyboard/revision.ts`

```text
StoryboardRevision { id, n, origin: 'plan'|'caption'|'reroll'|'reorder'|'add'|'remove'|'base'|'regenerate', parentId,
                     fingerprint (16 hex, FNV-1a × 2 over the canonical board), scenes[], scripts, clipSec, createdAt }
RevisionApproval   { revisionId, fingerprint, approvedAt }        approvalMatches(approval, board) → boolean
diffRevisions(a, b) → { changed[], added[], removed[], reordered }
```

Failure safety (built): a plan miss, a timeout or a thrown plan call posts the chat's error card with **Retry** (plans the
storyboard again) and **Dismiss**; no render, no charge, no silent fallback. Persistence: tables `storyboard_revisions`,
`storyboard_approvals` are a **proposal** (`proposals/20261012a_storyboard_revisions.sql`, not applied); wiring the module
into the board mutations and checking the fingerprint at render time is deferred (`storyboard-revisions.md`).

## 4. Timeline and montage contract (§7)

```text
shots[]   { src (index as sent), startSec, endSec, speed, kind:'video'|'still' }          montagePlan: ≤ 12 shots, 0.4–60 s, ≤ 300 s
beat plan planBeatCuts(clips, musicSec, targetSec, musicFromSec) → { ok, cuts[], musicStartSec = musicFromSec (exact), leadInSec, totalSec }
                                                                 | { kind:'music_too_short', fromSec, musicSec, neededSec, targetSec } | footage_too_short | target_too_long
lane      per segment: trim,setpts,scale,fps=30,tpad(clone),trim=end_frame=round(len/speed×30),setpts,fps=30 ; audio apad,atrim=0:len
          master: tpad(clone),trim=end_frame=round(total×30),setpts,fps=30
manifest  qc.sources[] = seconds each source contributes (0 for an excluded one; every kept clip ≥ 1 shot or the quote is refused)
audio     qc.audio { sourceStartSec, timelineStartSec (0), targetSec, endPolicy:'stop', sourceAudio, replacementAudio }
QC        qc.av { videoSec, audioSec, videoFrames, plannedFrames }  — videoFrames must equal round(planned×30); sound must end with the picture
```

A master that fails QC is refused and refunded; it is never delivered as "close enough".

## 5. Quote, approval and idempotency (§8.3)

| Lane | Quote | Approval | Idempotency |
| --- | --- | --- | --- |
| montage / edit | server quote card (credits, length, shots, files used and left out, engine); signed `quoteToken` with expiry | the user presses Start with the token | one job per token; a second Start or a retry finds the job (`montageExec.test:158`, `:287`); a changed plan is a **new** quote |
| film | the panel's plan line (requested · rendered · final, credits) | Start on the panel | `filmTokenId` / `billingToken` single charge; the assemble route checks `finalDurationSec` against the clips **before** any charge |

An expired token or signed URL is refused with the reason (`media_not_yours` 403, token errors); nothing is re-signed on
the caller's behalf except our own storage paths (`reSignIfInternal`) after the ownership check.

## 6. Job lifecycle (§8.2)

```text
montage job: queued ─► leased (lease token, fenced writes) ─► running (ffmpeg, cancellable) ─► succeeded
                                                                      ├► failed (qc_failed … → refund once)
                                                                      └► cancelled (ffmpeg killed < 1.5 s, refund once)
             a worker that dies loses the lease; the sweep re-leases and renders the waiting job; a late callback is fenced
film:        ready ─► assembling (recordFilmAssembling) ─► done | failed (recordFilmFailed); status polled by token
```

Server-authoritative: the client renders what the job row says; cards are persisted in `chat_messages.metadata`.

## 7. Artifact (§9.2)

Hosted master = signed URL (7 days) in the render bucket, path carrying the frame count for a contracted film
(`films/final-<ts>-891f-….mp4`); a Library row owned by the caller; edits produce a new artifact and keep the parent;
QC evidence (`qc.*`) is stored on the job row. Cross-account access to files, jobs, quotes and artifacts is refused
server-side (`lib/security/callerMedia`, `montageExec.test:224`).
