# PHASE 1 — Design & architecture: the unified service composer

Inputs: GG's task (2026-10-25), [BEFORE_UI_INVENTORY.md](./BEFORE_UI_INVENTORY.md), GG's decision 2026-10-25 12:15Z:
**one conversation** — picking a service never opens another session.

## 1. Principles
1. **Reorganise, never replace.** Every control below already exists and is already bound to OmniStudio state that the
   request reads. The new components are views over that state; `send()`, `runTool()`, the quote, the gate cards, the
   job queue and the routes do not change.
2. **One source of services.** The picker is derived from `lib/catalog/services.ts` (status, auth, quote key) +
   `lib/studio/tools.ts` (icon, names). The two inline hide lists become one exported `HIDDEN_TOOLS` in `lib/catalog/nav.ts`.
   No new registry. `lib/services/serviceCatalogue.ts` keeps feeding only the `live` flag until it can be folded in.
3. **Real or absent.** A control appears only if its value reaches the request (verified by a wiring test per control).
   Disabled/hidden/not-yet-released services and models are not shown as available.
4. **The chat stays visible.** No surface for a standard operation covers the conversation. Only complex editors
   (Montage timeline, 3D viewer, Image studio, Surgical editor) open as an expandable workspace, and they keep the thread,
   the files and the job state.

## 2. Components (all new files are small views; OmniStudio passes state + setters)

| Component | File | Role | Reuses |
|---|---|---|---|
| `UnifiedServiceComposer` | `components/chat/composer/UnifiedServiceComposer.tsx` | The pill: attachments tray · textarea · control row. Extracted from OmniStudio's inline JSX (≈11761–12380) **in place**, same testids (`composer-bar`, `composer-input`, `plus`, `composer-attach`, `options-toggle`), so the 30+ existing specs keep passing. | OmniStudio markup, `useDictation` (keeps `requestMicRelease` from #203), UnifiedComposer's IME guard |
| `ServicePicker` | `components/chat/composer/ServicePicker.tsx` | „+": bottom sheet on phones, anchored popover ≥ 1024 px. Groups **მთავარი** (Chat/Agent G) · **შექმნა** (video, image, music, avatar, interior) · **დამატებითი** (product, VFX, montage, 3D). | `ToolSheet` row markup, `BottomSheet`, `toolGroups()` |
| `ActiveServiceChip` | `…/ActiveServiceChip.tsx` | `[icon name ▾ ✕]` — ▾ reopens the picker, ✕ returns to chat (one button, 44 px). Replaces today's three-part pill. | today's pill |
| `ServiceQuickSettings` | `…/ServiceQuickSettings.tsx` | A single horizontally scrollable row of compact chips under the textarea (`ვიდეო ▾ · 9:16 ▾ · 8 წმ ▾ · Veo 3.1 Fast ▾ · ⋯`). Each chip opens its existing picker (OptionPicker / VideoDurationSheet / VideoFormatSheet / ModelPicker). One row on phones, never wraps into more height. | `OptionChip` (made 36 px visual / 44 px hit area), the pickers |
| `ServiceAdvancedSettings` | `…/ServiceAdvancedSettings.tsx` | „მეტი პარამეტრი" (`⋯` chip): a compact layer **anchored to the composer** — on phones a half-height sheet (max 60 dvh) that leaves the composer and the latest messages visible; on desktop a popover above the composer (max 420 px tall), not a side column. | `BottomSheet` snap height, existing panel rows (VideoSwitch, VideoSettingRow…) |
| `ServiceAttachmentPicker` | (the existing paperclip + `attachTarget`) | Unchanged routing per tool; the tooltip says what this service takes; attachment chips show which input each file feeds. | `attachTarget`, `routeAttach` |
| `ServiceActionButton` | the trailing slot | Live / Send-with-price / Stop, as today (one slot). The label carries the quote: `ვიდეოს შექმნა · ✦ 217`. | `runLabel`, `quoteCredits` |
| `ServiceResultCard` | existing bubbles | Image/video/music/avatar results stay in the thread with their action rows; the desktop "desks" (ImageDesk, VideoStage, MusicCentrePane) stop replacing the thread for standard use. | existing |

## 3. The typed control description — `lib/studio/serviceControls.ts`

Pure, client-safe, keyed by `ToolId`, and **referencing** the catalog rather than copying it:

```ts
type ControlId = 'videoMode' | 'seconds' | 'format' | 'videoModel' | 'narration' | 'music' | 'subtitles' | 'lipsync'
  | 'imgAspect' | 'imgCount' | 'imgStyle' | 'imgModel' | 'negative' | 'musicKind' | 'musicStyle' | 'musicSeconds'
  | 'tempo' | 'lyrics' | 'vocal' | 'avatarFace' | 'avatarVoice' | 'avatarFormat' | 'productSeconds' | 'vfxEffect'
  | 'model3dMode' | …;
interface ControlSpec<V> {
  id: ControlId;
  tier: 'quick' | 'advanced';
  label: L10n;
  options: (ctx: ControlCtx) => readonly { value: V; label: L10n; locked?: boolean }[]; // from the server-backed lists
  defaultValue: V;                       // = today's OmniStudio default
  requestField: string;                  // the field send() puts it in — asserted by a wiring test
}
interface ServiceControls {
  tool: ToolId;
  service: string;                       // canonical catalog id → status, authRequired, pricingKey
  controls: readonly ControlSpec<unknown>[];
  accepts: readonly ('image' | 'video' | 'audio' | 'document')[];   // = attachTarget
  quote: (v: ControlValues) => QuoteInput;                          // → quoteCredits (same as the server)
  action: L10n;                                                     // the Send label
}
```
- Option lists come from the existing sources: `VIDEO_DURATION_STOPS` + `/api/video/engine` capabilities, `IMG_ASPECTS`,
  `IMG_COUNTS`, `IMG_STYLES`, the catalogue's model rows (`pickerRows`, paused rows excluded), `useMusicEngines`.
- Server-side validation stays where it is (each route); the spec does not duplicate it. A unit test checks every
  option the spec can produce against the route's accepted set where that set is exported.
- OmniStudio binds `ControlValues` to its existing `useState`s through one adapter (`useServiceControlValues`), so no
  state moves and no persistence changes.

## 4. Service mapping (quick → advanced)

| Service | Quick chips | Advanced (`⋯`) | Attach | Bigger surface |
|---|---|---|---|---|
| Chat / Agent G | — (persona chip, model in header, mic, Live as today) | — | everything | — |
| Video | type (Film / Music video) · format · length · model (Veo tier, priced) | narration + voice · music · lip-sync (music video) · subtitles **only if verified to reach the render** | reference photos (scene anchors) · soundtrack | storyboard/approve/progress stay in the thread |
| Image | format · count · style · model | negative prompt · templates · Script → Storyboard | 1 reference | Image studio (own link) |
| Music | instrumental / vocal · style · length | lyrics · tempo · vocal gender · weirdness / style influence · templates · Simple/Advanced goes away | audio reference / voice | — |
| Avatar | avatar (own enrolled twin, presenters, upload) · voice · format | my audio (upload / record / my voice) | face photo · audio | Live call untouched |
| Interior | room / style chips from `InteriorCreatePanel` | the rest of its panel | room photos | — |
| Product ad | length (8/24/48) | — | product photo | — |
| VFX | effect ▾ (top effects) | full effect gallery | 1 photo | — |
| Montage | — | — | clips | MontageStudio as an expandable workspace **with the composer kept** |
| 3D (beta, tagged) | text / photo mode | — | photo | GlbViewer in the thread |

## 5. Layout
- **Phone (mobile first):** composer always on screen, `env(safe-area-inset-bottom)` and `dvh`/VisualViewport keyboard
  offset (the existing ChatChrome `visualViewport` height and `--kb-inset`). Quick row = one line, horizontal scroll with fade. Advanced = sheet ≤ 60 dvh,
  swipe-down/Escape/✕ closes, focus returns to `⋯`. Every hit area ≥ 44×44.
- **Desktop:** centred thread (max ≈ 820 px), composer under it; picker and advanced are popovers anchored to the
  composer; **no right settings column, no centre desk replacing the thread** for standard operations. The header ⚙
  (`settings-panel-toggle`) goes.
- Music and Interior stop opening a sheet on selection.

## 6. One conversation (GG 12:15Z)
`selectTool` stops calling `switchToolSession`: the tool changes, the thread stays. The `myavatar:tool-sessions` map is
no longer written; existing per-tool sessions stay in History untouched (nothing deleted). History titles keep the tool
of the first message. Running jobs, Live-call guard and gate cards are unaffected (they already lived in one thread).

## 7. Unsaved state
Values are OmniStudio state, so switching tools keeps each tool's settings for the visit (as today). The draft prompt
stays in the composer across a switch. Leaving a filled Advanced layer simply closes it (values kept) — no data loss,
so no warning dialog is needed; a warning is added only where a switch would drop something (the Montage workspace
with unsaved edits, which already has its own guard — to be verified in Phase 4).

## 8. Billing safety
No route, quote or charge path changes. The Send label shows `quoteCredits(spec.quote(values))`, the same call the
gate card and the server use; the existing priced-confirm gate stays. Wiring tests assert, per service, that the quick
values on screen equal the values in the request body and in the quote input (mocked fetch, no paid call).

## 9. Delivery plan (one branch `claude/unified-composer`, draft PR #204, commits in this order)
1. `serviceControls.ts` + hidden-list dedupe + unit tests (no UI change).
2. One conversation (selectTool without session swap) + test.
3. Extract `UnifiedServiceComposer` from OmniStudio with identical output (snapshot/spec parity).
4. `ServicePicker` (sheet/popover, three groups) + `ActiveServiceChip`.
5. `ServiceQuickSettings` + `ServiceAdvancedSettings` for Video, then Image, Music, Avatar, the rest.
6. Remove the right column / phone full sheet / auto-open from the standard flow; Montage keeps the composer.
7. i18n pass (ka/en/ru), a11y (aria-expanded, Escape, focus return), Playwright matrix (10 scenarios × 6 viewports),
   rollback row 85 in MIGRATION_ROLLBACK.md, Preview check, final report.

Open item for Phase 4: the signed-in scenarios (2, 5, 6) run against mocked sessions locally and on the Preview with
the email-code login; no paid generation is started without a separate GG budget.
