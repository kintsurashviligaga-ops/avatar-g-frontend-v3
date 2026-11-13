# Blockers (v5.1)

Updated 2026-11-12 (Phase 1). Each blocker: impact, evidence, severity, required decision. Nothing was bypassed.

| ID | Blocker | Impact | Evidence | Severity | Affected capability → status | Required decision / action |
|---|---|---|---|---|---|---|
| B-01 | Read-aloud default TTS model `gemini-2.5-flash-preview-tts` fails and is being shut down | Users cannot reliably hear replies; after 2026-11-17 the Developer-API id is gone; on Vertex it is not on the endpoint table | certification #269: HTTP 500 ×2; `ai.google.dev/gemini-api/docs/deprecations` (fetched 2026-11-12); Vertex locations table | HIGH (user-facing, dated) | Read-aloud → BLOCKED → **IN PROGRESS** | D-02 approved; PR #288 (3.8 TTS default); owner runs `scripts/certify/vertex-contract-plan-3.json` (~$0.02) to prove it |
| B-02 | Second (legacy) credit ledger still called by 8 entries | Possible free or double charge on those routes; v5.1 forbids two ledgers | `lib/billing/enforce.ts:133`; callers listed in `docs/audit/06` §1; `docs/ledger-unification/README.md` | HIGH (payment integrity) | Legacy ledger callers → UNKNOWN | Owner runs read-only `docs/ledger-unification/01_introspect.sql` on prod `zwksnayknzggdcenqqxy` and shares the result |
| B-03 | BOG never certified against the BOG sandbox | Real payments unproven; checkout stays admin-only | `bog-e2e.yml` skips without credentials; `docs/audit/06` §4 | MEDIUM (contained by admin gate) | BOG payment → BLOCKED | Owner provides BOG sandbox credentials to CI secrets (Phase 5) |
| B-04 | Agent G browser snapshot expires ~2026-11-13 | Admin browser agent stops working when the snapshot lapses | project record (#278), `scripts/agent-browser-snapshot.sh` | MEDIUM (admins only, dated) | Browser agent → at risk | **RESOLVED 2026-11-12 09:35Z** (D-10): new snapshot `snap_8jPItZEBa720U8KfCFbie43FG5J5`, expires **2026-12-12**; refresh by 2026-12-05 |
| B-05 | Official Agent Platform model-versions page not fully readable from this container | Some Vertex retirement dates UNKNOWN (3.5/3.7 Flash, Omni 1.1 preview, Lyria ids) | `docs/audit/04` §2 S10 | LOW | those rows → UNKNOWN | **RESOLVED 2026-11-12** — full tables read via Firecrawl (`docs/architecture/v5.1/13`); previews/speech models still not listed → UNKNOWN |
| B-06 | `gemini-3.6-flash` retires on Vertex 2026-11-19 | chat Flash chain, mic fallback, Live quick steps would fail | `docs/architecture/v5.1/13` §1 (P1) | HIGH (dated) | chat/mic fallback → at risk | approved (card 09:44Z); PR #289 |
| B-07 | `gemini-live-2.5-flash-native-audio` retires on Vertex 2026-12-13 | Live relay first model fails | P1 | HIGH (dated) | Live voice/avatar → at risk | D-12: migrate to `gemini-3.8-live` by 2026-12-06 (M-2) |

## Conflicts

| ID | Conflict | Resolution |
|---|---|---|
| C4 | Phase 0 said Interactions store 55 days (Developer API docs); Vertex guide says fixed 7-day TTL | Vertex = 7 days applies to us; D-04 stands; Omni continue of clips > 7 days cannot chain |
