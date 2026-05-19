# MyAvatar.ge Core Orchestrator

This is the high-level architecture for the chat brain — the central kernel that turns a user message into a dispatched agent task and returns a JSON-only response the UI can render without inspecting raw provider data.

## File map

| Path | Purpose |
|---|---|
| [lib/orchestrator/types.ts](../lib/orchestrator/types.ts) | TypeScript contract: `OrchestratorState`, `AgentTask`, `PipelineContext`, `ServiceResponse`, `OrchestratorResponse`, `SuggestedAction`, `VideoSegment`, `VideoComposition` |
| [lib/orchestrator/service-configs.ts](../lib/orchestrator/service-configs.ts) | Per-agent capability declarations (`ServiceConfig` registry) |
| [lib/orchestrator/intent.ts](../lib/orchestrator/intent.ts) | Slash-command parser + trilingual natural-language intent detection with soft routing |
| [lib/orchestrator/actions.ts](../lib/orchestrator/actions.ts) | Proactive `SuggestedAction` builder — what to suggest after each agent reply |
| [lib/orchestrator/composition.ts](../lib/orchestrator/composition.ts) | Temporal segmentation — 6-second clip lifecycle + assembly call |
| [lib/orchestrator/orchestrator.ts](../lib/orchestrator/orchestrator.ts) | `handleUserMessage` — single UI entry, owns dispatch + checkpoint + recovery |

## End-to-end turn

```
        ┌──────────── chat UI ────────────┐
        │   user types or clicks an       │
        │   action chip → text + opts     │
        └──────────────┬──────────────────┘
                       ▼
              ┌─────────────────────┐
              │ handleUserMessage() │   ← single entry point
              │ in orchestrator.ts  │
              └────────┬────────────┘
                       ▼
        ┌─────────── pipeline ───────────┐
        │ 1.  parseSlash() / detectIntent│
        │ 2.  pickInputsFor(agent, …)    │ ← token-efficient context slice
        │ 3.  deriveParams(prompt)       │ ← aspect, instrumental, etc.
        │ 4.  saveState({checkpoint})    │ ← STATE RECOVERY anchor
        │ 5.  RUNNERS.get(agent)(task)   │ ← agent does the work
        │ 6.  validate ServiceResponse   │
        │ 7.  append to history, save    │
        │ 8.  buildSuggestedActions()    │ ← proactive next steps
        └────────────────┬───────────────┘
                         ▼
        ┌────── JSON OrchestratorResponse ──────┐
        │ {                                       │
        │   message,                              │ ← Markdown body
        │   asset?,                               │ ← AssetRef (if produced)
        │   suggestedActions: [                   │ ← UI buttons
        │     { label, action, payload, primary } │
        │   ]                                     │
        │ }                                       │
        └─────────────────────────────────────────┘
```

The UI dispatches each `suggestedAction.action` to a tiny handler — so the orchestrator-side logic is the only place that knows how a "ANIMATE" or "ASSEMBLE_VIDEO" button maps to a follow-up agent call.

## Stateful Conversation Flow

`OrchestratorState` is the single mutable object. It is persisted to `localStorage` under `myavatar-orchestrator:<sessionId>` after every turn (blob URLs are stripped before persisting — they cannot survive a reload).

Three responsibilities:

1. **History** — list of `{ task, response, ts }` entries used by chat replays and for "Regenerate" lookups.
2. **PipelineContext** — assets, composition, lastIntent, notes. This is the *only* state the agents indirectly see (filtered through `pickInputsFor`).
3. **Checkpoint** — the in-flight task. Cleared on response. Read at boot to recover.

## Token efficiency

Agents *never* see the whole conversation. The orchestrator hand-picks:

- `prompt` — slash-stripped, distilled text.
- `inputs` — at most one asset (e.g. the photo for HeyGen avatar). Filtered by the agent's declared `accepts` array.
- `params` — derived once by the orchestrator (`aspectRatio`, `instrumental`, `voiceLocale`) so each runner doesn't redo the detection.

This keeps per-call token usage flat regardless of how long the conversation runs.

## State Recovery

```
boot
 │
 ├─ loadState(sessionId) → state
 │
 ├─ if state.checkpoint && age < 10 min:
 │     try to resume polling the task (e.g. HeyGen videoId)
 │     if resolvable → emit final response from cached state
 │
 └─ else: clear stale checkpoint, start fresh
```

Implementation note: HeyGen jobs are the only ones with externally-trackable IDs (`videoId`). For other providers we surface a "Retry" suggested action instead of attempting to resume — the underlying request is cheap to re-send.

## Temporal Segmentation — 6-second clip assembly

Every video output is a single 6-second clip — LTX's sweet spot. Long-form video is assembled from N segments via the editor:

```
1. user → /video "ცინემატური ხედი ზღვა"
   orchestrator → creates VideoComposition with first VideoSegment
   first segment status: queued → generating → ready
   UI: PreviewCanvas shows the clip + suggested actions

2. user clicks "Add 6s clip" (ADD_VIDEO_SEGMENT)
   orchestrator → appendSegment(comp, newSegment(prompt))
   second segment goes queued → generating → ready

3. user clicks "Assemble" (ASSEMBLE_VIDEO)
   composition.canAssemble(comp) === true (≥2 ready, none queued)
   POST /api/video/assemble
     body: {
       segments: [{ url, durationSec, cameraMotion }, ...],
       voiceoverUrl, musicUrl
     }
   server-side ffmpeg concats + optional audio mux
   response: { url }
   composition.finalAssembledUrl = url
   UI: PreviewCanvas swaps to the assembled video
```

The 6-second cap is enforced in `composition.ts` via `SEGMENT_DURATION_SEC`. Any future provider that supports longer single-shot clips simply raises that constant — the rest of the editor is duration-agnostic.

## SuggestedAction contract

Every chip in the chat surface is a `SuggestedAction`:

```ts
{
  label:   "ანიმაცია",            // localized
  action:  "RUN_AGENT",            // canonical ActionKey
  payload: { agent: "video", prompt: "...", inputs: [assetRef] },
  primary: true
}
```

The UI maintains a single `dispatchAction(action: SuggestedAction)` handler. Mapping table:

| ActionKey | UI handler |
|---|---|
| `RUN_AGENT` | `handleUserMessage({ forceAgent: payload.agent, text: payload.prompt })` |
| `RETRY_LAST` | `handleUserMessage({ text: state.history.at(-1)?.task.prompt, forceAgent: state.history.at(-1)?.task.agent })` |
| `STOP` | `abortRef.current?.abort()` |
| `OPEN_PREVIEW` | `setLatestMedia(...)` + mobile auto-switch to Preview tab |
| `DOWNLOAD` | click `<a download href={url}>` |
| `SHARE` | `navigator.share` or clipboard fallback |
| `ADD_VIDEO_SEGMENT` | `appendSegment(...)` + dispatch video runner |
| `ASSEMBLE_VIDEO` | `assembleComposition(comp)` |
| `SET_CAM_*` | next ADD_VIDEO_SEGMENT injects the camera-motion preset |
| `ADD_MUSIC` / `ADD_VOICEOVER` | dispatch matching agent, attach result to composition |
| `CLEAR` | reset OrchestratorState, keep sessionId |

## Action plan for wiring this into the existing chat surface

This document describes the architecture in isolation. To put it in production:

1. **Register runners** at chat-surface mount: `registerAgent('image', taskToRunImage)` adapters that wrap the existing `runImage` / `runVideo` / etc. functions into the `AgentRunner = (task) => Promise<ServiceResponse>` shape.
2. **Replace direct `send()`** with `await handleUserMessage({ state, text, mode, attachment })`.
3. **Render suggestedActions** as a chip row beneath the latest assistant message — replaces the static `SuggestedFollowups` component.
4. **Hydrate state on mount** via `loadState(sessionId)` to recover any in-flight checkpoint.

This is a phased migration — the existing direct-runner path continues to work until step 2 lands.
