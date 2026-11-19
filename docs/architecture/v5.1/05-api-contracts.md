# 05 — API contracts

Principles: every paid or external action goes **quote → approval → run**; every response that fails uses one error
envelope; every request has an id that reaches Google as a label. Existing routes keep working; new routes are added
beside them and the old ones become thin wrappers during migration (`09`).

## 1. Error envelope (all routes)

```json
{
  "error": "capability_unavailable",
  "message": "ხმამაღლა კითხვა ახლა მიუწვდომელია",
  "reason": "RETIRED | DENIED | QUOTA | TIMEOUT | PROVIDER_5XX | BAD_INPUT | BUDGET | APPROVAL_MISSING | ...",
  "retryable": false,
  "provider": { "name": "vertex", "status": 500, "code": "INTERNAL" },
  "requestId": "req_…"
}
```

`error` is a closed set (zod enum in `lib/contracts`); `message` is localized (ka/en/ru); `provider` never includes a
token, key, prompt or personal data. Today's codes (`tts_failed`, `stt_unavailable`, `gemini_key_missing`,
`budget_exhausted`, `approval_unclear`, …) map 1:1 into this set.

## 2. Capabilities

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/capabilities` | the caller's capabilities: id, available, audience, approval kind, price hint, proof status |
| GET | `/api/admin/capabilities` | + bindings, lifecycle, entitlement, overrides (admin only) |
| POST | `/api/admin/capabilities/:id/override` | owner kill switch `{ state: "on" | "off" }` (audited) |

## 3. Quotes

`POST /api/quotes` → `{ capability, input, tier? }` → 200
```json
{ "quoteId": "q_…", "capability": "video.omni", "credits": 42, "maxCredits": 55,
  "priceVersionId": "pv_2026_12", "estimateUsd": { "expected": 0.31, "worstCase": 0.41 },
  "expiresAt": "…", "token": "<signed>", "scope": { "provider": "vertex", "external": false } }
```
`maxCredits` is the reservation size (`08` §3). A quote never charges.

## 4. Approvals

| Method | Path | Body / result |
|---|---|---|
| POST | `/api/approvals` | `{ quoteToken, channel: "tap"|"panel-button"|"voice-transcript", said? }` → `{ approvalId, expiresAt }` |
| GET | `/api/approvals?state=pending` | the approval center's list |
| POST | `/api/approvals/:id/revoke` | stop before use; after use → 409 |

An approval is bound to **one quote, one user, one scope, one expiry**, and is consumed once (unique index). The voice
channel keeps today's server-side judgement (`lib/voice/spokenYes`).

## 5. Runs (Agent G engine)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/runs` | `{ goal, approvalIds[] }` → `{ runId }` (plan may be returned first for approval) |
| GET | `/api/runs/:id` | state, steps (DAG), cost so far, artifacts |
| GET | `/api/runs/:id/stream` | SSE events (`06` §4); replaces `/api/tasks/stream` gradually |
| POST | `/api/runs/:id/pause` · `/resume` · `/cancel` | idempotent; cancel releases unspent reservation |
| POST | `/api/runs/:id/steps/:stepId/approve` | approve a step that needs its own yes (external action, extra spend) |

## 6. Artifacts

`GET /api/runs/:id/artifacts` → list with signed links (7-day life, as today); `POST /api/artifacts/:id/share` later.

## 7. Provider result (internal TypeScript contract)

```ts
type ProviderResult<T> =
  | { ok: true; value: T; usage: Usage; billedUsd?: number; requestLabels: Record<string, string> }
  | { ok: false; error: ErrorCode; providerStatus?: number; billedOnFailure: 'none' | 'partial' | 'full' | 'unknown'; usage?: Usage };
```
`billedOnFailure` is what lets the ledger stop refunding cost Google keeps (`08` §4).

## 8. Versioning

Routes stay unversioned (internal app API). Breaking changes go behind a new path; contract tests (`__tests__/contracts`)
pin request bodies to Google's documented shapes, as `plan.contract.test.ts` does today.
