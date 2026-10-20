# Director: unresolved provider submissions

An unanswered submit is not evidence that Google rejected a clip. The Director previously persisted a stale submit as a normal failed shot and allowed retry/edit, which could start a second billable generation. Its synchronous executor also offered retry after an ambiguous submit or an unfinished polling window.

## Implemented boundary

- Existing `director_runs.record` JSON retains `ShotError.requiresReconciliation=true` for ambiguous/thrown submits, interrupted submitting records and rendering records missing their operation ticket. Existing statuses, owner scoping, version CAS, ledger references and flags remain in use; no table or migration is added.
- The synchronous provider also marks an exhausted polling window as unresolved. The run/executor returns only `cancel`; both server decision paths reject retry/edit independently of the browser's options. The overlay renders the server-allowed controls and explains the uncertainty in Georgian, English and Russian.
- A late successful submit response may append its ticket to the SAME shot and attempt under CAS, including after cancellation. It cannot restore running/rendering state, poll, publish, change the attempt, undo a refund or create another generation. Operation tickets remain absent from the public run view.
- A detected post-submit contract mismatch also retains the already-accepted operation as private reconciliation evidence. The run treats a failure carrying a ticket as reconciliation-required even if a provider mistakenly suggests retry. A late rejected result follows the same CAS evidence path, including after cancellation or while a user refund is still due.
- User refunds retain their existing idempotent ledger behavior. A user refund never means the provider refunded or rejected its work. An unresolved attempt retains its marker and any known operation after a refund/cancel.
- Definite failures retain the existing explicit decision behavior. This change does not turn every non-retryable input error into an ambiguous submit.

## Limits and release conditions

This is a safety repair of the existing Director, not the complete MAIN/V8 durable execution protocol. It does not add a reconciliation UI/service, automatic provider-log/GCS discovery, immutable asset hashes, one-time approvals, a unique output prefix persisted before POST, or account-wide deduplication across newly created runs. Historical failed records without the new marker are not retroactively classified. The mismatch guard covers adjustments and changed prompt reported by the current engine; it is not a persisted canonical manifest comparison for every field.

If the database fails while recording a late response, its operation may still be unavailable. The unresolved marker continues to forbid a new attempt, but operator/provider evidence is needed. No API here clears the marker: cancel only stops this run's local workflow and does not cancel Google compute. A newly approved run is a separate action; this per-run guard is not a global spending cap.

Old application writers do not enforce the new marker. A release must not route unresolved runs to an old writer or certify rolling compatibility without further gating. Public flags, shared schema and Production remain unchanged by this candidate. All automated tests use scripted providers and fake/local stores; real provider, billing, hardware and delivery certification remain separate gates.

## Verification

Eight new regression cases fail on the unchanged integration tree: ambiguous and thrown submits, interrupted submit and missing-ticket records, two late-operation races (including cancellation), synchronous decisions and the overlay. Related tests cover HTTP serialization/409 enforcement, a provider that incorrectly marks ambiguity retryable, an unfinished polling window and unchanged definite-refusal handling. Exact test counts and commit/tree evidence are maintained in the execution checkpoint; no paid request is needed for these gates.

The next follow-up reproduces six failures on the prior tested tree for accepted-but-mismatched operations (prompt/adjustment, immediate/late, including cancellation). Further tests preserve the ticket when refund settlement is unavailable and refuse a retryable failure carrying an accepted ticket. These are fake-engine/CAS tests; no new Google generation is used.
