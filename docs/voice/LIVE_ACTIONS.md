# Live actions: voice control of the screen in Gemini Live

While the user talks, the Live model calls functions that operate the app: it reads what is on screen, fills and tunes
a studio, writes in the chat, switches the chat model, stops, scrolls, opens panels, shows code, puts a link to a
website on screen for the user to open, and — only after the user says yes to the price — starts a generation. It acts and keeps talking, the way Astra does, and the user **sees**
it happen: the call can shrink to a bar at the top of the screen (the dock) while the app stays fully usable under it.

## The money rule: only a confirmed start spends

Every function but one is free. `start_generation` is the only one that spends credits, and three things guard it:

1. **The price comes first.** `prepare_generation` and `update_settings` answer with `priceCredits` (the studio's own
   quote, `quoteCredits`), and the instruction tells the model to say it and ask.
2. **`confirmed: "yes"` is required.** The declaration and `LIVE_ACTIONS_RULE` say to send it only after the user
   clearly agreed to that price, and never on the model's own initiative. Without it the validator refuses.
3. **A 3-second countdown the user can cancel** (`LIVE_START_COUNTDOWN_MS`). The banner (`LiveRunBanner`, in the dock
   and on the full call screen) says what starts and its price, with a 44 px Cancel. Only when it runs out does the
   call fire `myavatar:live-run`, and OmniStudio re-checks (signed in, a generative tool, a prompt, nothing busy)
   before it presses its own Run (`runTool(true)`). Hanging up during the countdown counts as Cancel.

`dispatchServiceBlock`'s image/music branch renders straight away and is never reused by the Live listener.

## The pieces

| Piece | File |
| --- | --- |
| Catalogue: declarations, validators, event names, the instruction paragraph, `LiveStudioReply` | `lib/voice/liveTools.ts` |
| Spoken settings → the panels' real choices (orientation, snapped lengths, style synonyms) | `lib/voice/liveStudio.ts` |
| Wire: `LiveTool 'live_actions'` → `{functionDeclarations}`, and `toolCallCancellation` parsing | `lib/voice/geminiLive.ts` |
| Server lock: the mint puts the declarations into `bidiGenerateContentSetup` | `app/api/voice/live/route.ts` |
| Transport: the `actions` opt-in, the no-actions retry, cancellation, mint timeout, offline-aware resume | `components/voice/live/useGeminiLiveSession.ts` |
| Executor: validate, dispatch the window event, read the studio's reply, answer the model, the countdown | `components/voice/live/liveActions.ts` |
| Dock: the call as a floating capsule at the top; the step line, the link chip, the run banner | `components/voice/live/LiveDock.tsx` |
| Full screen: the control row, the action cards (a link's Open), the run banner, "Show the screen", stop-speaking | `LiveActionCards.tsx`, `LiveModeOverlay.tsx` |
| The agent's face: the rocket in the orb, and behind it on the full call | `components/voice/live/LiveOrb.tsx` |
| The call screen's shared chrome (frame, top bar, status line, error panel, control row) — also the fallback's | `components/voice/live/LiveCallChrome.tsx` |
| The agent's steps (running → done) for both screens | `components/voice/live/LiveActivityFeed.tsx` (`liveCurrentStep`) |
| Host: dock/full view, the call flag, `end_call` and Open | `components/voice/GeminiLiveConversation.tsx` |
| Studio: one listener that does each action and writes the reply | `components/studio/OmniStudio.tsx` |
| Panels opened by voice (search, history sidebar) | `components/studio/ChatChrome.tsx` |

## The tool contract

Each declaration uses only the plain OpenAPI subset: `type` (with the proto names `OBJECT`, `STRING` and `INTEGER`),
`description`, `properties`, `required` and `enum`. The validators enforce the bounds; the schema does not carry them.
A function with no arguments (`get_screen_state`, `new_chat`, `end_call`) has **no** `parameters`, because Gemini
rejects an `OBJECT` whose `properties` is empty. Booleans travel as `"on"` / `"off"` strings.

| Function | Arguments | What happens |
| --- | --- | --- |
| `get_screen_state` | none | The studio reports what is on screen: the tool, the prompt, its settings and price, the chat model, whether something runs, the last chat reply, the last result, signed in or not. |
| `prepare_generation` | `tool` (`video` · `image` · `music` · `avatar`), `prompt` (≤ 2,000 chars), `aspectRatio?`, `durationSec?` (1–120), `style?` (≤ 60 chars) | The studio switches, the prompt is filled and the settings are **applied** to the panel. The reply says what was applied (a length snapped to the panel's) and the price. Nothing runs. |
| `update_settings` | `aspectRatio?`, `durationSec?`, `style?`, `instrumental?` (`on`/`off`) | Tunes the open studio; refuses (`no_settings`, `not_applicable`) when nothing applies. |
| `start_generation` | `confirmed` (`yes`, required) | The countdown above, then the studio's Run. Refusals: `signed_out`, `not_generative`, `no_prompt`, `busy`. |
| `open_studio` | `tool` (any of the 17 tools) | The tool switches. |
| `chat_send` | `text` (≤ 4,000 chars) | Sends the message in the chat — opening the chat first when another tool is on screen — for anything long or written. |
| `new_chat` | none | A new, empty session; the current one stays in the history. |
| `set_chat_model` | `model` (`fast` · `thinking` · `pro` · `lite`) | The chat's mode switch. |
| `stop` | `what` (`reply` · `generation` · `all`) | Stops the chat answer being written and/or the running generations. |
| `scroll_chat` | `to` (`top` · `bottom` · `up` · `down`) | Scrolls the thread. |
| `open_panel` | `panel` (`settings` · `credits` · `persona` · `connectors` · `search` · `history`) | Opens that panel. |
| `call_view` | `view` (`screen` · `full`) | Docks the call to the bar, or brings the full call screen back. |
| `show_code` | `title`, `language` (allowlist, aliases mapped), `code` (≤ 200 KB) | `myavatar:open-artifact` with `{ title, language, code }`. |
| `open_url` | `url` (≤ 2,048 chars, http/https only), `title?` (≤ 120 chars) | A card with the link (and a chip under the dock); **the user's tap** opens it in a new tab. The call never opens it itself. |
| `end_call` | none | The call hangs up after the model's goodbye. |
| `click` | `target` (a control id from `get_screen_state`, e.g. `c12`, or its visible label) | Presses that control like the user's tap (`lib/voice/liveUi.ts`). Refused — with words the model repeats — for anything that spends credits, pays, deletes or signs out, for file pickers, and for the call's own screen. A link to another site becomes a link card the user taps; a link to another page of the app is refused (it would end the call). |
| `type_text` | `target`, `text` (≤ 4,000 chars), `submit?` (`on`/`off`) | Fills a field the way React notices (the native setter + `input`). `submit` presses Enter / submits the form — except in a studio's composer (Enter runs a paid tool) and in a form whose button spends. Never a password. |
| `download` | `result?` (`latest` · a result number · `image` / `video` / `music`) | The studio saves that result (fetch → blob → a file named for its kind). |
| `use_result` | `result?`, `to` (`video` · `music_video` · `montage` · `editor` · `chat`) | Moves a result into another tool with nothing generated: an image → the next video's start frame, a track → a music video's soundtrack or Montage's music, a video → the Montage timeline, image / audio → the editor, anything → a chat attachment. |
| `montage` | `action` (`open` · `set_music_start` · `export` · `state`), `videos?`, `music?`, `musicStartSec?` (0–3,600), `aspectRatio?` (9:16 · 16:9 · 1:1) | `open` (the studio): the editor with those videos on the timeline and that track as its music, starting `musicStartSec` into the song (the trim of its beginning; the end is cut to the picture). The rest go to the editor's own hook, `myavatar:montage-command` (cancelable, `detail.reply` written synchronously): move the music start, export (free), read the edit. No editor open → `montage_closed`. |
| `read_webpage` | `url` (a public http(s) address) | `/api/voice/web-read` (signed-in, `WEB_READ` per user) reads the page with every SSRF rule in `lib/web/readPage.ts` — public addresses only, DNS-checked (no rebinding), redirects re-checked by hand, a 1.5 MB cap, a timeout, HTML / text only — and the model gets the title, ≤ 3,500 characters of text and ≤ 25 links (`text — url`). It answers AFTER the network (the step spinner runs meanwhile; the session awaits the batch), and a link to the page goes on screen. The model may follow links by reading them; it cannot press buttons, fill forms, sign in or pay on other sites, and says so. |

### The hands (2026-10-03)

The owner asked that „click", „open", „download" and several steps in a row simply work, and that the agent can "go to a site". Three pieces make that safe:

- **The screen is listed, not guessed.** `get_screen_state` now carries `controls` — the visible buttons, tabs, links, switches, menu items and fields (at most 45; only the open sheet's when one is open; never the call's own), each with an id stamped on the element (`data-live-id`, stable across snapshots), its role, its accessible name, its state and, when it has one, its **guard** — and `results`, the user's media numbered newest first (1 = the latest). The model clicks and types by id.
- **The guards.** `spend`: `data-live-guard="spend"` (every priced `GenerateButton`, the composer's run button outside the chat), a `data-price` that is not `free`, or a name with a credit price („✦ 25", „25 კრედიტი"). `pay`: everything in `data-live-guard="pay"` (the credits / checkout sheet) but Close, or a name like Pay / Buy / Checkout. `destructive`: delete, sign out. `file`: a file input or anything that holds one (only the user's own tap opens a picker). `call`: the dock and the full call (`data-live-status`). `password`: never typed into.
- **[App] notes.** OmniStudio announces each NEW result (keyed by its media URL — a result usually fills a bubble that was already there) and each failure (`myavatar:live-result`) while a call is on; the call queues it and, the moment the agent is listening, sends it to the model as text that is not shown as the user's words (`sendNote`): „[App] A new music track is ready on screen: … — it is now result 1. If the user asked for more steps, continue with the next one now". So „make music, then a video, then put the music on it from 0:30" runs as: prepare + yes + start (music) → [App] → prepare + yes + start (video) → [App] → `montage` open (videos latest, music latest, musicStartSec 30) → `montage` export → [App].

### `open_url`: a link the user taps

Browsers block `window.open` outside a user gesture, and a function call arrives on a WebSocket message, which is not
one (iOS Safari blocks it every time). So the executor does **not** open anything: it adds an action card of the kind
`open_url` and answers the model with the truth — `{ ok: true, summary: "A link to <host> is on the user's screen; they
tap it to open it in a new browser tab — a voice call cannot open tabs by itself. Tell them to tap it." }`. The card's
**Open** (on the full call) and the link chip under the dock call `window.open(url, '_blank', 'noopener,noreferrer')`
inside the tap (`openLiveUrl`), which is the gesture; the call goes on (unlike a studio card's Open, which ends it).
`LIVE_ACTIONS_RULE` tells the model to use it for websites, videos and search results, e.g.
`https://www.google.com/search?q=…` or `https://www.youtube.com/results?search_query=…`. The studio is not involved:
no `myavatar:live-action` event is sent.

The validator (`validateLiveUrl`) lets only a public web address through: `http:` or `https:` (a bare `youtube.com/…`
gets `https://`); never `javascript:`, `data:`, `file:`, `blob:`, `intent:` or any other scheme; no user name or password
in the address; no `localhost`, local-network names (`.local`, `.internal`, a single-label host) or private, loopback,
link-local or CGNAT IPv4 literals (in any spelling — the URL parser normalises `2130706433` and `0x7f.1`); no IPv6
literal at all. Control and bidi characters are stripped, unknown arguments ignored, and the normalised address (a
Georgian query is percent-encoded and grows) must stay within 2,048 characters, else `too_large`. `openLiveUrl` checks
the address again before it reaches `window.open`.

The validators sanitise the input. They strip control characters and bidi overrides, normalise unambiguous spellings
(`portrait` → `9:16`, `"24s"` → 24, `js` → `javascript`, tool aliases), clamp values to their bounds, and ignore
unknown arguments. A missing required field, a wrong type, an unknown enum value or an unknown function name returns a
structured error, `{ code, message, field?, allowed? }`, and the model can retry with it. The validators never throw.

### Window events

- **`myavatar:live-action`** is cancelable. Its `detail` is the typed action (`LiveActionEventDetail`). OmniStudio does
  the action and calls `preventDefault()` as its **receipt**, and writes `detail.reply` (`LiveStudioReply`: `ok`,
  `error`, `message`, `priceCredits`, `applied`, `state`, `tool`) **synchronously, inside `dispatchEvent`**, so the
  answer to the model carries facts only the studio knows. With no receipt there is no studio on the page: the model
  gets `ok:false` (`studio_unavailable`), never "done". After the call, a card's Open re-sends the action with
  `reveal: true`, and the composer takes focus.
- **`myavatar:live-run`** (cancelable) is the countdown running out: OmniStudio re-checks and runs; its receipt says it
  did.
- **`myavatar:live-call`** `{ active }` and **`<html data-live-call>`** mark a call in progress: OmniStudio keeps the
  call's turns in one thread instead of splitting it when a voice action switches the tool.
- **`<html data-live-docked>`** is set while the dock is up, and the dock writes its **measured** height (safe area,
  capsule, link chip, countdown) to `--live-dock-h` on `<html>` (a ResizeObserver keeps it current; `app/globals.css`
  holds only a first-frame fallback). `app/globals.css` moves `.ag-fixed-shell` down by exactly that, so the dock never
  covers the app and no band is left under it. ⚠️ ChatChrome's shell says `fixed`, but the unlayered
  `.ag-fixed-shell { position: relative }` beats Tailwind's `.fixed`, so it sat in AppShell's flow — under AppShell's
  safe-area padding and AppShell's own docked offset: docked, the studio landed a whole dock (plus a safe area) lower,
  leaving an empty dark band over its header and its composer pushed off the screen. Docked, the studio's shell is now
  pinned to the viewport right under the dock, and nothing in it pads by the top safe area again (AppShell, the header,
  the sidebar and the collapsed rail); the phone's history drawer opens under the dock, not behind it.
- **`myavatar:open-artifact`** has `detail` `{ title, language, code }`, exactly those three fields; `ArtifactCanvas`
  calls `preventDefault()` once its store has the artifact. Without that receipt the model gets `canvas_unavailable`.
- **`myavatar:open-search`** and **`myavatar:open-sidebar`** (ChatChrome) open the chat search and the history sidebar.

### The answer to the model

Every call gets a `toolResponse` straight away, synchronously and with no network. Live function calls block the
model's turn, so a slow answer would be dead air.

- `{ ok: true, summary }`: an English sentence for the model that is honest about what happened — the settings the
  panel really took, the price, and for a prepared run, "ask the user whether to start it".
- `{ ok: false, error, message, field?, allowed? }`: `error` is one of `invalid_args`, `too_large` (code over 200 KB, an
  address over 2,048 characters), `unknown_tool`, `studio_unavailable`, `canvas_unavailable`, `too_many_actions`, or the
  studio's own refusal code. After 40 actions in one call, a looping model is cut off.
- When the server sends `toolCallCancellation`, the user has barged in: the cards for those ids are dropped and a
  pending countdown is cancelled.

### The screen

- **The agent is the rocket.** The orb carries the brand mark (`public/brand/rocket-mark*.png`, transparent) on a dark
  glass disc — 70 % of the core, centred, `object-contain`, so the corner-to-corner mark is never cropped or stretched
  at any size from the dock's 36 px to the call's 208 px; `srcSet` + `sizes` pick the 256 or 512 px raster. On the full
  call with the camera off, the same rocket stands large and faint behind the orb (at most 92 % of the screen's width,
  always whole) on a soft wash of its blue — static, one hue, under the one audio-reactive halo. The user's enrolled
  avatar poster is no longer shown (or fetched) on the call.
- **The dock.** A floating glass capsule at the top (on a black strip that takes the safe area), always dark: the rocket
  orb, „ცოცხალი ზარი · Agent G" with a live dot (it pulses only while the call is live, never under reduced motion), the
  status beside a compact waveform, and one line that says what is happening — the agent's step while it runs (a
  spinner), the agent's words while it speaks, a step that just finished (a check, for 5 s), then the last caption. Then
  mute, expand, stop-speaking (while the agent speaks) and End: a calm dark-red pill with a phone-down icon and its word
  („დასრულება", from 360 px) — the old big red filled ✕ read as "close this panel". Two rows on a phone, one from
  `sm`. A link the agent put on screen (`open_url`) shows as a chip under the capsule with **Open** (and hide), and a
  confirmed generation's countdown (with a draining bar) sits there too — both inside the dock, so their height is
  reserved. Every target is 44 px (in px: the app's root font is 17 px), named in ka/en/ru. It is not a dialog: no focus
  trap, Escape does not hang up. A screen action (`get_screen_state` and every action that changes the screen) docks the
  call on its own, so the user sees the change; `call_view` and "Show the screen" on the full call do it on request; an
  error brings the full screen back.
- **The full call.** One row of round glass controls, 56 px, each with its word under it (from 360 px; 12 px captions
  of the icons — the accessible name carries the full phrase): camera · stop-speaking (while the agent speaks) · mute ·
  the voice · End, a solid red circle with a phone-down icon. Toggles invert when on and expose `aria-pressed`. Five fit a
  320 px phone; flip-camera sits in the top bar beside the preview, and the waveform beside the status line. Under the
  status, the agent's steps: the newest is the step it is on now — lifted, a spinner and a running bar while it runs,
  a check when done — and the older ones step back. The strip of cards sits above the controls, newest first, at most 3,
  each with an **Open** button (a link's Open opens the site and keeps the call). One visually hidden `role="status"`
  line announces each new card once. Framer Motion animates the cards; they simply appear under
  `prefers-reduced-motion`. Georgian reading text is at least 16 px.
- **Connecting.** The status reads „უკავშირდება…" / "Connecting…" / «Подключение…» in the UI language (the owner's
  English screenshot was the `/en` locale; the Georgian copy was there). The rocket orb breathes — scale and opacity
  within 3 %, one 2 s cycle (`connectBreath`) — and the arc around it runs over a faint accent track, growing with the
  time spent connecting: a tenth at once, 63 % of the way in 3 s, held at 92 % until the call is up (`connectProgress`,
  the elapsed ÷ cap pattern of DESIGN.md §8). Under `prefers-reduced-motion`: a still quarter arc on the track, no breath.
- **The fallback wears the same screen.** When Gemini Live is unavailable for a user, ChatChrome mounts the ElevenLabs
  `VoiceConversation`; it draws the same pieces (`LiveCallChrome`) around the same `LiveOrb`, fed by its own analysers:
  the rocket orb and the faint rocket behind it, „ცოცხალი ზარი", the captions toggle, the status line with the waveform,
  the captions (the last thing said and the answer) and the row Mute · End. A tap on the orb ends the turn while it
  listens; before a start (iOS needs one tap) and after a pause, a labelled button under the status starts or resumes.
  Mute switches the mic track off, so a muted user neither ends a turn nor barges in. Its old canvas orb (crimson →
  violet while speaking, `lib/voice/orbViz.ts`) is gone.

## Switches and fallbacks

- **`GEMINI_LIVE_ACTIONS`** (server) is on by default. Setting it to `0`, `false`, `no` or `off` turns it off: the lock
  then carries no declarations and no actions instruction, and the call itself is unaffected.
- **The client opts in.** The mint adds the declarations only for a body with `actions: true`, which
  `GeminiLiveConversation` sends because it executes them. An old bundle, or any client that cannot execute them, never
  gets functions that would silently do nothing.
- **A mint 400 with declarations** first retries the **same parity lock without them**, so captions, resumption and
  search survive. Only after that comes the existing legacy chain, then `{model}`-only. Each step logs
  `voice.live.setup_lock_rejected` with `lock: 'actions' | 'full' | 'legacy'`. The response's `actions` flag says
  whether the frame the browser sends declares them.
- **A handshake the session refuses** happens when the mint accepted the lock but the socket closed before
  `setupComplete`. The hook's plan retries the parity wire without the declarations, then the legacy wire.
- **The degraded legacy retry** mints with `tools: false`, which removes every tool from the lock, search included.
  The lock then matches the tool-less frame the hook sends.

## Still to verify live

The tests mock every provider; no real Live socket was opened. Before relying on this in production, check with a
funded key:

1. **Google must accept `functionDeclarations` inside the ephemeral-token lock** (`bidiGenerateContentSetup`) for
   `gemini-2.5-flash-native-audio-latest` on the v1alpha `BidiGenerateContentConstrained` endpoint. Check both that the
   mint returns 200 **and** that the socket reaches `setupComplete`.
2. On that session, a spoken request such as "make me a vertical video of a cat surfing" must produce a `toolCall`, and
   the model must speak after our `toolResponse`.
3. The model asks before `start_generation` and sends `confirmed: "yes"` only after a spoken yes.

The studio's side is covered in a real browser by `tests/live-actions.spec.ts` (the events are dispatched as the call
dispatches them); the executor, countdown and dock by the jest suites under `components/voice/live/`.

`scripts/probe-live-actions.mjs` checks both with the owner's key, which it never prints. By default it only mints a
token and opens the setup for three locks: full, actions dropped, and no tools (the legacy wire). It reports which
reach `setupComplete`, and nothing is generated. `--turn` opts in to check 2: one billable turn on the full lock. The
probe types the request, because there is no microphone, then expects a `prepare_generation` call and the model
speaking after the answer. `--search` adds `googleSearch`, and
`--dry` prints the frames without a key or a network call. Its mirrored setup builder is pinned to `buildLiveSetup` by
`scripts/probe-live-actions.test.ts`.

If Google rejects the lock, calls do not break. The fallbacks above remove the actions, the route logs
`setup_lock_rejected` with `lock: 'actions'`, and `GEMINI_LIVE_ACTIONS=0` turns the feature off without a client deploy.
