# Service audit: what MyAvatar.ge offers, one by one (2026-10-09)

**Asked by the owner, 2026-10-09 18:25Z (Master Task, three photos):** remove the old "Choose a service" hub and the old
"Music Video" page, /studio "Studio Beta" is confusing, music-video making cannot be found in Video, "Connectors &
plugins" is confusing; "remove everything superfluous, optimise, check one by one everything we offer the user; it must be
easy to understand and use."

**Where this is:** branch `claude/launch-certification-wmvitt` (draft PR #50), so the cert Preview
<https://avatar-g-frontend-v3-git-ef1fad-kintsurashviligaga-ops-projects.vercel.app>. **Production is unchanged** (it serves
6c7dff4); shipping these needs the owner's separate deploy word.

Status labels as in PROJECT_MASTER.md. "Engine" is the catalog's `boundary` (lib/catalog/services.ts): `google` = Google or
ElevenLabs only; `violation` = a non-allowed provider is still on the path. Removing those providers is the owner's
decision (action 9: "not now"). Since the 21:29Z finalization ask, no outside engine falls back to another outside engine
any more (§6), and one switch, `MEDIA_GOOGLE_ONLY` (off by default), holds every media tool to Google / ElevenLabs.

## 1. What was removed (BUILT_NOT_PROVEN on Preview; Playwright green locally)

| Removed | Why it confused | Where its users land now | Commit |
|---|---|---|---|
| Three-card hub "Choose a service · Three studios, one window" (`/dashboard#hub`) | a second front door beside the studio | the studio chat | 4cde9d04 |
| Old "Music Video" director / Film Studio (`#film`, ConversationalFilmStudio, 2 561 lines) | a second way to make a film, with its own top bar | Video tool | 4cde9d04 |
| Lip-Sync Studio (`#lipsync`) | a second way to make a talking avatar | Avatar tool | 4cde9d04 |
| `/{lang}/studio` "Studio Beta" (STUDIO_V2 UI) and its sidebar row | a second set of Video / Image / Avatar / Music tabs | 307 to the studio home | 4cde9d04 |
| Card film studio (CinematicFilmStudio) | nothing rendered it any more | n/a (dead code) | 4cde9d04 |
| "Connectors · Plugins · Skills" sidebar row, rail button and sheet | Plugins only hid menu rows (its table was never created in Production, so the switches showed disabled); Skills was a read-only list; Connectors were "Soon" rows, a Telegram "not ready" line, WhatsApp and Web Push | Web Push moved to Settings beside WhatsApp (already there); every tool is always listed | f28c2181 |
| `/api/plugins`, `lib/plugins` | only the hub used them | n/a | f28c2181 |
| `lib/chat/platformContext.ts` | unused; described "seven studios" with engines that do not serve them | Agent G and Live Voice already use `lib/chat/platformPrompt` | 79d9c507 |
| "Soon" rows in the sidebar search (Audio remix, Terminal) | one more thing to read that cannot be opened | not shown; Agent G still says what is not available when asked | this commit |
| VFX effects: locked "Motion 🔒" and "Swap 🔒" tabs (cut to "მოძრა…", "ჩანაცვ…" in Georgian) and their "Soon" engine rows | two closed tabs that repeated tools the sidebar already has (Motion transfer, Character swap) | VFX shows Scene only, with no tab bar; the tabs come back by themselves when the capabilities endpoint opens them | this commit |

Not removed, on purpose: the STUDIO_V2 API routes (`/api/generate`, `/api/estimate`, `/api/studio/models`) stay behind
their env flag, because their webhook and sweep must still finish or refund a job started while the flag was on.
**Owner:** unsetting `STUDIO_V2` in Vercel (if it is set in Production) turns them off; no UI calls them any more.

## 2. The menu after the change

```
Chat · New session · Search · Library · Persona            (Deep Research row only where the server enables it)
CREATE
  Video                 ▸ Product ad · Character swap · Motion transfer · VFX effects · Video remix · Video editing
    ♪ Music video       (new row, always shown; opens Video in music-video mode)
  Image & Photo         ▸ Photographer · Interior designer · Photo culling
  Avatar
  Music
  Voice & Audio         (Dubbing)
WORK
  Design                ▸ Presentation · 3D model
Settings (now also: notifications)
```

Also fixed while checking each panel (this commit): a sidebar pick made while the studio was still loading was lost
(the menu now writes the pick into the address when nobody answered, and the studio reads it on mount); the Video
format tile no longer shows "108…" at desktop widths; a long tool name in a panel header wraps to two lines instead of
being cut; the Film / Music video sub-lines are one short line in Georgian.

Renamed so a name says what the tool does (TOOL_META, the one source for sidebar, "+" sheet, panel header and Live Voice;
the catalog's search labels now say exactly the same in all three languages):
Remix → **Video remix**, VFX → **VFX effects**, Motion → **Motion transfer**, Montage → **Video editing** (ka: ვიდეოს
რემიქსი, VFX ეფექტები, მოძრაობის გადატანა, ვიდეოს მონტაჟი). Deep Research's "Connectors" row → **My documents**.

## 3. Service by service

| # | Service (sidebar) | What the user does | Clear now? | Changed today | Engine | Left for the owner |
|---|---|---|---|---|---|---|
| 1 | Chat / Agent G | asks, writes, codes, searches the web; Agent G runs the montage / URL-to-audio tasks | yes | none | google | AGENT_G_MEDIA_EXEC is off in Production |
| 2 | Video | idea → storyboard → film (Veo 3.1 Lite / Fast / Max) | yes | **Film / Music video switch at the top of the panel** (was hidden in two places) | google | none |
| 3 | Music video | song → vertical clip (Video in music-video mode, ×1.4 price) | **yes (new)** | own sidebar row + the switch | google | none |
| 4 | Product ad | product photo → ad reel | yes | none | google (Veo, then a Ken Burns still; Kling only with VIDEO_GOOGLE_ONLY=0) | none |
| 5 | Character swap | another face in a video | yes | none | violation (roop via Replicate; a miss refunds, no other engine) | action 9 / switch |
| 6 | Motion transfer | a photo moves the way you describe | **yes (renamed; the reference-video slot that never worked is gone, 12300b06)** | name | violation (Kling image-to-video via Replicate) | action 9 / switch; keep or retire (§5) |
| 7 | VFX effects | one-tap effects on a photo | **yes (renamed, locked tabs gone)** | name; only open modes are offered; the result now also lands in the chat | google (price gap R5: button quotes `remix`) | pricing table |
| 8 | Video remix | change a video you have: style, captions, voice | **yes (renamed)** | name | violation (restyle, background, character, redub reach NanoBanana / Kling / roop / sync; a miss refunds) | action 9 / switch; overlap decision (§5) |
| 9 | Video editing | trim, join, music over your clips | **yes (renamed)** | name | google (local FFmpeg) | none |
| 10 | Image | create and edit images | yes | none | violation (NanoBananaAI only; a miss may move only to Google's image model; Upscale / Edit on Replicate) | action 9 + image engine choice / switch |
| 11 | Photographer | studio photoshoot from your photos | yes (panel fit fixed b354a739) | none | violation (NanoBananaAI, as Image) | action 9 / switch |
| 12 | Interior designer | redesign a room from a photo | yes (panel fit fixed) | none | violation (NanoBananaAI renders; the 3D plan is Gemini) | action 9 / switch |
| 13 | Photo culling | pick the best shots; photos stay on the device | yes | none | on-device | none |
| 14 | Avatar | a photo speaks your text or voice | yes | old Lip-Sync studio removed | violation (HeyGen, or SadTalker when HeyGen is off; one engine per job, 0a01031e) | action 9 / switch |
| 15 | Music | a track, song or soundtrack | yes | MP3 picker on iPhone fixed (be5daacb) | violation (Auto = Lyria / ElevenLabs Music; Udio or MusicGen only when picked; cover, sampled voice, trained voice on Replicate) | action 9 / switch |
| 16 | Dubbing | your video in another language | yes | none | violation (ElevenLabs + Gemini, but the background split is Replicate Demucs, on by default) | pricing table (charges nothing); switch keeps the original bed |
| 17 | Presentation | slides from a topic | yes | none | google | route charges nothing yet: pricing table |
| 18 | 3D model (beta) | a 3D model from text or a photo | yes, marked beta | none | violation (Replicate TRELLIS) | action 9 / switch |
| — | Settings | language, theme, profile, usage, WhatsApp, **notifications**, referral, delete account | yes | Web Push card moved here | — | none |

Also fixed today for every service: chat history no longer multiplies on click (1621b920); downloads on an iPhone open the
share sheet so a picture or video can be saved to Photos (be5daacb); panels fit their column (b354a739).

## 4. Proof

- `tests/simplified-studio.spec.ts` (Playwright, local Chromium): `/en/studio` answers 307 to `/en`; `#film` → Video,
  `#lipsync` → Avatar, `#hub` → chat, hash dropped, no "Choose a service"; the sidebar has no Studio Beta and no
  Connectors / Plugins; the Music video row opens Video with Music video checked; the switch sits above the model card and
  a tap flips it (format follows to 9:16). 3/3 passed, and 6/6 with `--repeat-each=2`.
- `tests/vfx-genjutsu.spec.ts`: with only Scene open there is no tab bar, no Motion / Swap radio and no Motion / Swap
  engine row; with all three open the three tabs come back and Motion shows its video input.
- `tests/panels-fit.spec.ts`, `model-picker.spec.ts`, `chat-research.spec.ts`, `smoke.spec.ts`: see the run below.
- jest, the whole suite: 730 suites passed (1 skipped), 11 229 tests passed (5 skipped); `tsc --noEmit` clean. The
  schema-drift known-gap list shrank by one (`user_plugin_settings` is no longer called).
- Screenshots of every panel after the change: `/mnt/project-files/reports/2026-10-09-service-audit/`.

## 5. Still the owner's

1. Production deploy of all of the above (separate word).
2. Action 9: the `violation` engines in the table (Replicate, Higgsfield, HeyGen, Udio, NanoBananaAI, FLUX). The code for
   it is ready: setting `MEDIA_GOOGLE_ONLY=1` in Vercel and redeploying moves Image, Photographer and Interior to Google's
   image model and refuses (before any charge) the tools that have no Google engine yet; unsetting it is the rollback (§6).
3. The one pricing table: VFX price gap; Dubbing, Presentation and Upscale charge nothing; dialogue films and music
   videos charge 20 avatar credits per lip-sync pass on top of the film price (§6 gap 1).
4. `STUDIO_V2` env in Production: unset it to turn off the now-UI-less Higgsfield studio routes.
5. Video remix overlaps three tools: its "Change character" repeats Character swap, "Redub (lip-sync)" is close to
   Dubbing, and "Trim" and "Music" repeat Video editing. Left as it is, because each op has its own engine and price
   today; the owner picks whether remix keeps them or sends the user to the dedicated tool.
6. Optional: drop the unapplied `supabase/migrations/20261003e_user_plugin_settings.sql` (never applied; nothing reads it now).

## 6. End-to-end trace of the 22 catalog services (finalization, 2026-10-09 21:29Z ask, item 1)

Each service was followed in the code from the tap to the Library row: UI → Agent G → API → provider / worker → credits →
result → Library. File references are to the cert branch after f23c3353; the full table with line numbers is in
`/mnt/project-files/reports/2026-10-09-service-trace.md`.

**How Agent G reaches a service.** Four doors, and only one of them starts a paid render on its own words:
- **Confirm card** (lib/chat/focusGate → `confirmGate` in OmniStudio): image, music, avatar and video orders typed in the
  chat show Agent G's card with the price; nothing renders until the user taps Create.
- **Catalog router** (lib/catalog/agentRoute) and **studio intent** (lib/chat/studioIntent): open the right tool,
  prefilled. They never render.
- **Live Voice** `start_generation` (lib/voice/liveTools): asks the same panels to run.
- **Agent G tools** (lib/agent/tools/registry): read, prepare and quote; the only executable actions are `montage_run`
  and `audio_extract_run`, behind `AGENT_G_MEDIA_EXEC` (off in Production, admin-only on Preview).
- **A video attached in the chat plus an edit sentence** ("make it black and white") classifies the op. A free op
  (trim, captions, colour, speed, stabilise) runs at once; a charged one (music, character, background, voiceover,
  redub, restyle: 15 credits) now waits for Agent G's Create card with the price on it, and nothing is uploaded or
  charged before the tap (gap 4, fixed; one list of charged ops in `lib/video/remixCharge.ts`, shared with the route).

**Proof level.** No service is PROVEN end to end: every Playwright spec mocks its generation route and every route test
mocks its provider and ledger. What is PROVEN live is listed in PROJECT_MASTER (auth, admin, Veo inference, the Agent G
montage stop and MP4 in the database). So the labels below are BUILT_NOT_PROVEN at best.

| # | Service | UI → Agent G | API | Engine today (with `MEDIA_GOOGLE_ONLY=1`) | Credits | Result → Library | Label |
|---|---|---|---|---|---|---|---|
| 1 | video.generate | Video panel; chat video order → storyboard (its own price); card; Live Voice | `/api/film/storyboard` → `/api/chat/orchestrate` → `/api/video/assemble` | Veo + Gemini + ElevenLabs; a dialogue scene adds a HeyGen talking head when HeyGen is configured, one engine, no fallback (switch: skipped) | charged up front (filmComposite), refunded per failed clip | Director console → chat player → `recordCompletedFilm` | BUILT_NOT_PROVEN |
| 2 | video.music-video | Video panel, Music video switch or sidebar row | same | as #1 plus HeyGen singer close-ups (switch: skipped) | film price ×1.4, **plus 20 avatar credits per lip-sync pass** | same | BUILT_NOT_PROVEN |
| 3 | video.product-ad | Product ad tab; router | `/api/video/remix` `productad` | Veo, then a Ken Burns still; Kling only with `VIDEO_GOOGLE_ONLY=0` | 15, refunded on a miss | chat player → `vremix:*` row (one row now) | BUILT_NOT_PROVEN |
| 4 | video.character-swap | Swap tab; router | `/api/video/remix` `character` | roop on Replicate; a miss refunds, no second engine (switch: refused before charge) | 15, refund on miss | chat player → `vremix:*` row | BLOCKED_OWNER |
| 5 | video.motion | Motion panel; router | `/api/motion-control` + `/status` | Kling image-to-video on Replicate (switch: refused) | charged, refunded on miss | chat player → `recordCompletedAsset` | BLOCKED_OWNER |
| 6 | video.vfx | VFX panel; router | `/api/genjutsu/generate` + `/status` | Veo scene (Higgsfield modes off behind flags) | genjutsu pricing; refund on miss | panel **and now the chat** → `recordCompletedFilm` | BUILT_NOT_PROVEN |
| 7 | video.remix | Remix panel; router; chat video + sentence (price card for a charged op) | `/api/video/remix` | trim, captions, voiceover, music: ffmpeg + ElevenLabs. Restyle, background, character, redub: NanoBanana / Kling / roop / sync, a miss refunds (switch: these four refused) | 15, refund on miss | chat player → `vremix:*` row | BLOCKED_OWNER |
| 8 | video.editing | Video editing studio; studio intent; Agent G montage card (flag) | `/api/v2/montage/render`; `/api/agent/media/montage` | ffmpeg in the app | free in the studio and free in Agent G (owner's "უფასო", `MONTAGE_PRICE_CREDITS = 0`) | chat player → `completeJob` | BUILT_NOT_PROVEN (Agent G stop + MP4 PROVEN in DB) |
| 9 | image.generate | Image panel; chat image card; Live Voice | `/api/nanobanana/image` | NanoBananaAI; chat images: FLUX, a miss moves only to Google's image model (switch: Google image model only). Upscale and Edit: Replicate (switch: refused) | per image, refund on miss; **Upscale charges nothing** | image bubble → `recordCompletedAsset` | BLOCKED_OWNER |
| 10 | image.photoshoot | Photographer panel; router | `/api/nanobanana/image` | as #9 | as #9 | result pane → `recordCompletedAsset` | BLOCKED_OWNER |
| 11 | image.interior | Interior designer panel; router | `/api/nanobanana/image`; 3D plan `/api/orchestrator/interior/produce` | renders as #9; the plan is Gemini | images as #9; plan reserved and refunded | renders filed; the 3D plan is filed with the render it was made for and opens on its Library card (a504519c) | BLOCKED_OWNER |
| 12 | image.culling | Photo culling; not callable by Agent G | none (on-device worker) | none | free | stays on the device, by design | BUILT_NOT_PROVEN |
| 13 | avatar.talking | Avatar tool; studio intent; card; Live Voice | `/api/heygen/presenter`, `/api/video/lipsync` | ElevenLabs voice + HeyGen, or SadTalker when HeyGen is off; one engine per job, no fallback (switch: refused) | charged, refunded on miss | chat player → `recordCompletedFilm` | BLOCKED_OWNER |
| 14 | music.generate | Music panel; card; Live Voice | `/api/ai/music` | Auto = Lyria (Georgian song: ElevenLabs Music, no MusicGen fallback). Udio / MusicGen when picked; cover, sampled voice, trained voice on Replicate (switch: refused) | charged, refund on miss; a missed trained voice is now said | track player → `recordCompletedAsset` | BLOCKED_OWNER |
| 15 | music.remix | none; Agent G says "not available" | none | none | none | none | MISSING |
| 16 | voice.dubbing | Dubbing panel; studio intent | `/api/v2/dubbing/start` | ElevenLabs Scribe + TTS, Gemini translation; Demucs on Replicate for the background (switch: keeps the ducked original) | **charges nothing** | panel + chat → `completeJob` | PARTIAL |
| 17 | text.write | chat | `/api/chat/gemini` | Gemini (Anthropic only with `AI_GOOGLE_ONLY=0`) | free, daily caps | chat history, not the Library | BUILT_NOT_PROVEN |
| 18 | design.presentation | Presentation panel; studio intent; Live Voice | `/api/v2/presentation/build` | Gemini outline + Imagen | **charges nothing** | ZIP + chat summary → `completeJob` | PARTIAL |
| 19 | design.model3d | 3D panel; studio intent; Live Voice | `/api/v2/model3d/create` + `/status` | TRELLIS on Replicate (switch: refused) | reserved, refunded on miss | 3D viewer + chat link → `completeJob` | BLOCKED_OWNER |
| 20 | code.assistant | chat | `/api/chat/gemini` | Gemini; no sandbox yet | free, caps | chat history | BUILT_NOT_PROVEN |
| 21 | code.terminal | none; Agent G says "not available" | none | none | none | none | MISSING |
| 22 | research.web-search | chat; Agent G `web_search` | `/api/chat/gemini` | Gemini Google Search grounding | free, caps | chat + sources | BUILT_NOT_PROVEN |

BLOCKED_OWNER: every hop exists, but a non-allowed provider runs under default settings. The code to stop that is the
switch; turning it on is the owner's action 9.

### Gaps found, and where each stands

| # | Gap | Status |
|---|---|---|
| 1 | Dialogue films and music videos charge 20 avatar credits per lip-sync pass on top of the film price, and the music-video ×1.4 already claims to cover that leg (`videoPricing.ts`) | **owner decision** (price): proposed fix is a film token that lets lip-sync skip its own charge for the passes a paid film makes |
| 2 | Dubbing, Presentation and Upscale spend on paid providers and charge nothing | **owner decision** (the one pricing table) |
| 3 | Outside engines fell back to other outside engines (HeyGen → SadTalker, roop → NanoBanana + Kling, image FLUX → NanoBanana → Grok, ElevenLabs Music → MusicGen) | **fixed** (0a01031e, 15ae21e2, 97f949f2, 35a010ab): one engine per job, a miss refunds or moves only to Google |
| 4 | A video attached in chat plus an edit sentence starts a paid remix with no confirm card | **fixed**: a charged op shows Agent G's Create card with the op and the price; Create uploads and runs it once, Edit puts the words and the clip back (`lib/video/remixCharge.ts`, OmniStudio; `tests/chat-attachments.spec.ts`). "ფონი მოაშორე" is now read as an edit too (`lib/chat/videoIntent.ts`) |
| 5 | Motion transfer offered a reference-video slot that never left the browser | **fixed** (12300b06); whether to keep the tool at all (Veo image-to-video does the same) is an **owner decision** |
| 6 | A missed trained-voice conversion shipped the AI vocal as the user's voice | **fixed** (8926ce5b) |
| 7 | Remix, swap and product ad filed every result twice in the Library | **fixed** (f23c3353): the Library answers "already filed" for a file of ours that a row already holds |
| 8 | VFX results stayed in the panel | **fixed** (f23c3353): posted to the chat once |
| 9 | Three names for one tool (sidebar, catalogue search, chat lines) | **fixed** (f23c3353): one name per tool from TOOL_META, KA/EN/RU, pinned by a test |
| 10 | Catalog engine notes out of date (Grok / FLUX, Claude, Higgsfield, product ad, dubbing) | **fixed** (f23c3353) |
| 11 | Agent G montage charged where the studio montage is free | **closed** by the owner's "უფასო" (price 0) |
| 12 | The interior 3D plan is never filed to the Library | **fixed** (a504519c): the plan is filed with the render it was made for as its picture (the caller's own object or a public CDN file, checked); `/library` shows it on the Image tab with a „3D plan" badge and opens it on the card; the Video tab now also lists avatar videos; room photos that point inside the network are dropped before Gemini sees them |
| 13 | No service has a real end-to-end test; dubbing, presentation and interior-produce routes have no route tests | **partly fixed**: route tests for interior-produce (8: charge once, refund on a miss, filing, cover owner check, SSRF), dubbing (16: sign-in, own-upload signing, another account's upload refused, SSRF, 5-minute cap, budget gate, failure filing, job-id reuse) and presentation (12: the whole deck filed, cover fallback, degraded-deck warnings, limits, budget gate); a mocked browser test for render → 3D plan → Library (`tests/interior-plan.spec.ts`). Still open: a real end-to-end run on Preview (the run sheet, item 3, covers Agent G montage, URL-to-Audio and the Task API) |
| 14 | VFX button quotes `remix` while the route prices with `lib/genjutsu/pricing` (R5) | **owner decision** (pricing table) |
