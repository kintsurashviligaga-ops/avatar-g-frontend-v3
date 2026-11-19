# MASTER TASK v3.1: owner handoff (Phase 6, 5 November 2026)

**Status in one line:** the v3.1 code is in Production (`d8420a5d`, healthy), every local and CI gate that can run
without spending passes, and the gates that need the owner's authorisation (live paid certification, the live chat
benchmark, a seeded Preview account, real hardware) are **unverified**. Under v3.1's own rule this is **not** reported
as "fully repaired" or "Production Ready".

Evidence: `VERIFICATION.md` (commands, environment, counts, CI per job), `CAPABILITY_MATRIX.md` (models, the Imagen
decision, unavailable capabilities), `GOOGLE_WORKFLOW_PARITY.md`, `BILLABLE_ENTRYPOINTS.md` (provider and cost
authority per route), `MIGRATION_ROLLBACK.md`, `SPEECH_CONTRACT.md`, `PHASE4_EVIDENCE.md`, `PERFORMANCE_BASELINE.md`.

## 1. What shipped, by phase

All of it is on `main` and in Production. Phase work and the owner's own requests were interleaved; the appendix lists
every commit since #113 with its PR.

| Phase | PRs | Last commit of the phase | What it delivered |
|---|---|---|---|
| 0. Audit and baseline | #113 (merged), docs in draft #114 | `9b7fd461` (2026-10-22) | audit, owner decisions 1–5; the v2 docs in this PR supersede #114's v1 |
| 1. Strict Vertex, fail-closed billing, no fallbacks | #115–#149, leftovers #150–#154 | see appendix | Developer API refused; budget and ledger fail closed; quote v2; vendor fallbacks removed; provider-boundary ratchet |
| 2. Interaction repairs | #155–#164 | see appendix | stale browser specs fixed, dead screens deleted, progress UI, delete-X, one primary action |
| 3. Library, download, chat latency | #166–#174 | see appendix | Library kept per tab, download starts at once, chat critical path, `PERFORMANCE_BASELINE.md` v2 |
| 4. Speech | #175–#199 (with the Live work interleaved), Chirp 3 trial #238, #242, #245, then mic #250, #253 | `d4a712a7` (#253) | read-aloud contract, mic dictation on Chirp 3 (owner-verified ka/ru/en 2026-11-01) |
| Owner requests during the phases | Live and talking avatar (#188, #191, #194, #198, #203, #205–#208, #210–#215, #217–#220, #247), video like Veo with Omni (#209, #221, #223) and video assembly (#258), music vocals (#222) and music card visuals (#232, #233), product ad removed (#235), avatar preset (#244), logo (#246), Agent G PDF, sandbox, code-run and Drive (#240, #243, #248, #249, #251, #252, #254, #255), uploads and montage (#261–#263, #265), local E2E config (#260) | | each was approved by the owner on its own card |
| 5. Google ADK read-only pilot | #259 | `31372fbf` (2026-11-05) | isolated pilot, $0, no route |
| 6. Integrated verification and handoff | this PR (#267); follow-up fix #268 (draft) | | the documents above, the browser matrix, the route scan; #268 closes the one billable route without a budget check |

Eight commits reached `main` as direct pushes without a PR (music card visuals, 2026-10-28 and 10-29; marked in the
appendix). They passed the gates that ran on `main` after them; they had no PR review.

## 2. Gates

| Gate | Result |
|---|---|
| Typecheck, lint (0 errors), production build | **pass** on `d8420a5d` (local, and `verify` in CI) |
| Whole repository Jest: 1131 suites, 17185 tests | **pass**: 0 failed; 13 suites / 119 tests skipped by their own environment guards, each classified in `VERIFICATION.md` §1 |
| The broad-CI failures Phase 0 recorded | **pass**: all 7 named suites pass; the whole suite has 0 failures |
| ADK pilot (own lockfile, own CI) | **pass**: 26 tests |
| Browser matrix: ka/en/ru × desktop/phone, keyboard and touch, reduced motion, guest boundary, fast navigation | **pass**: 15/15 on the production build and 15/15 on `next dev` |
| Guest boundary of paid routes | **pass**: image, speech, Nano Banana, Veo avatar answer 401; music refuses before auth and is 401 past its gates (code read) |
| CI on the PR head (incl. real Postgres, Music and Video Core E2E, BOG, speech, voice) | **pass**: every job on `4c5cd2d1`, first run; the one exception is BOG's real-sandbox job, skipped by its own guard (no sandbox credentials in the repository). Preview healthy on that commit. `VERIFICATION.md` §3 |
| Live paid certification (one contract call per model) | **done 2026-11-06** (owner cards 2026-11-05 20:15Z and 2026-11-06 06:01Z, about $2.20 of $5): image, Lyria Pro, Cloud TTS ka/ru, Chirp 3 Georgian, Veo fast and standard **verified (contract)**; read-aloud's default Gemini TTS model (500 twice) and Chirp 3's listed-languages request (400) **contract failed**. `VERIFICATION.md` §6 |
| Live chat first-token benchmark | **unverified**: Phase 3 decision 3 open |
| Preview, warm, seeded account | **unverified**: Phase 3 decision 4 open |
| Real hardware | **unverified** by this phase (owner hand checks exist for Live on iPhone and mic dictation) |
| Speech quality judged by the owner after the 2026-10-24 "not fixed" | **unverified**: no new listening since the later changes |
| Production error logs | **unverified**: not readable from this session |
| BOG payments against BOG's real sandbox | **unverified** on this PR: the job's credentials are not in the repository; the local fake-BOG suite passes |

## 3. Unresolved risks

1. **Third-party keys still in the Production environment** (`OPENAI_API_KEY`, `REPLICATE_API_TOKEN`,
   `HEYGEN_API_KEY`, `UDIO_API_KEY`). The code refuses those vendors; the keys are the last line of defence if a path
   was missed. Removing them is the owner's action in Vercel.
2. **The telephony TTS route bills Cloud TTS without the platform budget check** (`/api/agent-g/calls/tts`, worker
   token only). Fixed in draft PR #268 (refused while phone calls are unavailable, budget-checked when they open);
   needs the owner's merge.
3. **The app describes some refused services as live and some engines by their old vendor** (catalog and capability
   registry, `CAPABILITY_MATRIX.md` last section). No spend risk; wrong self-description in the UI and for agents.
   Offered as a follow-up: hiding the three refused services (as `video.motion` was hidden in Phase 2) removes them
   from menus and search, a visible change, so it waits for the owner's OK.
4. **60 routes still import a forbidden vendor client in their closure**, refused at run time and frozen by the
   ratchet. Cleanup, not an exposure.
5. **Read-aloud's default model answered 500 INTERNAL on both certification calls** (`gemini-2.5-flash-preview-tts`,
   `global`, 2026-11-06). If Production does not set `GEMINI_TTS_MODEL` to another allowlisted model, read-aloud may be
   failing for users with 502 `tts_failed` (no other provider is used). Not readable from this session: the setting's
   value and the runtime logs. The owner can check by tapping read-aloud on myavatar.ge. Chirp 3's listed-languages
   request is refused (400); dictation still works through its Georgian-only request. Embeddings remain uncertified.
6. **Georgian and Russian sung lyrics** are outside Google's documented Lyria languages. The owner accepted Georgian
   after a test; Google could change behaviour without notice.
7. **Signed links to chat results expire after 7 days** (offered earlier as a follow-up, not asked for).
8. **Jest leaves an open handle** (a worker force-exited at the end of the run). It fails nothing today.
9. **Lint warnings**: 36, including 4 accessibility warnings (`aria-description` on a radio, an unsupported ARIA
   attribute).
10. **Direct pushes to `main`** bypass PR review and the PR-only CI jobs (real Postgres, E2E).

## 4. The Production decision required

Production already runs the release candidate; the only code left to deploy is the small fix in #268. What is left
is the owner's choice on how v3.1 is closed:

- **A. Certify** (recommended): approve one budgeted contract call per uncertified model on the Production Vertex
  project, capped at **$5** in total (estimate about $3: Lyria Pro, `gemini-3.1-flash-image`, Veo 3.1 fast and
  standard at 4 s, Gemini TTS, Cloud TTS, Chirp 3). Each call's request and response become a committed fixture and a
  contract test; nothing is repeated. v3.1 can then be closed with only the owner-dependent rows (hardware, benchmark,
  Preview account) open.
- **B. Accept as it is**: close v3.1 with the rows above marked uncertified.

**Chosen 2026-11-05 20:15Z: A.** Done 2026-11-06 in two owner-approved runs (about $2.20); #267 and #268 were merged
the same evening (Production `a8d50b3`). Results and fixtures: `VERIFICATION.md` §6, `CAPABILITY_MATRIX.md`.

Independent of A or B, the owner is asked to approve merging #267 (documents and tests) and #268 (the telephony TTS
fix), to remove the four third-party keys from the Production environment (risk 1), and to answer Phase 3 decisions 3
and 4 when convenient.

## Appendix: every commit on `main` since #113

| Date (2026) | Commit | PR | Title |
|---|---|---|---|
| 11-05 | `d8420a5d` | #265 | Montage: split screen with real footage over the speaker's lines (Pexels), Vertex-only spotting |
| 11-05 | `31372fbf` | #259 | Add the Google ADK read-only pilot, isolated (v3.1 Phase 5) |
| 11-05 | `8f0cce24` | #263 | Montage chat: read intro/outro roles from the words, narrate the plan, find dissolves |
| 11-05 | `300c1e27` | #262 | Uploads: per-account rate limit and a retry on 429, so montage clips stop failing with "too many uploads" |
| 11-05 | `f43f58cd` | #261 | Connectors: hide the unavailable Local files row when Google Drive is open |
| 11-05 | `965c41dc` | #260 | Rename [inbucket] to [local_smtp] in the E2E Supabase config (CLI 3.0.0) |
| 11-05 | `b33c87e9` | #258 | Video assembly: intro + body + outro, timestamp detection, A/V sync fix |
| 11-01 | `16002e25` | #255 | Fix Drive OAuth configuration and responsive Google Picker access |
| 11-01 | `8ab49bcd` | #254 | Agent G Phase 4: Google Drive connector, only the files the user picks (drive.file) |
| 11-01 | `d4a712a7` | #253 | Chirp 3: never write Georgian as Spanish-looking Latin |
| 11-01 | `bff43880` | #252 | Code run: save each result in the Library as a PDF |
| 11-01 | `32cc0968` | #251 | Code run: own per-minute limit, no false "daily limit" |
| 11-01 | `7bb020ab` | #250 | Mic speech-to-text: Chirp 3 for everyone, Gemini when Chirp has no answer |
| 11-01 | `6ebff4eb` | #249 | Agent G Phase 3: run chat code in the Vercel Sandbox (quote → run once) |
| 11-01 | `b759703a` | #245 | Chirp 3 trial: never write Georgian as Latin noise |
| 11-01 | `28857558` | #248 | Agent G sandbox: host runner with its own $20 spend cap (fake host) |
| 10-31 | `b29c3db0` | #247 | Live: the talking avatar gets its own audience, so the call can open to everyone |
| 10-31 | `846693a6` | #246 | Logo: show only "MyAvatar" (drop ".ge") |
| 10-31 | `5cefff50` | #244 | Avatar service: the 9:16 „ბლოგერი" preset shows MyAvatar.ge's 3D boy |
| 10-31 | `54dbe1c3` | #243 | Agent G PDF: show that the document is being made |
| 10-31 | `dcee5244` | #242 | Chirp 3 trial: never write Georgian in Hindi letters |
| 10-31 | `116197b7` | #220 | Live avatar: iPhone connect handshake with the relay |
| 10-31 | `7f3909b5` | #240 | Agent G PDFs in the chat and the Library (DOC-01) |
| 10-31 | `41e4aadb` | #238 | Mic: owner-only Chirp 3 dictation trial (?stt=chirp_3) |
| 10-30 | `79ba7958` | #235 | Remove the Product ad service |
| 10-30 | `cb01ec1c` | #201 | Mic: owner trial of Google's dedicated speech-to-text model |
| 10-30 | `a3a4572a` | #202 | Mic: dictation leaves out hesitation sounds |
| 10-30 | `8766dea0` | #233 | feat(music): premium fluid silk visualizer with real multiband energy |
| 10-29 | `0786dda5` | #232 | fix(music): enable PCM beat sync fetch for R2 signed media |
| 10-29 | `f16d1679` | **direct push** | feat(music): organic smoke visual and minimal monochrome seek rail |
| 10-29 | `7a8999a3` | **direct push** | feat(music): replace diamond with owner smoke-orb beat-reactive visual |
| 10-29 | `7c46f38a` | **direct push** | feat(music): accurate PCM beat-synced premium particle preview |
| 10-29 | `f2dc4952` | **direct push** | feat(music): inline brand-blue animated diamond music player |
| 10-28 | `1ff63710` | **direct push** | feat(music): refined volume-free music card with cinematic equalizer |
| 10-28 | `2245fe6e` | **direct push** | feat(music): minimal preview card and iPhone GainNode volume fix |
| 10-28 | `64720c9a` | **direct push** | fix(music): mount new preview card in primary Music Create player |
| 10-28 | `210549c9` | **direct push** | feat(music): Grok-style music preview card in One Window |
| 10-27 | `ad4711f0` | #223 | fix(chat): a chat opened again shows its videos, and „გააგრძელე" continues its clip |
| 10-27 | `7ba8f4e7` | #222 | Music: songs are sung with vocals, in the brief's language |
| 10-26 | `cdfb4963` | #221 | fix(video): „გააგრძელე" in the Video tool continues the clip, not a new one |
| 10-26 | `5dcf8c07` | #209 | Video: one clip like Gemini's Veo, and uploaded video edit/extend with Omni |
| 10-26 | `3213ab38` | #219 | Live call: a yes heard in Amharic letters or as „დავიწყეთ" counts; the price and the countdown are said right |
| 10-26 | `5fb88524` | #218 | Live call: a spoken yes finds the price card after the model said the price |
| 10-26 | `dfcb0cce` | #217 | Live call: every app answer names the language the user speaks |
| 10-26 | `251d8e1f` | #215 | Live call: a Georgian yes is heard better, and one written in another alphabet counts |
| 10-26 | `3e88d55f` | #214 | Live call: a call opened in Georgian answers in Georgian from its first reply |
| 10-26 | `57a924a9` | #213 | Live call: a yes to the price the model named just before the card counts |
| 10-26 | `343608bf` | #212 | Live call: a Georgian yes heard in Latin letters is still a yes |
| 10-26 | `b4a6ad76` | #211 | Live call: a "კი" heard in Arabic or Armenian letters is still a yes |
| 10-26 | `45e18351` | #210 | Live call: Georgian heard in Hindi letters is written back in Georgian ones |
| 10-26 | `8c5a9bb0` | #208 | Live call: a talking avatar (Vertex Gemini 3.8 Live, prebuilt faces) |
| 10-25 | `a582e064` | #207 | Live: an iPhone call that stalls while connecting retries after 6 s and says where it waited |
| 10-25 | `16f93e98` | #206 | Live relay: log where a session waited; deploy guide moves it to Europe |
| 10-25 | `2e286bac` | #205 | Live calls answer in the language spoken and stay in it |
| 10-25 | `d6b67ab9` | #203 | Live: the call no longer goes silent when something else takes the mic |
| 10-25 | `77412994` | #191 | Live relay for Vertex AI Live, open to admins first (P0 Phase 3, part 1) |
| 10-25 | `09b04e34` | #194 | Personas: seven selectable characters that change text and voice, switchable by voice in Live |
| 10-25 | `a619d950` | #198 | Agent G: a Live task finishes (Gemini 3 thinking level, steps fit the deadline) |
| 10-25 | `c12ec78f` | #200 | Mic: Russian speech is no longer written in English |
| 10-25 | `cf53d53e` | #199 | Mic: on an iPhone or in Safari, every language records |
| 10-25 | `9af1b987` | #197 | Mic: a pause to think no longer stops the dictation |
| 10-25 | `d4b3a13c` | #196 | Mic: answer from 3.6 Flash, and a slow model no longer takes the whole dictation |
| 10-25 | `687a71f6` | #193 | Mic: step down through the chat's models; the owner's warning names every refusal |
| 10-25 | `cd86bf14` | #188 | Live chat: the old rocket is gone in every state; the call wears the approved design |
| 10-25 | `e2f3b12a` | #189 | Read aloud: chunks grow and three are fetched ahead, so a read starts sooner and does not stop |
| 10-24 | `edfb23c1` | #187 | Mic: keep English, and show the owner why transcription or a trial read failed |
| 10-24 | `e9db8156` | #186 | Read aloud: voice a reply in its own language, not the page's |
| 10-24 | `d9503229` | #185 | Phase 4 fix 3: the owner's read-aloud trial of the 3.8 TTS models (admin only) |
| 10-24 | `6c07bfcd` | #184 | Chat: answer in the language the user writes in |
| 10-24 | `f9b24466` | #183 | Read aloud: the Pause button pauses, and Continue goes on from there |
| 10-24 | `e90eaa21` | #182 | Phase 4 PR 8: read-aloud evidence in a real browser and in numbers |
| 10-24 | `64b6146f` | #181 | Phase 4 PR 7: a call has the speakers; the voice call uses the speech contract |
| 10-24 | `ec6722c8` | #180 | Phase 4 PR 6: hearing a reply again sends no request |
| 10-24 | `e33c24d1` | #179 | Phase 4 PR 5: one read-aloud player that never skips a chunk |
| 10-24 | `0152745a` | #178 | Phase 4 PR 4: a sentence chunker whose chunks cover the message exactly once |
| 10-24 | `bb793096` | #177 | Phase 4 PR 3: one read-aloud deadline, at most two provider attempts |
| 10-24 | `cd73e9eb` | #176 | Phase 4 PR 2: read-aloud answers the whole audio or refuses; 413 before any spend |
| 10-24 | `077c402a` | #175 | Phase 4 PR 1: speech contract v1, WAV checks and audio fixtures |
| 10-24 | `d773f521` | #174 | Phase 3 PR 8: PERFORMANCE_BASELINE.md v2, before and after per §4.1 interaction |
| 10-24 | `ec611545` | #173 | Phase 3 PR 7: chat's first word no longer waits on the profile, memory or avatar check (§4.4) |
| 10-24 | `62f6b362` | #172 | Phase 3 PR 6: download saves one file per double click, signs expired links afresh and never holds a large file in memory (§4.3) |
| 10-24 | `55f2317e` | #171 | Phase 3 PR 5: Library films are not read again, and each screen comes back where it was left (§4.2.5, §4.2.6) |
| 10-24 | `04863008` | #170 | Phase 3 PR 4: Library stars are the account's (§4.2.4) |
| 10-24 | `b8a2fab2` | #169 | Phase 3 PR 3: the Library says what happened, with stable pages and link expiry |
| 10-24 | `234b3f17` | #168 | Library: one data layer for both Library screens |
| 10-24 | `0d630d0a` | #167 | Phase 3 PR 1: opt-in server spans and mock benchmarks, with the before table |
| 10-24 | `201a5839` | #166 | Start trusted storage downloads before buffering media bytes (carries #165) |
| 10-24 | `31e5d372` | #160 | Cancel obsolete Library requests when switching tabs or leaving |
| 10-24 | `4e3a2caa` | #164 | The delete X gets its browser evidence; focus follows a keyboard delete |
| 10-24 | `9f34fb03` | #163 | One primary action per panel; Motion hidden; LiveAvatar no longer loaded |
| 10-24 | `a77f411a` | #162 | Cards take their state and one primary button from cardState; the storyboard line says planning |
| 10-24 | `894d0f14` | #161 | Every studio percent is measured: 0% and the last real value, never the clock |
| 10-24 | `05d2624a` | #159 | Phase 2 PR 5: one set of card states (lib/studio/cardState) |
| 10-23 | `db4f020f` | #158 | The studio's last progress bars become a number and a short label |
| 10-23 | `335853d7` | #155 | Agent G's gate spec follows the current composer and runs in CI |
| 10-23 | `b319542c` | #157 | A wait shows a percent and a short label: no bar, checklist or clock |
| 10-23 | `25980b72` | #156 | Delete screens nothing imports, and the parts only they used |
| 10-23 | `602b5d2a` | #154 | Answer a question about storyboards instead of planning one |
| 10-23 | `5c7bf53f` | #152 | Delete two committed backup files |
| 10-23 | `feeb96ce` | #151 | Close the CSP to provider APIs no browser code calls |
| 10-23 | `40d132a3` | #153 | Delete the Higgsfield Generate the panels could no longer reach |
| 10-23 | `3acb6ebc` | #150 | Delete vendor code no request reached |
| 10-23 | `f12e9e64` | #149 | Phase 1 · PR 25: the operator film reports name the Google legs |
| 10-23 | `9da13197` | #148 | Phase 1 · PR 24: the Music panel and film readiness name no withdrawn engine |
| 10-23 | `7bb39bfb` | #147 | Phase 1 · PR 23: Interior and Photoshoot offer no size |
| 10-23 | `42d08c64` | #146 | Phase 1 · PR 22: the image tool offers one Google row and no size |
| 10-23 | `c0b9a250` | #145 | Phase 1 · PR 21: the pipeline status reports the studio image on Gemini |
| 10-23 | `65da93d8` | #144 | Phase 1 · PR 20: delete six vendor clients nothing called |
| 10-23 | `c9a2fadf` | #143 | Phase 1 · PR 19: the shared video browser-test helpers follow the current composer |
| 10-23 | `73c8e474` | #142 | Phase 1 · PR 18: Higgsfield models show as paused in every model picker |
| 10-23 | `7975035d` | #141 | Phase 1 · PR 17: the music engine list names Lyria only |
| 10-23 | `6d67ac4d` | #140 | Phase 1 · PR 16: admin engine diagnostics name Google engines only |
| 10-23 | `458b8e7e` | #139 | Phase 1 · PR 15: admin and health probes call no outside vendor |
| 10-23 | `ef448190` | #138 | Phase 1 · PR 14: health and admin readiness report Vertex only |
| 10-23 | `037ce485` | #137 | Phase 1 · PR 13: sung songs wait for verified Lyria vocals |
| 10-23 | `1760877c` | #136 | Agent G sub-tasks never fall back to another engine (Phase 1, PR 12) |
| 10-23 | `dab721f2` | #135 | Phase 1 · PR 11: Georgian lines read by Gemini-TTS (Cloud TTS lists no ka-GE voice) |
| 10-23 | `d8b1deb4` | #134 | Phase 1 migration and rollback notes (MASTER TASK v3.1 PR 10) |
| 10-23 | `95759e3f` | #133 | Built-in avatars only: a custom avatar answers capability_unavailable before any charge |
| 10-23 | `114d2399` | #132 | Imagen 3 answers lifecycle_blocked before any spend; pin the Vertex image lifecycle |
| 10-23 | `b4905722` | #131 | Veo: only a verified Vertex row renders, in a region it lists (Phase 1, PR 7) |
| 10-23 | `8e711f92` | #130 | Phase 1 · PR 6b: health checks ask Cloud TTS for the voice, and stop calling ElevenLabs |
| 10-23 | `176a427b` | #129 | Phase 1 · PR 6: Lyria replaces ElevenLabs Music; a lost stop race says "try again" |
| 10-23 | `0573e9f1` | #128 | Delete vendor modules that nothing calls any more (Phase 1 cleanup) |
| 10-23 | `ea07c8e9` | #127 | Phase 1 · PR 5e: ElevenLabs-only tools refuse; film voice check on Gemini |
| 10-23 | `162cd306` | #126 | Phase 1 · PR 5d: spoken voice on Google Cloud TTS with the Vertex identity |
| 10-23 | `fdb8f063` | #125 | Phase 1 PR 5c: media tools Google-only, whatever MEDIA_GOOGLE_ONLY says |
| 10-23 | `df524966` | #124 | Video runs on Veo and Gemini only, whatever VIDEO_GOOGLE_ONLY says |
| 10-23 | `ea1633a3` | #123 | Chat, voice and agents run on Google only, whatever AI_GOOGLE_ONLY says |
| 10-23 | `658bffca` | #122 | A signed quote binds the engine, the project and the price book, not only the plan |
| 10-23 | `58eadf94` | #121 | Billing fails closed: a guard that cannot answer refuses, and a refused booking is kept |
| 10-23 | `f884edee` | #120 | Features gated on an AI Studio key follow Vertex AI readiness (Phase 1, PR 2d) |
| 10-23 | `14c501ca` | #119 | Phase 1 · 2c: the last Developer API callers fail closed; health reports Vertex readiness |
| 10-23 | `7b87b04f` | #118 | Phase 1 · 2b: Veo renders on Vertex AI only |
| 10-23 | `ff605874` | #117 | Phase 1 · 2a: Google model calls go to Vertex AI only |
| 10-23 | `fddc857f` | #115 | Provider boundary follows v3.1: Developer API and ElevenLabs join the ratchet, plus a per-route reachability baseline |
| 10-22 | `9b7fd461` | #113 | Harden video attempts and repair Studio, Live and font builds |
