# Live actions: voice-to-action in Gemini Live

While the user talks, the Live model can call functions that change the UI. It can fill a studio prompt, open a
studio, put code on screen, or hang up. The agent acts and keeps talking, the way Astra does.

## The safety rule: a tool only prepares

A function call may **switch a studio and prefill its prompt**, open a code canvas, or end the call.
It must **never start a generation or charge a credit**. The user reviews what was prepared and taps **Run**.

- `dispatchServiceBlock` in `components/studio/OmniStudio.tsx` has an image/music branch that renders straight away.
  The Live listener uses only the studio switch and the prompt prefill. It must never reuse that branch.
- The declarations and the instruction both tell the model this. After `prepare_generation`, the model says the work is
  ready and that the user starts it with Run.
- A future action that would spend money needs a user tap, not a function call.

## The pieces

| Piece | File |
| --- | --- |
| Catalogue: declarations, validators, event names, instruction paragraph | `lib/voice/liveTools.ts` |
| Wire: `LiveTool 'live_actions'` → `{functionDeclarations}`, and `toolCallCancellation` parsing | `lib/voice/geminiLive.ts` |
| Server lock: the mint puts the declarations into `bidiGenerateContentSetup` | `app/api/voice/live/route.ts` |
| Transport: the `actions` opt-in, the no-actions retry and cancellation | `components/voice/live/useGeminiLiveSession.ts` |
| Executor: validate, dispatch the window event, answer the model | `components/voice/live/liveActions.ts` |
| Screen: the action cards above the control pill | `components/voice/live/LiveActionCards.tsx` and `LiveModeOverlay.tsx` |
| Host: wires the above and runs `end_call` and Open | `components/voice/GeminiLiveConversation.tsx` |
| Studio: one listener that switches the studio and fills the prompt | `components/studio/OmniStudio.tsx` |

## The tool contract

Each declaration uses only the plain OpenAPI subset: `type` (with the proto names `OBJECT`, `STRING` and `INTEGER`),
`description`, `properties`, `required` and `enum`. The validators enforce the bounds; the schema does not carry them.
`end_call` has **no** `parameters`, because Gemini rejects an `OBJECT` whose `properties` is empty.

| Function | Arguments | What happens |
| --- | --- | --- |
| `prepare_generation` | `tool` (`video` · `image` · `music` · `avatar`, required), `prompt` (required, at most 2,000 characters), `aspectRatio?` (`16:9` · `9:16` · `1:1` · `4:5` · `3:4` · `4:3`), `durationSec?` (clamped to 1–120), `style?` (at most 60 characters) | The studio switches and the prompt is prefilled. Nothing runs. |
| `show_code` | `title`, `language` (allowlist; aliases such as `js` and `py` are mapped; an unknown name becomes `plaintext`), `code` (at most 200 KB of UTF-8) | `myavatar:open-artifact` with `{ title, language, code }` |
| `open_studio` | `tool` | The studio switches. |
| `end_call` | none | The call hangs up after the model's goodbye. |

The validators sanitise the input. They strip control characters and bidi overrides, normalise unambiguous spellings
(`portrait` → `9:16`, `9x16` → `9:16`, `"24s"` → 24), cut or clamp values to their bounds, and ignore unknown
arguments. A missing required field, a wrong type, an unknown enum value or an unknown function name returns a
structured error, `{ code, message, field?, allowed? }`, and the model can retry with it. The validators never throw.

### Window events

- **`myavatar:live-action`** is cancelable. Its `detail` is the typed action and is sent for **every** validated call.
  OmniStudio maps `prepare_generation` and `open_studio` to `selectTool(tool)` plus `setInput(prompt)`, then calls
  `preventDefault()` as its **receipt**. When no listener takes the event, there is no studio on the page: the model
  gets `ok:false`, never "done". After the call has closed, a card's Open sends the action again with `reveal: true`,
  and the composer takes focus.
- **`myavatar:open-artifact`** has `detail` `{ title, language, code }`, exactly those three fields. Another surface
  owns the canvas. The code card also offers Copy, so the code is never stranded.

### The answer to the model

Every call gets a `toolResponse` straight away, synchronously and with no network. Live function calls block the
model's turn, so a slow answer would be dead air.

- `{ ok: true, summary }`: an English sentence for the model, for example *"Prepared a video prompt in the Video
  studio. Nothing was generated and no credits were spent…"*. The summary is honest about settings. The receipt covers
  only the studio switch and the prompt; the requested aspect ratio, duration and style are shown on the card for the
  user to confirm in the studio settings.
- `{ ok: false, error, message, field?, allowed? }`: `error` is one of `invalid_args`, `too_large`, `unknown_tool`,
  `studio_unavailable` or `too_many_actions`. After 40 actions in one call, a looping model is cut off.
- When the server sends `toolCallCancellation`, the user has barged in, so the cards for those ids are dropped.

### The screen

The strip of cards sits above the control pill, newest first, with at most 3 cards. Each card shows what the agent did
(*Prepared a video prompt*), the settings and prompt or the code's title, and an **Open** button. Open ends the call
and brings the studio, focused, or the canvas to the front. The strip has one visually hidden `role="status"` line. It
announces each new card once and is mounted for the whole call. Framer Motion animates the cards, and they simply
appear under `prefers-reduced-motion`. The copy exists in ka, en and ru. Georgian text is at least 16 px, and every
target is at least 44 px.

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

If Google rejects the lock, calls do not break. The fallbacks above remove the actions, the route logs
`setup_lock_rejected` with `lock: 'actions'`, and `GEMINI_LIVE_ACTIONS=0` turns the feature off without a client deploy.
