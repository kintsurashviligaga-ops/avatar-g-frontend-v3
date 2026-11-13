# v5.1 Phase 4 prep: Browser Agent, code sandbox packages, App Builder

**Status: PREPARED, NOT WIRED.** This is a draft PR based on `main`, kept separate from the engine stack (#308 → #309 → #310 → #311). No route, tool or UI calls this code, and nothing in it spends money. Production Supabase is down, so everything is pure code with mocked tests, the same way the engine was built. Every switch listed below stays off until GG approves it.

## 1. What runs in production today (verified in code on `main`)

| | Today | Limits |
|---|---|---|
| Browser | `lib/agent/browser`: Agent G plans a **fixed** list of steps (goto, click, type, press, wait, text, links, screenshot). The list runs once in a throwaway Vercel Sandbox with Chromium from a snapshot, then the VM is destroyed. | Public hosts only. No passwords. 20 steps, 5 screenshots, 120 s. Costs come from the $20 sandbox ledger. Admin-only (D-08). |
| Code sandbox | `lib/agent/sandbox`: Python, Node.js or bash. **Deny-all network.** Workspace files go in and come back out. Each run is saved as a PDF in the Library. | 1 vCPU, 2 GB, 60 s, 50 runs a day. Admin-only. |
| App Builder | Does not exist. | |

## 2. What this PR adds (pure code + tests)

### 2.1 Browser Agent loop: `lib/agent/browserAgent/loop.ts`
The agent decides **one step at a time** from what the page shows now. Today's browser runs a list that was planned up front.

- **observe → decide → check → act**, repeated until the goal is done.
- A `Decider` picks each step. There are two kinds, behind one contract:
  - `planner`: Gemini reads the page as text. This is the default.
  - `computer-use`: Gemini Computer Use reads a screenshot. This is the D-16 pilot: admin-only, under $1, and Playwright stays the executor. The model only proposes an action, and the loop checks every one.
- **Every action goes through the same `checkBrowserTask` rules as a planned task.** On top of those rules, the loop:
  - stops for the user before typing into a password or payment field, before opening or acting on a sign-in or checkout page, and before any click that buys, sends or deletes something (English, Georgian and Russian labels);
  - stops when the same action repeats 3 times on the same page;
  - stops at its budgets: 25 actions, 5 minutes, 5 screenshots;
  - stops cleanly when the user stops it or the browser fails.
- The page is treated as data. The decider sees at most 4,000 characters of text and 40 links.
- Tests: `loop.test.ts`, 7 tests.

### 2.2 Packages for code runs: `lib/agent/sandbox/packages.ts`
- Only packages on an allowlist, each pinned to an exact version. No ranges, `latest`, URLs, git sources, paths or extra indexes.
- At most 10 packages. Package scripts never run (`npm --ignore-scripts`, `pip --only-binary=:all:`).
- The install command is an argv, never a shell string.
- During the install phase the network is open **only** to the registries (`pypi.org`, `files.pythonhosted.org`, `registry.npmjs.org`). The code phase that follows is deny-all, as today.
- Tests: `packages.test.ts`, 5 tests.

### 2.3 App Builder: `lib/agent/appBuilder/spec.ts`
- **Templates:** `static` (plain HTML/CSS/JS, no build) or `vite-react` (built in the sandbox).
- **The template owns** `package.json`, the lockfile and the Vite config. The app's files can never replace them, so a build can't be pointed at other scripts or registries.
- **Files:** up to 40 text files under `src/` or `public/`, plus `index.html`. At most 128 KB each and 512 KB in total. Path tricks are refused.
- **No secrets:** a file that looks like it holds a key (Google, OpenAI-style, private key, JWT, `service_role`) is refused, because a built site is public to anyone with the link.
- **Build plan:**
  1. Write the files.
  2. `npm ci --ignore-scripts` from the template lockfile, with registry access only.
  3. Install the allowlisted extra packages.
  4. `vite build` with **no network**.
  5. Copy `dist/` (at most 200 files) to the workspace at `apps/<id>/dist`.
- Tests: `spec.test.ts`, 5 tests.

## 3. What is left before any of this can be turned on

1. **Browser Agent session.** The loop needs one browser that stays alive for the whole task. Today's runner runs a list and is destroyed. Next: a `BrowserSession` over the same snapshot with `observe` and `act` commands, a wall-time cap, and every action charged to the $20 ledger. The live window (#282) streams its screenshots.
2. **Deciders.** A `planner` decider on Gemini 3.8 Flash (JSON answer, one action), and a `computer-use` decider for the D-16 pilot. Both need a small paid probe that GG runs, because the container has no GCP credentials.
3. **"Needs the user" card.** When the loop stops with `needs_user`, the card shows the pending action. One tap runs that single action, then the loop continues.
4. **Packages.**
   - Check the pins against the registries (they were written offline).
   - Add a reviewed constraints file or lockfile for transitive dependencies.
   - Add a two-phase sandbox run: install with registry egress, then code with deny-all. This network-policy change needs GG.
5. **App Builder.**
   - Template files for `vite-react` with a committed lockfile.
   - A builder step in the code sandbox (it reuses the packages install).
   - A **preview**: `apps/<id>/dist` served from a separate origin or with a strict CSP sandbox, never on myavatar.ge's own origin, so the app can't read the user's session.
   - A "publish to Library" step.
6. **Flags, all off by default:** `AGENT_BROWSER_AGENT` (off / admins), `AGENT_SANDBOX_PACKAGES` (off / admins), `AGENT_APP_BUILDER` (off / admins).
7. **Engine.** Each of these becomes a work-mode step kind in 3.5c (#311): a lease job, VALIDATE (admin-only under D-08), and a plan-level approval.

## 4. GG decisions (2026-11-13 12:34Z) and where they live in code

| Decision | Code |
|---|---|
| **Package installs: YES, strictly limited.** npm and PyPI are reachable only during the explicit install step, only for the pinned allowlisted packages. The Python or Node run step stays deny-all. | `twoPhasePlan` in `lib/agent/sandbox/packages.ts`: an `install` phase with registry egress, then a `run` phase with `egress: []`. A bad package list refuses the whole run and never falls back to running without the packages. |
| **App previews: a separate, isolated domain.** | `lib/agent/appBuilder/preview.ts`. `checkPreviewDomain` refuses myavatar.ge **and every subdomain of it**, including `sandbox.myavatar.ge`. A subdomain is "same-site": it receives cookies scoped to `.myavatar.ge`, SameSite doesn't protect against it, and it can set cookies for the parent domain. The preview domain must be a different registrable domain. **GG 13:06Z fixed it to `myavatar-apps.ge`** (`APPROVED_PREVIEW_DOMAIN`): any other value of `APP_PREVIEW_DOMAIN` keeps previews off. Each app gets its own origin (`app-xxx.myavatar-apps.ge`). Responses carry a strict CSP: only myavatar.ge may frame a preview (the builder pane, iframe `sandbox="allow-scripts"`), `connect-src 'self'`, no forms, no cookies. Unset → previews stay off. |
| **Browser Agent: admin-only (D-08), an explicit tap for every sensitive action, fail closed.** | `lib/agent/phase4/flags.ts`: only the exact value `admins` turns a flag on, and only for admins. There is no `everyone`. `sensitiveReason` in `loop.ts` now also holds: a field whose name looks secret (card, CVV, OTP, PIN, IBAN) even when the page didn't report it; any click or Enter on a page with a secret field; a submit button that doesn't say what it does; and any page that doesn't report its secret fields at all. |

**Owner steps before previews can go on (not done here):** register `myavatar-apps.ge`, point a wildcard `*.myavatar-apps.ge` at a **separate** Vercel project that holds no secrets and no database keys, and set `APP_PREVIEW_DOMAIN=myavatar-apps.ge` only there and in the main app once App Builder is turned on.

All three flags (`AGENT_BROWSER_AGENT`, `AGENT_SANDBOX_PACKAGES`, `AGENT_APP_BUILDER`) are off by default and stay off.
