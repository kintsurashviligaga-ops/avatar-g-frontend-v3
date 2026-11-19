# 04 — Capability registry design

Goal: every user-facing capability knows **which Google model serves it, whether Google still offers it, whether our
project can call it, what it costs now, who may use it, and how proven it is** — and turns itself off or steps down
when any of those lapse. The 3.6 Flash retirement (found by hand on 2026-11-12, one week before shutdown) is the test
case this design must catch automatically.

## 1. Reuse, don't duplicate

The registry **merges** what exists: `lib/agent/capabilities.ts` (routes, pricing key, approval kind, retry, cancel,
proof label, pinned by tests to the code), `lib/models/catalog.ts` (model ids, enabled, notes) and the model chains in
`lib/ai/google/models.ts`. They become seed data for one typed registry; their tests stay.

## 2. Shape

```ts
// lib/capabilities/types.ts (design only)
type Surface = 'generateContent' | 'interactions' | 'predict-lro' | 'live' | 'speech-v2' | 'cloud-tts' | 'sandbox';
type Lifecycle = {
  stage: 'GA' | 'PREVIEW' | 'EXPERIMENTAL' | 'RETIRED' | 'UNKNOWN';
  releaseDate?: string;            // ISO date from the official page
  retirementDate?: string | null;  // null = "no date announced"; undefined = not on any page (UNKNOWN)
  replacement?: string;
  source: { url: string; fetchedAt: string; pageUpdated?: string };
};
type Entitlement = {               // our project's own evidence, never the catalogue
  state: 'OK' | 'DENIED' | 'NOT_FOUND' | 'UNTESTED';
  probe: 'countTokens' | 'models.get' | 'paid-contract' | 'production-use';
  at: string; detail?: string;     // e.g. "403 PERMISSION_DENIED", never a key or token
};
type ModelBinding = {
  modelId: string; surface: Surface; location: 'global' | 'us' | 'eu' | 'us-central1' | string;
  lifecycle: Lifecycle; entitlement: Entitlement;
  priceVersionId: string;          // 08-billing-design
  thinking?: { accepts: ('minimal' | 'low' | 'medium' | 'high')[] };
  interactions?: { store: boolean; reason: string };  // D-04: explicit per feature
};
type Capability = {
  id: CapabilityId;                // existing union from lib/agent/contracts
  bindings: ModelBinding[];        // ordered: primary first, then step-downs
  audience: 'owner' | 'admin' | 'everyone' | 'off';   // D-08 keeps code run + browser at 'admin'
  approval: 'none' | 'card' | 'approval-center';
  proof: 'MISSING' | 'PARTIAL' | 'IMPLEMENTED_UNVERIFIED' | 'VERIFIED_STAGING' | 'PROVEN_PRODUCTION' | 'BLOCKED' | 'UNKNOWN';
  evidence: string[];              // PR, run id, fixture path
};
```

## 3. Where the data lives

| Data | Store | Writer | Reader |
|---|---|---|---|
| Static capability definitions | `lib/capabilities/seed.ts` (code, reviewed in PRs) | engineers | build + tests |
| Lifecycle snapshot | `config/google-lifecycle.json` **and** table `lifecycle_snapshots` | lifecycle job (and a PR for each change) | router, alarms |
| Entitlement results | table `capability_state` | entitlement probe job, contract runs | router, admin page |
| Live overrides (kill switch) | table `capability_state.override` | owner in admin | router |

A code seed plus a DB overlay lets an owner switch a capability off without a deploy, while every model id still
changes only through a reviewed PR.

## 4. How the router decides

```
bindings(capability)
  → drop binding if lifecycle.stage = RETIRED or retirementDate ≤ today
  → drop binding if entitlement.state ∈ {DENIED, NOT_FOUND}
  → drop binding if capability_state.override = off
  → first remaining binding serves; on 404 / 429 / timeout the next one (as the chains do today)
  → none left → typed error `capability_unavailable` (honest message), never a non-Google fallback
```

## 5. Alarms (the 3.6 Flash case)

| When | Action |
|---|---|
| retirementDate ≤ today + 45 days | admin alert + backlog item ("migrate X → replacement") — 45 days is Google's own notice minimum for short-term models (`13` §1) |
| retirementDate ≤ today + 7 days | router prefers the next binding (still serves the old one as a step-down) and the owner is told |
| retirementDate ≤ today | binding dropped |
| model appears on no official page | lifecycle `UNKNOWN`; capability stays on but shows `UNKNOWN` in the admin truth page |
| CI | a Jest test reads `config/google-lifecycle.json` and **fails** if any primary binding retires within 21 days |

## 6. Lifecycle sync job

Daily: fetch the official model-versions and pricing pages (the same pages as `13`), parse the tables, write a
snapshot row, and open a **PR** (never a direct prod write) when a date or a price changes. Parse failure = alarm, not
silence. Rate: 1 fetch per page per day.

## 7. Entitlement probe job

Weekly and on deploy: free `countTokens` (or `models.get`) per binding against the production project, from a
Production-env function (WIF works only there). Never a generation. D-03 authorizes the first manual run
(`scripts/certify/vertex-contract-plan-3.json`).

## 8. Tests

- registry seed ↔ routes exist (existing `capabilities.test.ts` pattern);
- every binding has a lifecycle source URL and a price version;
- router: retired / denied / overridden bindings are skipped; empty → `capability_unavailable`;
- lifecycle 21-day CI guard;
- no binding names a Developer-API-only model (D-05) or a non-Google vendor.
