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
decision (action 9: "not now"), so no engine was touched here.

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
| 4 | Product ad | product photo → ad reel | yes | none | violation (Kling via Replicate leg) | action 9 |
| 5 | Character swap | another face in a video | yes | none | violation (roop via Replicate) | action 9 |
| 6 | Motion transfer | a photo moves like a reference video | **yes (renamed)** | name | violation (Kling via Higgsfield / Replicate) | action 9 |
| 7 | VFX effects | one-tap effects on a photo | **yes (renamed, locked tabs gone)** | name; only open modes are offered | google (price gap R5: button quotes `remix`) | pricing table |
| 8 | Video remix | change a video you have: style, captions, voice | **yes (renamed)** | name | violation (some ops reach Kling / Replicate) | action 9; overlap decision (§5 item 5) |
| 9 | Video editing | trim, join, music over your clips | **yes (renamed)** | name | google (local FFmpeg) | none |
| 10 | Image | create and edit images | yes | none | violation (NanoBanana → Grok → FLUX) | action 9 + image engine choice |
| 11 | Photographer | studio photoshoot from your photos | yes (panel fit fixed b354a739) | none | violation (same cascade) | action 9 |
| 12 | Interior designer | redesign a room from a photo | yes (panel fit fixed) | none | violation (same cascade) | action 9 |
| 13 | Photo culling | pick the best shots; photos stay on the device | yes | none | on-device | none |
| 14 | Avatar | a photo speaks your text or voice | yes | old Lip-Sync studio removed | violation (HeyGen; Replicate fallback) | action 9 |
| 15 | Music | a track, song or soundtrack | yes | MP3 picker on iPhone fixed (be5daacb) | violation (Lyria → ElevenLabs Music → Udio) | action 9 (Udio leg) |
| 16 | Dubbing | your video in another language | yes | none | google + ElevenLabs | route charges nothing yet: pricing table |
| 17 | Presentation | slides from a topic | yes | none | google | route charges nothing yet: pricing table |
| 18 | 3D model (beta) | a 3D model from text or a photo | yes, marked beta | none | violation (Replicate TRELLIS) | action 9 |
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
2. Action 9: the `violation` engines in the table (Replicate, Higgsfield, HeyGen, Udio, NanoBanana/Grok/FLUX).
3. The one pricing table: VFX price gap, Dubbing and Presentation charge nothing.
4. `STUDIO_V2` env in Production: unset it to turn off the now-UI-less Higgsfield studio routes.
5. Video remix overlaps three tools: its "Change character" repeats Character swap, "Redub (lip-sync)" is close to
   Dubbing, and "Trim" and "Music" repeat Video editing. Left as it is, because each op has its own engine and price
   today; the owner picks whether remix keeps them or sends the user to the dedicated tool.
6. Optional: drop the unapplied `supabase/migrations/20261003e_user_plugin_settings.sql` (never applied; nothing reads it now).
