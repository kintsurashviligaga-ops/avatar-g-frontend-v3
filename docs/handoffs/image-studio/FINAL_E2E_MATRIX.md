# Image Studio — Final E2E Matrix
2026-10-14. PASS ეხება მხოლოდ დასახელებულ გარემოს. Source tree: `5305d0c4`; engineering commit: `ed9ebfda`.

| Scenario | Expected | Actual | Evidence | Verified environment | Status |
|---|---|---|---|---|---|
| Quote/Confirm | quote0charge; explicit signed confirmation; replay once | შესრულებულია | engine/http/client Jest; Image PG | injected Google; real PG ledger/CAS ცალკე | PASS |
| Generate/Edit | რეალური Google output და სწორი edit | provider არ გამოძახებულა | Phase6 plan | verified isolated Google env/approval აკლია | BLOCKED |
| References/roles | owner inputs, role/order/digest | კონტრაქტები და უარყოფა შესრულებულია | assets/prompt/provider tests | synthetic references | PASS |
| Visual fidelity | character/outfit/product და უცვლელი საწყისი სურათი | actual generated samples არ არსებობს | owner visual review plan | real Google required | BLOCKED |
| Versions/edit UI | owner source, child lineage, comparison | UI და რეალური seeded lineage შესრულებულია | browser5; free E2E3 | Chromium mocks + real local DB/Storage | PASS |
| Auth | anonymous401, authenticated identity | შესრულებულია | image-contracts.spec.ts | real local Supabase Auth | PASS |
| RLS | Aხედავს საკუთარ rows-ს; Bვერ ხედავს | შესრულებულია | free E2E | authenticated user clients, real DB RLS | PASS |
| Private Storage | signed PNG digest; foreign/public refusal | შესრულებულია | free E2E | real local Storage, synthetic PNG | PASS |
| Library | owner-only images and versions | შესრულებულია | free E2E | real local API/DB; seeded rows | PASS |
| Credits | duplicate confirms→1debit; quote0; free checks0 | ImageDB3/3; free afterAll invariant | image.json; E2E logs | real PG; provider injected | PASS |
| Refund/cancel | one refund; foreign cancel denial; no late dispatch | შესრულებულია | ImageDB+engine tests | real ledger/CAS; injected failures | PASS |
| Provider outage settlement | actual remote outcome, debt reconciliation | live drill არ შესრულებულა | runbook AC07–09 | isolated real worker/Redis/provider required | BLOCKED |
| Job Recovery | leases/retry/fencing/idempotent persisted state | headLease7/7; mainLease9/9, before+after | Image Acceptance / billing jobs | real PostgreSQL/PostgREST; synthetic provider | PASS |
| Full Image recovery lifecycle | real Google in-flight cancel/restart, no double inference | არ შესრულებულა | Phase6 plan | real distributed environment | BLOCKED |
| Redis configuration | Marketplace wins, no credential-pair mixing, fail-closed | before2FAIL; after30/30PASS | main-redis-before/after | mocked Redis; exact main helper | PASS |
| Real Redis admission | distributed user/global limits/release | real instance არ გამოყენებულა | isolated Redis gate | credentials/isolated instance absent | BLOCKED |
| One Window KA/EN/RU | quote→confirm→refresh→cancel |3locale scenarios PASS | browser results | Chromium intercepted API | PASS |
| Mobile Library/variants/keyboard | sequential variants; edit/compare; explicit confirmation |2additional scenarios PASS | browser results |390×844 Chromium, not physical iOS | PASS |
| Agent G | trusted draft→quote; no model spend authorization | registry/commands tests PASS | focused Jest | injected agent dependencies | PASS |
| Agent G live conversation | real session uses Image tools with correct scope | live model session არ გაშვებულა | runbook AC12 | separate isolated session required | BLOCKED |
| Video coexistence | existing Video and Image share main safely | tree-identical integration;38/38 live suite | tree-equivalence.json; run38454305911/attempt2 | real local Supabase desktop/mobile emulation | PASS |
| Hosted Preview | real hosted Image lifecycle | only Preview Contract/mocked Image UX validated | separate hosted gate | verified hosted env absent | BLOCKED |
| TypeScript/ESLint/Jest/Build | no in-scope failures | PASS;13,928Jest pass/70skip; first font failure retained | CI+local lint | main+Image tested tree | PASS |
| Google paid lifecycle |1inference/debit, actual output→private Storage | separate components only verified | Phase6 plan | Google/app/Redis/DB/Storage together | BLOCKED |

Synthetic completed rows are fixtures, not generated jobs. Real-service3/3 proves Auth/RLS/Storage/Library boundaries only. Existing final capability flags remain unverified. See [Evidence Ledger](EVIDENCE_LEDGER.md) for exact runs/skips and first-attempt failure.
