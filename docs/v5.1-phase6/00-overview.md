# v5.1 Phase 6 — security and privacy (DRAFT, nothing wired)

Asked by GG 2026-11-13 16:20Z: "Make Phase 6 the very next thing you prepare. Write the prompt-injection review, data
retention policies, safety identifiers, and Computer Use confirmation policies now (as drafts). We will merge and
activate them before turning on any flags for users."

Status: **draft PR, flags off, merges after GREEN and GG's OK.** Nothing in this PR changes what production does today:
every new module is pure and has no caller yet. Each wiring step is its own small PR afterwards.

| # | Document | Code in this PR | What it decides |
|---|----------|-----------------|-----------------|
| 01 | [Prompt-injection review](01-prompt-injection-review.md) | `lib/security/untrustedFence.ts` (+4 tests) | every place untrusted text reaches a model, how it is framed today, 2 gaps |
| 02 | [Data retention policy](02-data-retention.md) | `sql/01_fk_cascades_readonly.sql` (GG runs, read-only) | how long each kind of data lives, and what account deletion must remove |
| 03 | [Safety identifiers](03-safety-identifiers.md) | `lib/security/safetyId.ts` (+6 tests) | a pseudonymous per-user id on Vertex requests, so one abuser can be cut off |
| 04 | [Computer Use confirmation](04-computer-use-confirmation.md) | `lib/agent/computerUse/confirmPolicy.ts` (+9 tests) | which proposed browser actions run, pause for a tap, or are refused |

## Order to activate (proposed)

1. Wire `fenceUntrusted` into chat attachments and Drive files (gap G-1, G-2). No flag needed; behaviour for honest
   files is unchanged.
2. Fix account deletion (02, D-1…D-4) once GG has run the read-only cascade SQL and decided the ledger question.
3. Set `SAFETY_ID_SECRET` (≥ 32 chars, Vercel Production only), then wire `vertexRequestLabels` into the shared Vertex
   client with `SAFETY_LABELS=off`; turn it `on` after one day of clean logs.
4. Computer Use policy is wired only when the Computer Use pilot (D-16) is built. Until then it is the contract.

## Decisions GG needs to make (none block the drafts)

- **R-1** Ledger rows on account deletion: keep them pseudonymised for accounting (recommended) or delete them as today.
  Your accountant should confirm how many years Georgian law requires payment records to be kept.
- **R-2** Chat history retention for inactive accounts: keep until the user deletes it (today) or delete after N months.
- **R-3** Whether anonymous traffic gets one shared `sid=anon` label (proposed) or none.
