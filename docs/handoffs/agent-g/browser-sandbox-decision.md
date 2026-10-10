# Agent G: browser control and code sandbox — decision brief (B1, B2)

Written 2026-10-10 for the owner, as part of Agent G PART 5 (`docs/handoffs/agent-g/part-5-report.md`). Nothing here
was bought, created or switched on. Both gaps stay **BLOCKED_OWNER**: each needs a paid, isolated host, and choosing
and enabling paid infrastructure is the owner's call (Master Task §15).

## 1. What is missing

| Gap | Today | What a user cannot do |
|---|---|---|
| B1: browser control | Agent G can **read** a public page (`scrape_webpage`, voice `read_webpage`: SSRF-safe, hidden text dropped since PART 5) and search with Google grounding. It cannot open a page in a real browser, run its scripts, click, type or scroll | "Open this site, find the price of X", "fill this public form for me", pages that render only with JavaScript |
| B2: code sandbox | `lib/agent/sandbox/policy.ts` fixes the rules any runner must enforce (Python or Node, at most 2 vCPU / 2 GB / 300 s, no network, no secrets, only the caller's own files in, read-only). The only runner refuses every job | "Analyse this CSV", "convert this file", any task that needs code Agent G writes |

Neither can run inside the web app's own functions: the code or page would share the process that holds the database
and provider credentials. Isolation means a separate microVM or gVisor container.

## 2. Options

Prices are list prices read on 2026-10-10 from the vendors' pages (links in §6). Estimates assume 2 vCPU and 4 GB.

| | A. Vercel Sandbox | B. Google Cloud Run jobs | C. A browser vendor (Browserbase, E2B …) |
|---|---|---|---|
| Vendor | Vercel, already the host | Google, project `gen-lang-client-0671348730`, already on WIF for Vertex | A new vendor: needs the owner's approval as an unapproved provider |
| Isolation | Firecracker microVM per sandbox | gVisor container per execution | Vendor-managed |
| Fits B1 (interactive browser) | Yes: a sandbox stays up while Agent G sends commands (navigate, click, read), up to 45 min (Hobby) or 24 h (Pro) | Poorly: a job runs a script to the end; step-by-step control would need a long-lived service with WebSockets | Yes, built for it |
| Fits B2 (run code once) | Yes | Yes | Yes |
| Price | Active CPU $0.128 / vCPU-hour, memory $0.0212 / GB-hour, $0.60 per 1M creations (Pro; Hobby includes 5 CPU-hours and 420 GB-hours a month, then pauses) | $0.000018 / vCPU-second, $0.000002 / GiB-second, 1-minute minimum; first 240,000 vCPU-s and 450,000 GiB-s a month free per billing account | Per-session plans; not priced here |
| One 2-minute browser task | ≈ $0.007 (CPU busy half the time) | ≈ $0.005, and ≈ 1,000 such tasks a month inside the free tier | — |
| Setup the owner must do | Turn Sandbox on for the team, set a spend limit (Spend Management) | IAM: let the Vercel WIF principal run one job; build and push one image to Artifact Registry; a budget alert | Account, contract, a new secret |
| Network policy | Per-sandbox allow / deny | VPC egress settings | Vendor-managed |

## 3. Recommendation

**A, Vercel Sandbox, for both, behind the existing rules; B stays the fallback for batch code if the owner prefers to
keep compute on Google's credit.** It is the only option that serves the interactive browser without new
infrastructure of our own, it needs no new vendor, and its per-task cost is under one cent at the sizes the policy
allows. C is not recommended: a new vendor for something A covers.

Whatever host is chosen, these rules do not change (they are in code and tests today):

- **Who starts it.** Running code or driving a browser changes state and can cost money, so it is a confirmed action
  the user presses (`lib/agent/tools/registry` refuses any `execute`, `write`, `publish` or `spend` effect for a model
  tool). The model can propose; it cannot start.
- **Code sandbox.** No network (`SANDBOX_EGRESS_ALLOWLIST` is empty), no secrets, the limits above, only the caller's
  own files in (checked by `lib/security/callerMedia`), results copied to the caller's own storage.
- **Browser.** Public `http(s)` pages only, the same address rule as `scrape_webpage` (no private, loopback,
  link-local or metadata addresses, each redirect re-checked), no logged-in sessions, no cookies or passwords of the
  user, no purchases, posts or form submits that send money or publish without a separate confirm. Page text reaches
  the model as untrusted data, hidden text removed, exactly as reads do now.
- **Platform rules.** No bypass of a site's access controls, logins, paywalls or bot checks; a blocked site is
  reported as blocked.
- **Money.** A per-account daily ceiling like the other free operations (`lib/api/rate-limit.ts`), and a spend limit
  on the host account set by the owner.

## 4. What the owner decides

1. **Host:** A (Vercel Sandbox), B (Cloud Run jobs), or not now.
2. **Spend limit** on that host (a monthly cap; Vercel Spend Management or a Google budget alert).
3. **Price to users:** free with a daily ceiling, or a credit price (the pricing table is owner action 5).

Until then B1 and B2 stay BLOCKED_OWNER, the runner keeps refusing, and Agent G says it cannot browse or run code.

## 5. What happens after a "yes" (engineering, no further owner step except where named)

1. A runner behind `checkSandboxJob` for the chosen host, refusing anything the plan does not allow; tests on a fake
   host first.
2. A `browser_*` tool set (navigate, read, click, type, screenshot) with effect `read` for navigate / read /
   screenshot and a confirmed action for anything that submits.
3. A Preview run on the owner's admin session (the PART 7 E2E), with the cost of each run logged
   (`agent_run_metrics`).

## 6. Sources

- [Vercel Sandbox pricing and quotas](https://vercel.com/docs/vercel-sandbox/pricing) (page updated 2026-09-10)
- [Cloud Run pricing](https://cloud.google.com/run/pricing) (jobs: CPU, memory and free tier)
