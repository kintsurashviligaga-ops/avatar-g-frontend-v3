# Google ADK read-only pilot

MASTER TASK v3.1 §2.4, Phase 5. An isolated, server-side harness that runs one Google ADK agent over the app's
existing registry and task data. It can look things up for the signed-in user and **propose** a plan. It cannot run,
buy, change, approve or delete anything. It is not wired to any route, page or flag. Paid model calls are off.

## Layout

| Path | What it is | SDK? |
|---|---|---|
| `lib/adk/pilotPolicy.ts` | The bounds of one run: model calls, tool calls, deadline, request size, tool-result size, spend. A stop is a typed outcome. | no |
| `lib/adk/pilotTools.ts` | The four tools (strict zod input, declarations generated from it, `AgentToolDefinition`s through `createToolRegistry`) and `callPilotTool`, the one gate every tool call passes. | no |
| `lib/adk/untrusted.ts` | Every tool result is cleaned (control, bidi and zero-width characters) and wrapped as `{"untrusted": true, "data": …}`, size-bounded. | no |
| `lib/adk/pilot.test.ts` | The app side, tested in the app's own jest run (26 tests). | no |
| `pilots/adk/src/agent.ts` | The only code that touches `@google/adk`: the `LlmAgent`, the generated `FunctionTool`s, the `PilotGuard` plugin, `runPilot`. | yes |
| `pilots/adk/src/fakeLlm.ts` | Scripted fake models for the tests. | yes |
| `pilots/adk/src/pilot.test.ts` | The real ADK runtime driven by fake models (26 tests). | yes |

Run: `npm ci && npm ci --prefix pilots/adk --ignore-scripts && npm run --prefix pilots/adk typecheck && npm test --prefix pilots/adk`.
CI: `.github/workflows/adk-pilot.yml` (the app's `ci.yml` never installs the SDK).

## The tools

| Tool | Effect | Reads |
|---|---|---|
| `capability_lookup` | read | `lib/agent/capabilities` (live/beta catalog services only), each flag evaluated for this user. Whether it runs today, how it is charged and approved. |
| `task_status` | read | The caller's own tasks (`TaskView` summary: status, stage, progress, error). No result link, no token. A task `awaiting_approval` is the quote lookup. |
| `library_list` | read | The caller's library metadata: kind, prompt, date, starred. No media link. |
| `plan_propose` | propose | Nothing. Returns a proposal with `status: 'awaiting_approval'`, `executes: false`, no price, no token. `kind: 'run'` is checked by `validateRunSpec`, and may name only files attached to this message or an earlier step. `kind: 'service'` is refused for a capability that does not run, has no approval step, is code-run or a run tool. |

Everything else is refused as `tool_unavailable` and counted: provider submission, quoting with a signed token,
starting or approving a job, wallet moves, SQL, shell, browser, deleting assets, Agent G's live tools, the legacy
text helpers (`lib/tools/registry`). They are not disabled; they do not exist in the pilot. `PilotDeps` (what the
pilot can call in the app) has four members, all reads: `readTask`, `listTasks`, `listLibrary`, `flagOpen`.

The user comes from the session (`PilotRunInput.userId`), never from a model's arguments: every input schema is
strict, so a `userId` key is `bad_input` before any read.

The proposal is the end of the pilot's road. The existing path (quote → card → the user's Start → the server
executor) is the only way anything runs. The pilot holds no session store, no task table and no wallet: one run's
ADK session is in memory and dropped when the run returns.

## Bounds (`PILOT_LIMITS`)

| Bound | Default | On reaching it |
|---|---|---|
| Model calls | 6 | `model_call_limit` (ADK's `maxLlmCalls` is set 2 higher as a backstop only) |
| Tool calls, refused ones included | 8 | the call is refused `tool_budget_exhausted` |
| Deadline | 20 s | `deadline`; one AbortSignal (caller's cancellation or the deadline) goes to ADK, the model and every read |
| One model request | 24 000 chars | `context_too_large`, before the call |
| One tool result | 6 000 chars | the newest list items are dropped (`truncated: true`), else `result_too_large` |
| Spend | **$0** | `budget_exhausted`, before the call |

A model states a call's cost through `pilotCallUsd(request)`. A model that cannot (ADK's own `Gemini`, any model
without the method) counts as costing more than any budget, so it never makes a call. Only the zero-cost fakes run.

## Compatibility review: `@google/adk` 2.3.0

Pinned exactly (`"@google/adk": "2.3.0"`, Apache-2.0) in this folder's own `package-lock.json`, with
`@google/genai` 2.32.0 under it. Reviewed on 2026-11-05.

**Why it is not in the app's `package.json`.** Installing it at the root adds 119 packages (among them `dockerode`,
`ssh2` and the native `cpu-features`, `@mikro-orm/core`, `winston`, a full OpenTelemetry SDK with OTLP exporters)
and moves the hoisted OpenTelemetry packages Sentry uses (`@opentelemetry/core` 2.7.1 → 2.11.0,
`sdk-trace-base` → 2.12.0). Here its own lockfile holds 177 packages (147 MB), installed with `--ignore-scripts` (no native
build). `npm audit`: 2 moderate (`uuid` under `gaxios`, buffer bounds when a caller passes its own buffer), no high or
critical. The app's `tsconfig.json` and `jest.config.cjs` exclude `pilots/`; a test fails if anything in `app`,
`components`, `hooks`, `lib`, `services` or `store` imports `@google/adk`, or if any page, route or component
reaches the pilot.

**The development UI.** ADK's dev server and web UI ship in a separate package (`@google/adk-devtools`), which is not
installed. Nothing here serves HTTP.

**Runtime.** The CommonJS build `require`s `lodash-es` (ES modules only). Node 22+ loads that natively; jest does not,
so the pilot's jest config runs `lodash-es` through the same SWC transform as our code. ADK's tracer has no exporter
registered here, so its spans go nowhere.

**Authentication: the hazard.** ADK's `Gemini` model class chooses its backend from the environment. With
`vertexai` not passed explicitly, `GOOGLE_GENAI_USE_VERTEXAI` (or `GOOGLE_GENAI_USE_ENTERPRISE`) unset and any of
`GEMINI_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_GENAI_API_KEY` present, it talks to the **Gemini Developer API**. A
model given as a name (`model: 'gemini-…'`) is resolved through ADK's registry to that class. v3.1 forbids exactly
this ("an unset environment variable must not select Developer API"). So the pilot:

- refuses a model name; the model must be a `BaseLlm` instance (`PilotConfigError: model_must_be_instance`);
- never constructs `Gemini`; a test shows the Developer API selection and that a `Gemini` instance handed to the
  pilot is stopped (`budget_exhausted`) before any request leaves.

With `vertexai: true` it selects Vertex AI, but credentials then come only from Application Default Credentials;
2.3.0 has no way to pass the app's existing Workload Identity Federation client into it.

**What a live pilot needs (not built).** An app-side `BaseLlm` over the existing Vertex transport (the same WIF/ADC
path and fail-closed Vertex policy the app's generation uses: explicit project, region and model, no key, no
fallback), which implements `pilotCallUsd` from the request size and the model's price; a reserved budget per run;
and the owner's billing authorization (v3.1: "any live pilot remains subject to billing authorization"). Until then
`maxSpendUsd` stays 0.

## Acceptance (v3.1 §2.4) and where it is tested

| Requirement | Tests |
|---|---|
| Tenant isolation | user B asking for A's task gets `not_found`; every read is made for the session user; a `userId` argument is `bad_input`; no signed link or token reaches the model (both suites) |
| Schema validation | out-of-range limits, unknown keys (`price`, `approved`, `userId`), a `shell` step, an over-long id: all `bad_input`, no read |
| Prompt injection | text planted in the user's library tells a naive fake model to debit the wallet and approve; it obeys, and every call is refused; the planted text reaches the model only cleaned and wrapped as untrusted |
| Unavailable / execution tools | 19 execution-shaped names (start, quote, wallet, SQL, shell, browser, delete, approve, transfer, …) are `tool_unavailable`, counted; past the tool budget even a real tool is refused |
| Cancellation | before the start (no model call), during a model call, during a read (the read's signal is aborted, no model call follows) |
| Budget exhaustion | an unpriced model and any paid call are stopped before their first call; with a budget, the call that would pass it is not made |
| Other bounds | model-call limit, deadline, request size |
| No second task/session truth or payment authority | `PilotDeps` has no write; proposals never execute; the ADK session is in memory for one run |

## Not done, on purpose

- No route, page, flag or Production wiring (v3.1: "Keep the pilot isolated from production routing until
  contract/evaluation evidence is reviewed").
- No live model, no paid call, no credential.
- No write or execute tool, now or by configuration.

## Findings outside the pilot

- `lib/catalog/services.ts`: some `boundary: 'violation'` notes (for example "voice is ElevenLabs until it moves to
  Cloud TTS") read as older than Phase 1. The pilot does not use `boundary`; worth a separate check.
- `plan_propose` declares only `op` for a run step's `edits`; each edit is checked in full by `validateRunSpec`
  (`editAskOf`), so a model learns an edit's other fields from the error, not the declaration.
