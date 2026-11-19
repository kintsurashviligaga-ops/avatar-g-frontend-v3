# BEFORE_UI_INVENTORY — Chat-First Unified Service Experience (Phase 0)

Task: GG's P0 master task "Chat-First Unified Service Experience" (2026-10-25).
Audited commit: `main` = Production = `c12ec78f` ("Mic: Russian speech is no longer written in English (#200)"),
production deployment `avatar-g-frontend-v3-oowgfz364` (GitHub deployments API, env Production, 2026-10-25 11:27Z).

## 0. How the evidence was gathered (and what was not)

| Check | Done? | How |
|---|---|---|
| `main`, open PRs, Production SHA | yes | `gh api` deployments + pulls. Production SHA = `main` HEAD, so "Production vs GitHub code" has no drift today. |
| Open `https://myavatar.ge/ka` | **no** | The cloud environment's egress proxy refuses both `myavatar.ge` and the `*.vercel.app` deployment host (connect_rejected). |
| Baseline screenshots | yes, **locally** | `next dev` of the exact Production commit, guest session, Supabase pointed at a dummy host. 99 PNGs, 6 viewports, in `/mnt/project-files/unified-composer/before/`. Same code as Production, not the live site: live data (balance, history, real auth) is absent. |
| Signed-in baseline | **no** | No Production login is possible from here. To do on the Preview with the email-code login, or by GG on the iPhone. |
| Paid actions | not run | No generation was started (no budget approved for this task). |

Screenshot names: `01-home`, `02-plus-sheet`, `10-<tool>` (tool selected by `?tool=`), `11-<tool>-settings-toggled`
(after the composer's settings button), each `-<w>x<h>` for 375×667, 390×844, 768×1024, 1024×768, 1440×900, 1920×1080.

## 1. The shape of the studio today

```
app/[locale]/page.tsx → FilmStudioHome → ServiceHub (135 lines)
  └─ ChatChrome (1,649)  top bar, left sidebar (desktop), drawer (phone), Live voice entry, model switcher
       └─ OmniStudio (12,703)  the thread, the composer, the „+" ToolSheet, every tool's settings, every send path
            ├─ settings surface: desktop = right <aside> 300/340 px (panelOpen) · phone = portaled sheet (optionsOpen)
            │    └─ settingsBody: ImageCreatePanel · VideoCreatePanel · MusicCreatePanel · Interior/Photoshoot panels ·
            │         inline Avatar (lipsync) block · product block · GenjutsuPanel (VFX) · remix block · ServiceParamsPanel (3D …)
            ├─ centre "desks" on desktop: ImageDesk / VideoStage "Result + Models & prices" / MusicCentrePane
            └─ full workspaces that replace the studio: MontageStudio, SurgicalEditor, PhotoWorkspace, ImageWorkspace
```

**Composer duplication (task §2).** `components/chat/composer/UnifiedComposer.tsx` (415 lines, render-only, with its own
`useAttachments` / `useDictation` hooks and a unit test) is **not mounted anywhere in the app**; only its test and a
prompt test import it. The live composer is inline JSX in `OmniStudio.tsx` ≈ lines 11761–12380 (`data-testid="composer-bar"`).
`useDictation` **is** used by OmniStudio (`dictation.markTyped()`), so the hooks are shared and the markup is not.

Recommendation for Phase 1: keep OmniStudio's composer as the stable base (it carries every send path, the Live slot,
the queued-job Stop, the attachment tray with upload %, IME handling via Ctrl/⌘+Enter, persona chip, the onboarding
`data-tour` hook) and extract its pieces into the new components one at a time, rather than swapping in
UnifiedComposer, whose props do not cover the tool chip, quick settings, the job Stop or the persona chip. UnifiedComposer's
IME guard and label table are worth folding in.

## 2. Service lists (three registries + two hard-coded hide lists)

| Source | What it holds | Who reads it |
|---|---|---|
| `lib/studio/tools.ts` | `ToolId`, `PRIMARY_TOOLS` (chat, video, image, interior, music, avatar), `MORE_TOOLS` (product, vfx, montage, model3d), names/sub-lines ka/en/ru, icons | everything |
| `lib/catalog/services.ts` | THE catalog: 25 service definitions, status (live/beta/coming-soon/hidden), quote key, auth, aliases | `lib/catalog/nav.ts` → sidebar + „+" sheet sections; Agent G intent |
| `lib/services/serviceCatalogue.ts` | the older "ten services" list with `live` flags and routes | OmniStudio `liveTool()` (disables a row in the „+" sheet) |
| `lib/catalog/nav.ts` `HIDE` | swap, photo, photoshoot, motion, dubbing, presentation | sidebar + sheet |
| `OmniStudio.tsx:12698` | the same six ids, inlined again | „+" sheet |

What the „+" sheet shows today (all six viewports, guest): **ჩატი · ვიდეო · პროდუქტის რეკლამა · VFX · მონტაჟი · სურათი ·
ინტერიერი · 3D · ავატარი · მუსიკა** — grouped by catalog category (Agent G / Video / Image & Photo / Avatar / Music).
No row was disabled. 3D is `beta` in the catalog and shows like the others. Hidden tools (swap, photoshoot, motion,
dubbing, presentation, photo, remix) do not appear. No user-permission or runtime-flag filter is applied to the sheet:
availability is static code, not `/api/...` capability or the user's role.

Phase 1 must derive the picker from `lib/catalog/services.ts` (+ the tool metadata) and delete the two inline hide lists,
not add a fourth registry (task §6).

## 3. Selecting, configuring and closing a service today

| Step | Phone (< 1024 px) | Desktop (≥ 1024 px) |
|---|---|---|
| Pick | „+" opens `ToolSheet` (BottomSheet). A pick closes it and switches the tool. | Same sheet, or the left sidebar's tool rows (ChatChrome). |
| What the composer shows | A pill `[icon name ▾][⚙][✕]` (tool switcher, settings, back to chat). Placeholder changes per tool. | Same pill, plus a text summary on ⚙ (e.g. `9:16 · 24წმ`). |
| Settings | ⚙ opens a **full-height sheet that hides the composer and the conversation** (`composer-bar` gets `hidden` while `optionsOpen`). Music and Interior open this sheet **by themselves** on selection. | ⚙ opens a **right column (300/340 px)**. Interior opens it by itself. Image/Video/Music also replace the centre with a "desk" (Result pane + Models & prices table). |
| Close | sheet ✕ / swipe; pill ✕ returns to chat | column ✕, header ⚙ toggle, pill ✕ |
| Conversation | **Every tool has its own session** (`switchToolSession`, `myavatar:tool-sessions:<uid>`): picking another tool saves this thread and opens that tool's thread (or a fresh one). Not while something renders, not during a Live call. | same |

Screenshots: `11-video-settings-toggled-390x844.png` (sheet covers everything), `11-video-settings-toggled-1440x900.png`
(right column), `10-music-390x844.png` (Music sheet opens on its own), `10-video-1440x900.png` (video desk).

## 4. Per-service inventory — what must move into the composer

Legend: **Q** = quick setting (chip in the composer), **A** = advanced layer, **S** = stays a larger surface opened from
the chat, **R** = result card in the thread. "Bound to" is the OmniStudio state the request already reads.

### Chat / Agent G (`chat`)
- Today: clean composer (no tool pill), attach (all kinds), mic (`useDictation`), Live slot, persona chip, model switcher
  in the header (ChatChrome `model-switcher`), Deep Research/Connectors extras (empty today), Agent G gate cards with price.
- Keep exactly. No generation chips in chat mode (task §4).

### Video (`video`, `videoTab='cinema'`) — `components/studio/create/VideoCreatePanel.tsx`
| Control | Bound to | Today | Target |
|---|---|---|---|
| Film / Music video | `videoMode` | segmented, top of panel | Q (video type) |
| Length | `seconds` (VideoDurationSheet) | tile | Q |
| Format | `format` (VideoFormatSheet) | tile | Q |
| Quality = model (Veo 3.1 Lite/Fast/Std, priced) + "Other models…" ModelPicker | model pick (`useModelPick`) | select | Q (model ▾) |
| Sound (narration) + narrator gender | `narration`, `narratorGender` | switch | A |
| Music | `music` | switch | A |
| Subtitles (film) | `subtitles` | switch (paused server-side per GG 2026-10-22: no word timings) | A, only if it really reaches the render |
| Lip-sync (music video, priced add-on) | `lipsync` | switch | A |
| Reference photos (0/N, one per scene) + soundtrack | `refs.images`, `refs.audio` | tiles | Q (attach) |
| Storyboard, scene edit, approve, render progress | storyboard state, job queue | in the thread (SceneTile, GenerationProgress) | R — already in the conversation |
| Price | `videoQuote` → `quoteCredits` | on composer Send | unchanged |

### Image (`image`) — `ImageCreatePanel.tsx` (+ `ImageDesk` on desktop)
- Prompt (shared with composer text), reference upload (max = what the route takes: 1), templates gallery, aspect
  (10 ratios), count ×1/×2/×4, style (13), negative prompt, model (one Google row; others dimmed/paused), Script →
  Storyboard slot, Generate with `quoteCredits({tool:'image',count})`.
- Target: Q = format, count, style, model, reference; A = negative prompt, templates, storyboard slot.
- Results: ImageDesk result pane / thread bubbles with open, download, share, upscale, reroll, edit, to-video, save,
  editor, cancel — keep as R in the thread.

### Music (`music`) — `MusicCreatePanel.tsx` (+ `MusicCentrePane`)
- Simple | Advanced, description (= composer text), lyrics, instrumental, style chips + text, vocal gender, weirdness,
  style influence, length, tempo, templates, + Audio / + Voice (attachments), engine pill, Create with price.
- Today the panel **duplicates the prompt box** (its own "describe the song" textarea is the composer's text) and on a
  phone opens on its own, covering the chat.
- Target: Q = instrumental/vocal, style, length; A = lyrics, tempo, sliders, vocal gender, templates; attach = audio ref.
  R = inline audio player with download/share/reroll/save/edit/music-video (exists as `musicActions`).

### Avatar (`avatar`, `mode='lipsync'`) — inline JSX in OmniStudio ≈ 10870–10990
- Face (upload / presenter templates / "my twin" card when `NEXT_PUBLIC_TWIN_ENABLED`), voice Auto/Female/Male, format
  9:16/16:9/1:1, my audio (upload / record / "my voice" when trained), price `avatarCredits`.
- Target: Q = avatar (face) picker, voice, format; attach = face/audio. Consent, twin, Live Avatar enrollment and the Live
  call stay untouched (owned by the Live Avatar thread, PRs #188–#191, #194, #198, #203).

### Interior (`interior`) / Photographer (`photoshoot`, hidden) — `InteriorCreatePanel` via `useShootStudio`
- Own photo upload card, style presets, room type…, opens its panel on selection (both form factors).
- Target: same chip architecture; photos via the composer's attach.

### Product ad (`product`, `videoTab='product'`)
- Product photo (composer attach → `productPhotoRef`), duration, quote `quoteCredits({tool:'product',seconds})`, runs
  through the Cap-3 queue (Run stays beside Stop).

### VFX (`vfx`, `videoTab='vfx'`) — `GenjutsuPanel`
- Effect gallery (≈1,240 px tall skeleton), one photo → 8 s scene. Target: effect ▾ chip + attach; the gallery is A.

### Montage (`montage`) — `MontageStudio` (full workspace)
- Selecting it **replaces the composer** (screenshot run: `composer-bar` never attached for `?tool=montage`). Target: S —
  an expandable workspace opened from the chat, with the composer kept.

### 3D (`model3d`, beta) — `ServiceParamsPanel` + `GlbViewer`
- Text or photo mode, prompt, own submit button (plain fetch to the v2 route). Target: Q = mode; viewer is S.

### Retired / hidden (must stay invisible): swap, motion, dubbing, presentation, photo culling, photoshoot, remix.

## 5. Billing, jobs and state (must not regress)
- Price shown = `lib/credits/quote.ts quoteCredits`, the function the server charges with; quote token v2 (#122),
  fail-closed budget (#121). Paid sends go through Agent G's gate card or a priced Send (`send({explicit})`).
- Jobs: `useJobQueue` (queued/rendering), JobTray, `cancelQueueJob`, `composer-stop-job`; tool switches are blocked from
  swapping the thread while anything renders.
- Persistence: localStorage conversations + server sessions (`/api/chat` sessions, `myavatar:chat-session-map`),
  `?tool=` deep link, `omni:set-tool` / `omni:tool-changed` events, `<html data-tool>`.
- Dictation: `useDictation` must keep `requestMicRelease('dictation')` from PR #203 (Live thread, 2026-10-25).

## 6. Findings that need GG's call or are known gaps
1. **One conversation vs one per tool.** The new task says the user stays in the same conversation when a service is
   picked; today each tool deliberately opens its own session (an earlier owner decision, commented in OmniStudio).
   This is a product reversal → decision card.
2. The phone settings sheet hides the conversation and the composer; Music and Interior open it unasked.
3. Desktop uses a persistent-capable right column and a centre "desk" that replaces the thread for Image/Video/Music.
4. Availability is static: no runtime flag or role filter on the picker; 3D (beta) looks like a live service.
5. Two inline copies of the hide list; three registries.
6. Video "Subtitles" switch: film subtitles were paused server-side (GG 2026-10-22). Must be verified before it is shown
   as a working quick control.
7. Montage drops the composer entirely.
8. `tests/ui-image.spec.ts` has one test that already fails on `main` (phone composer after the sheet closes).
