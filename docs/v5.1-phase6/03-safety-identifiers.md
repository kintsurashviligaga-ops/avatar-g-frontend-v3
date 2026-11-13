# 03 — Safety identifiers (DRAFT, code prepared, not wired)

**Problem.** If Google (or our own monitoring) finds that one stream of requests broke the usage policy, today we can
only act on the whole Google Cloud project, which takes MyAvatar down for everyone. We need to find the one account
behind it and switch off only that account, without sending Google an id, an email or a name.

**What Vertex offers.** `generateContent` has no end-user field. Its per-request metadata is `labels`: keys and values
up to 63 characters of lowercase letters, digits, `_` and `-`; a key starts with a letter (read 2026-11-13). Labels
also flow into the Cloud Billing export, which M-9 reconciliation needs anyway.

## Design (`lib/security/safetyId.ts`)

- `sid = "u" + first 40 hex of HMAC-SHA256(SAFETY_ID_SECRET, user_id)`.
  - **Stable** per user, so a report maps back to one account (we recompute it from our user list).
  - **Pseudonymous**: without our secret Google cannot reverse it or link it to other services.
  - **Rotatable**: a new secret gives new ids and the old mapping disappears with the old secret.
- Anonymous traffic gets `sid=anon`, so it is still separable from signed-in traffic.
- `cap = <capability>` (chat, video_omni_1_2, music, …) for billing reconciliation.
- **Fail closed:** no secret, or a secret under 32 characters, means no `sid` label at all and a `no_secret` problem the
  caller reports. Never the raw id.
- Off unless `SAFETY_LABELS=on`. Tests: stability, rotation, fail-closed, flag off, label alphabet (6 tests).

## Wiring plan (separate PR)

1. GG adds `SAFETY_ID_SECRET` (random, ≥ 32 chars) in Vercel **Production** only. It is a secret: never in code, logs,
   docs or Preview.
2. The shared Vertex request builder adds `labels: vertexRequestLabels({ userId, capability }).labels` to every
   `generateContent` / Interactions call; `labelsValid` guards it in tests.
3. A small admin lookup (owner-only) answers "which account is `u…`?" by recomputing ids; nothing stores the mapping.
4. Runbook: on a Google policy report naming a label, look up the account, pause it (existing admin tools), reply to
   Google with the label only.

## What this does not do

It does not hide what a user typed from Google; prompts still go to Vertex as today under our data terms. It only
avoids adding personal identifiers on top.
