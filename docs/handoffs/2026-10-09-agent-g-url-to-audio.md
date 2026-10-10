# Agent G: URL-to-Audio (media extraction) — 2026-10-09

Owner's request (GG, 2026-10-09 12:34:47Z, Master Task): a user sends a video link in the chat and asks "take the MP3 out
of this video"; Agent G checks the link and the rights, takes the file only from an allowed source, extracts the sound in a
worker with FFmpeg, and returns an MP3 in the same chat (player, name, length, size, Download, Save to Library), with
progress, cancel, retry, recovery, QC, idempotency and safe file handling. A platform that does not allow downloads gets an
upload offer instead, never a workaround. Text chat and Live Voice both drive it. Existing queue, tool registry, worker and
storage only; no new pipeline, no forbidden provider. Merge, deploy, paid infrastructure and DB migrations only with the
owner's separate word.

Branch `claude/launch-certification-wmvitt` (draft PR #50), commits `f566264e` (server) and `780b3426` (chat, tool
registry, Live Voice). Labels: PROVEN · BUILT_NOT_PROVEN · PARTIAL · MISSING · BLOCKED_OWNER.

**Status: BUILT_NOT_PROVEN on a deployment.** The whole path is proven locally: real internet fetch, real FFmpeg, the real
queue code, the real chat UI in a browser. It has not run on a Vercel Preview with a signed-in admin, and it is **off in
Production** (`AGENT_G_MEDIA_EXEC` unset = off). Nothing was merged, deployed or migrated, and no paid service was used.

## 1. What the user sees (once the flag is on for them)

1. They paste a link with words like "ამ ვიდეოდან MP3 ამოიღე" / "extract the audio" / «вытащи звук» (or attach one video or
   audio file with those words). Agent G answers with a plan card: source host, file name, size, rights, "MP3 192 kbps",
   up to 60 minutes, **free**, and a Start button. Nothing has been downloaded or spent yet.
2. Start (a double click still makes one job) → a progress line (queued → fetching the file and turning its sound into
   MP3 → checking the result → saving; "the server stalled, so I am starting again" on a retry) and a Stop button.
3. The MP3 comes back in the same bubble: a player labelled with the file name, a "0:05 · 120 KB · MP3 192 kbps" line,
   Download (saves `flower.mp3`) and Save to Library.
4. A YouTube / TikTok / Instagram / … link is refused by name ("YouTube does not allow its videos or audio to be
   downloaded outside its own player, so I will not take the file from this link.") with an **Upload a file** button: it
   opens the file picker with "Extract the MP3 from this file" already typed, and the uploaded file gets a "rights: yours"
   plan.

Screens (real MP3 from the E2E below, routes mocked in the browser): `agent-g-audio-1-plan.png`, `-2-done.png`,
`-3-refused.png`, `-4-own-file.png` in `/mnt/project-files/reports/agent-g-audio/`.

## 2. Requirements 1–7

| # | Requirement | Label | How |
|---|---|---|---|
| 1 | Recognise the URL, check that the source opens and the rights | BUILT_NOT_PROVEN (unit + real-internet E2E) | `lib/agent/media/audioChat.ts` reads the ask (ka/en/ru) and the link; `audioSource.ts` refuses 32 platforms by every page and CDN host (YouTube, TikTok, Instagram, Facebook, X, Vimeo, SoundCloud, Spotify, …) and streams (HLS, DASH) before any request; `audioLive.ts` `inspectLink` opens the link through `lib/web/publicFetch` (public hosts only, pinned DNS) and requires a video/audio file, not a page. Rights: **licensed** when the source publishes one (Wikimedia Commons API: licence and author; an HTTP `Link: rel="license"`), **own** for the caller's upload, else **unverified**, and the card says to press Start only for a file that is theirs or licensed to them |
| 2 | Fetch only from an allowed, supported source; FFmpeg in a worker; MP3 | BUILT_NOT_PROVEN (real FFmpeg locally) | Direct media files on public hosts only. The source rule runs again on **every redirect hop** (`publicFetch` `allowUrl`), so a shortener cannot land the download on a platform. The worker (`audioWorker.ts`) runs the bundled `ffmpeg-static` through `lib/video/ffmpegExec`: first sound stream → MP3 192 kbps CBR, stereo, 44.1 kHz, the source's metadata replaced by the title only, 540 s timeout |
| 3 | Result in the same chat: player, name, length, size, Download, Save to Library | BUILT_NOT_PROVEN (Playwright 5/5) | `components/studio/OmniStudio.tsx` audio bubble (TrackPlayer + info line + Download + Save to Library → `POST /api/studio/library`, kind `music`). The MP3 is stored in the private `renders` bucket (`audio/extract-<job>.mp3`) and handed out as a 7-day signed link |
| 4 | Progress, cancel, retry, recovery, QC, idempotency, safe files | BUILT_NOT_PROVEN | One `generation_jobs` row per signed quote (the quote's job id is the idempotency key: a second Start reports the same job). The lease queue from the execution foundation (`lib/orchestrator/jobLease.ts`: 90 s lease, 15 s heartbeat, one retry after a lapsed lease). Stop → cancel → the heartbeat kills FFmpeg. Recovery: the owner's status read and the per-minute sweep (`/api/agent/media/sweep`, now also for audio) hand an orphaned job to a new worker. QC (`qcMp3`): reads back as MP3 sound with no picture stream, ≥ 1 KB, ≥ 0.2 s, length within 2 s or 5 % of the decoded source; a file that fails is never delivered. Safe files: 200 MB and 60 min caps, media types only, SSRF rules, a temp dir removed after each run, output paths built by the server only |
| 5 | A platform that refuses downloads → offer an upload; no bypass | BUILT_NOT_PROVEN (unit + Playwright) | Refusals `platform`, `stream`, `not_media`, `unavailable`, `blocked_host`, `invalid_url`, `refused` carry the upload offer. There is no yt-dlp or any extractor, no cookie or header tricks, no CDN URL guessing. A CDN link (e.g. `googlevideo.com`) is refused like the platform itself |
| 6 | Text chat and Live Voice, one window | BUILT_NOT_PROVEN (unit + Playwright) | Text: the chat's deterministic branch (`send()` → `startAgentAudio`) and the ReAct tool `quote_audio_from_link` (plans only, `/api/agent/run` returns `audioQuote`). Live Voice: function `extract_audio` with actions `plan` / `start` (only with `confirmed: "yes"` after a spoken yes) / `stop`; it drives the same chat card; the plan reaches the call as an `[App]` note the model reads back before asking. Not tried on a live Gemini call |
| 7 | Existing queue, tool registry, worker, storage; no duplicate pipeline; no forbidden provider | BUILT_NOT_PROVEN | Same quote → run → lease worker → QC → bubble shape as the montage (`montageExec`), same `generation_jobs` queue, same sweep, same signed-quote module, same audit stream (`audit.agent_g.media`, op `audio_extract`). The chat's job follower was pulled out of the montage client into `lib/agent/media/jobFollow.ts` and both use it. Registry: `audio_extract_run` (confirmed action) and the quote-only tool. No AI model or provider is called: FFmpeg only |

## 3. Evidence

**Real internet, real FFmpeg** (`lib/agent/media/audioLive.e2e.test.ts`, opt-in `AGENT_G_AUDIO_E2E=1`, run 2026-10-09
13:01Z): source `https://raw.githubusercontent.com/mdn/shared-assets/main/videos/flower.mp4` (MDN's shared-assets repo,
media published for reuse in samples; its README admits only CC0 or permissively licensed assets). Quote (free, host
`raw.githubusercontent.com`, 1,128,375 bytes, rights `unverified`: the host publishes no machine-readable licence) →
queue → worker → QC → `completed`, attempt 1, 455 ms. MP3: 5.09 s, 122,941 bytes, MP3 192 kb/s, 44,100 Hz, stereo
(ffprobe), sha256 `3493d2bf…caacd`. Audit rows: quote, run queued, started, delivered. In the same run a YouTube link was
refused by name before any request. Storage and the database were local stand-ins in this run.

**Real FFmpeg on a local host** (`audioLive.ffmpeg.test.ts`): a video with sound → MP3 that passes QC; a video without
sound → `no_audio`; a redirect onto YouTube refused mid-download; Stop kills the FFmpeg process; queue → worker → QC.

**Browser** (`tests/agent-g-audio.spec.ts`, Playwright, Chromium, routes mocked, the real MP3 above served as the result):
5/5 — link → plan → Start (double click = one run) → progress → player, info line, Download `flower.mp3`, Library POST;
YouTube refused → Upload → own-file plan "rights: yours"; Stop; Live Voice `extract_audio` stop/start/plan/start with the
`[App]` notes; flag closed → ordinary chat. No regressions: `agent-g-montage.spec.ts` 4/4, `live-actions.spec.ts` 4/4.

**Suites:** full jest 725 suites passed (1 skipped), 11,188 tests; `tsc --noEmit` clean; ESLint clean on every changed
file (OmniStudio at its 13 pre-existing hook warnings); `next build` passes (207 pages), `ffmpeg-static` traced into the
audio and sweep routes.

## 4. Not proven / not done

- **Preview run with an admin session (the AG-8 equivalent):** on the cert-branch Preview the flag defaults to admins.
  GG signs in there as admin, pastes a direct media link (for example the flower.mp4 link above) with "extract the MP3",
  presses Start, and the job id, the MP3 and a screenshot are recorded. Until then every row above stays BUILT_NOT_PROVEN.
- **Live Voice on a real call:** Google accepting the new `extract_audio` declaration in the token lock and the spoken
  plan → yes → start loop (needs a real device, owner action 13 in the certification).
- **The ReAct path's plan card outside the chat:** `/api/agent/run` returns `audioQuote`, but the Agent Terminal shows
  only the trace. The chat's own branch and Live Voice are the user-facing paths.
- **Rights are a declaration, not a proof,** for links without a published licence: the user's Start is their word that
  the file is theirs or licensed to them. That is the same standard as an upload.
- **Production:** `AGENT_G_MEDIA_EXEC` stays unset there. Turning it on (for admins or everyone) is an env change plus a
  deploy, so it needs GG's separate word.

## 5. Files

Server: `lib/agent/media/{audioSource,audioChat,audioExtract,audioWorker,audioLive,commonsLicense}.ts`,
`app/api/agent/media/audio/route.ts`, the sweep route, `lib/web/publicFetch.ts` (`allowUrl`, HEAD), `next.config.js`
(ffmpeg trace). Client: `lib/agent/media/{jobFollow,audioClient}.ts`, `components/studio/AgentAudioCard.tsx`,
`OmniStudio.tsx`. Agent: `lib/agent/react/bindLiveAgent.ts` (`quote_audio_from_link`), `lib/agent/tools/registry.ts`
(`audio_extract_run`), `app/api/agent/run/route.ts` (`audioQuote`). Live Voice: `lib/voice/liveTools.ts`
(`extract_audio`), `components/voice/live/liveActions.ts`, `LiveActivityFeed.tsx`, `GeminiLiveConversation.tsx`,
`docs/voice/LIVE_ACTIONS.md`. Tests next to each file, plus `tests/agent-g-audio.spec.ts` and `tests/fixtures/tone.mp3`.
