# Evidence Ledger — Image Studio certification
2026-10-14. Source evidence is immutable; later documentation-only commits do not alter runtime code. Latest commit check status is published on [PR60](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/pull/60).

## Identity
| Item | Identity |
|---|---|
| Feature engineering commit | ed9ebfda971a196e6acb6b60d8841d8bdb09dbfe |
| Image parent |5b43b26c6e3f11a14f42c749d89b45279479406c |
| Main parent (PR58+PR63) |fef867a6ebad67a2a0a56a24e0b15c683a353d79 |
| Already-tested GitHub integration |2edaafd5c9c121cc85ca44ba8c0ca53d79768a77 |
| Both source trees, exact equality |5305d0c4c1e1f785b74bb8ab65ed452421ed5fd6 |
| Backup reference |codex/image-studio-recovery-20261014→5b43b26c |
| Upstream QC fix stable patch ID |670f75e6b64ac963c7766835d5b3704d630c7d37 |
| Shared Redis helper SHA256 |6ada7efc306a17f4c4064ca0db273f1c452d07ed5bd9be75ba6d8712f78af104 |

## CI evidence
Repository: kintsurashviligaga-ops/avatar-g-frontend-v3. All database services are disposable local services on GitHub runners, with synthetic credentials; no Production access.
- [CI38454305928](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38454305928), verify115493622433: typecheck/build PASS;909suitesPASS/8skipped;13,928testsPASS/70skipped;372.914seconds.
- [Image Acceptance38454306171](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38454306171), DB115492950167/browser115492949698: Lease7+7,Ledger7+7 with2opposite-phase skips,Runs6,Outbox4,Image3; browser5/offline5. These head-only results predate the ancestry sync; the source at head had7lease tests.
- [Video Core38454305911](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38454305911), billing115493579434: Lease9+9,Ledger7+7 with2phase-skips,Runs6,Outbox4,idempotency1before+7after. This is the main integration inventory.
- Same run, live115493578783 **FAIL before tests**, font URL extension parser at next/font/google/loader.js:112.
- [Attempt2](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38454305911/attempts/2), live115495626742: **38PASS,17.9minutes** including3Image Auth/RLS/Storage/Library tests. Same code; build passed without workaround. Original failure retained.
- [Preview Contract38454306107](https://github.com/kintsurashviligaga-ops/avatar-g-frontend-v3/actions/runs/38454306107): PASS; not hosted real Image E2E.

DB low-level tests inject Google/Storage and do not prove RLS. Free Image E2E uses real Auth and authenticated A/B DB/Storage clients, plus synthetic seeded PNGs. Service credentials are fixture setup/cleanup only. There is no quote/confirm/generation request, and credit balance/ledger invariance is asserted.
The historical baseline diagnostic deliberately preserves6PASS/1knownFAIL+timer timeout; diagnostic PASS means exact reproduction, not release acceptance. Current Image suites use bounded natural exit; legacy Video billing forceExit is not claimed as timer-leak evidence.

## Local bounded checks
- Current-main disposable snapshot: typecheck17.053s PASS; targeted integration156PASS/3DB-skips; One Window5PASS54.2s.
- Image Redis red test:6PASS/2FAIL. Fixed adapter/helper/engine:30PASS/0FAIL; typecheck17.15s; scoped ESLint0warnings/errors.
- Actual files/results are in `evidence/phase8-20261013/`. No global Jest forceExit or weakened assertions were introduced.

## Plain-Jest skipped inventory (70)
| Group | Count in plain Jest | Separate evidence / remaining scope |
|---|---:|---|
| Lease,Ledger,Runs,Outbox,Image,idempotency DB |37|isolated jobs above; phases cover mutually-exclusive cases; idempotency before adds1scenario not present in the default after-inventory |
| Native FFmpeg opt-ins |17|3longform passed in earlier recovery;14Video-specific opt-ins not rerun in this Image continuation; not claimed PASS |
| Public MDN audio opt-ins |2|passed in earlier recovery; external sample, no paid provider |
| BOG payments integration |14|separate BOG_E2E_POSTGREST/JWT fixture not run here; no bank credentials/calls; outside Image release evidence |

These counts are not deduplicated scenario totals across runs. Do not sum repeated before/after/rerun executions as unique tests. The local inventory.json plus BOG test source accounts for all70.

## Preservation
Raw logs and source manifests:
`/Users/giorgikintsurashvili/.codex/visualizations/2026/10/12/01a131c4-82f0-7be2-b199-280ae93072e5/main-refresh-20261013/`.
Prior evidence:
`.../phase8-20261013/`, `.../final-continuation-20261013/`, `.../recovery-20261013/`.
Backup archive SHA256:22d9316abe139ce329d2ba23c3176da77f8e01e5ca45f63c6f18cc5be59a9ef1.
Historical093 E2E ZIP SHA256:a90f883399804bc708fdd9323d2da64fccf38315a17d4d17b79281b8478de404;38expected,0unexpected,0skipped,0flaky.
GitHub artifacts retain14days. Local copies/compact JSON preserve evidence beyond that window. Reports do not include secret values, signed asset URLs or synthetic auth sessions.

## Release boundaries
Source compatibility + seeded local E2E do not establish Google generate/edit, actual provider spend/call count, full distributed recovery, real Redis admission, hosted Preview or public rollout readiness. All remain explicitly BLOCKED in the matrix. Production configuration was not mutated or independently certified.
