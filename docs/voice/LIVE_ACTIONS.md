# Live actions: voice control of the screen in Gemini Live

While the user talks, the Live model calls functions that operate the app: it reads what is on screen, fills and tunes
a studio, writes in the chat, switches the chat model, stops, scrolls, opens panels, shows code, and — only after the
user says yes to the price — starts a generation. It acts and keeps talking, the way Astra does, and the user **sees**
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
| Dock: the call as a bar at the top; the run banner | `components/voice/live/LiveDock.tsx` |
| Full screen: the action cards, the run banner, "Show the screen", stop-speaking | `LiveActionCards.tsx`, `LiveModeOverlay.tsx` |
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
| `end_call` | none | The call hangs up after the model's goodbye. |

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
- **`<html data-live-docked>`** is set while the dock is up: `app/globals.css` moves `.ag-fixed-shell` down by
  `--live-dock-h`, so the bar never covers the app.
- **`myavatar:open-artifact`** has `detail` `{ title, language, code }`, exactly those three fields; `ArtifactCanvas`
  calls `preventDefault()` once its store has the artifact. Without that receipt the model gets `canvas_unavailable`.
- **`myavatar:open-search`** and **`myavatar:open-sidebar`** (ChatChrome) open the chat search and the history sidebar.

### The answer to the model

Every call gets a `toolResponse` straight away, synchronously and with no network. Live function calls block the
model's turn, so a slow answer would be dead air.

- `{ ok: true, summary }`: an English sentence for the model that is honest about what happened — the settings the
  panel really took, the price, and for a prepared run, "ask the user whether to start it".
- `{ ok: false, error, message, field?, allowed? }`: `error` is one of `invalid_args`, `too_large`, `unknown_tool`,
  `studio_unavailable`, `canvas_unavailable`, `too_many_actions`, or the studio's own refusal code. After 40 actions in
  one call, a looping model is cut off.
- When the server sends `toolCallCancellation`, the user has barged in: the cards for those ids are dropped and a
  pending countdown is cancelled.

### The screen

- **The dock.** A 56 px bar at the top (plus the safe area), always dark: the orb, the status, the last caption or the
  agent's current step, stop-speaking (while the agent speaks), mute, expand and end — each ≥ 44 px, named in ka/en/ru.
  It is not a dialog: no focus trap, Escape does not hang up. A screen action (`get_screen_state` and every action that
  changes the screen) docks the call on its own, so the user sees the change; `call_view` and "Show the screen" on the
  full call do it on request; an error brings the full screen back.
- **The full call.** The strip of cards sits above the control pill, newest first, at most 3, each with an **Open**
  button. One visually hidden `role="status"` line announces each new card once. Framer Motion animates the cards; they
  simply appear under `prefers-reduced-motion`. Georgian text is at least 16 px.

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
