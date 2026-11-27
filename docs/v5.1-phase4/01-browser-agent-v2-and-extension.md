# Browser Agent v2 (Phase 8.11) and the Chrome extension question

**Status: PREPARED, NOT WIRED.** This PR is stacked on #312 (`claude/phase4-prep`). No route, tool or UI calls this code yet. Everything sits behind `AGENT_BROWSER_AGENT`, which is admins-only and off today. Nothing here spends money.

## 1. Where the browser really is today (checked in code)

- **`main` (production, admins only).** Agent G plans a fixed list of up to 20 steps. The list runs once in a throwaway sandbox, then the VM is destroyed. Pressing "continue" starts a new batch with a new browser. The new browser has no cookies, no open page and no scroll position, so a form half-filled in batch 1 is gone in batch 2. While it runs, the live window gets a screenshot about every 1.5 s, but no cursor is drawn.
- **#312 (draft).** Adds the one-step-at-a-time loop (observe, decide, check, act) and its safety rules. It has no browser session behind it, so it cannot run.
- **Gemini Computer Use is not integrated anywhere.** D-09 said "evaluate only" and D-16 said "admin pilot under $1". No code calls the Computer Use model. This PR prepares the mapping only.

## 2. What this PR adds

| File | What it does |
|---|---|
| `lib/agent/browserAgent/actions.ts` | Adds what a person does on a page: `scroll` (by pixels or to an element), `select`, `check`, `hover`, `click_at {x,y}`, `move_to {x,y}`, `type_focused`, `fill_form` (≤ 12 fields), `elements`, `back`. Each action is checked by one function. The old ops still go through the planned-task rules unchanged (public hosts, short waits, short typing). |
| `lib/agent/browserAgent/driver.ts` | A browser that **stays open** for the whole run and takes one command at a time through a small file protocol (`cmd-n.json` → `res-n.json`). The mouse glides to its target in steps and typing has a short delay per key, so menus that open on hover and fields that check as you type behave as they do for a person. It refuses to type into password, card or one-time-code fields, including when such a field only has the focus. After a click or Enter it waits for the next page to load. It lists every visible control with its own selector and box, so the decider never guesses CSS. |
| `lib/agent/browserAgent/sandboxSession.ts` | The loop's `BrowserSession` over one sandbox. Every wait has its own deadline and listens to the user's Stop. After every step, `onLive` hands over the picture, the cursor position and the result. |
| Live view | The driver draws the agent's cursor (an arrow) on each `live.jpg`, so the user sees **where** the agent is about to click, not only the page. |
| `lib/agent/browserAgent/computerUse.ts` | Maps Gemini Computer Use's UI functions onto these actions. Its 0–999 grid is converted to pixels on the 1280×800 viewport. Supported: `click_at`, `hover_at`, `type_text_at`, `key_combination` (single keys only), `scroll_document`, `scroll_at`, `navigate`, `go_back`, `wait_5_seconds`. Drag and drop and key combinations such as Ctrl+A are refused. The model only proposes an action; the loop checks it and may hold it for the user. |
| `lib/agent/browserAgent/loop.ts` | The safety rules now also cover the new actions: <ul><li>A `click_at` is hit-tested against the page's controls. A point on a "Buy / Pay / Send / Delete / გადახდა …" button, on a secret field, on an unlabeled submit button, or on a page that did not list its controls waits for the user.</li><li>`type_focused` and `click_at` on a page that has a password field wait for the user.</li><li>Ticking a box whose label commits (for example "I agree to pay") waits for the user.</li></ul> |

**Tests** (mocked plus a real headless Chromium against a local page, no network): `actions.test.ts`, `computerUse.test.ts`, `loop.v2.test.ts`, `driver.test.ts`, and the unchanged `loop.test.ts`. Together that is 29 tests. The driver test covers:

- hovering a menu open;
- filling a form;
- picking from a list;
- ticking a box;
- refusing the password field;
- scrolling;
- clicking a point;
- typing into the focused field and replacing its text;
- the cursor on the live picture.

A bug found while writing it, now fixed: Playwright's mouse starts at (0, 0), so the agent's first glide crossed the page's top-left corner. On the test page that opened a hover menu and shifted the form 19 px, and the next click landed on empty space. The driver now parks the mouse where the cursor is drawn before the first command.

### What turning it on would take (not in this PR)
1. Wire `runBrowserAgent` + `SandboxBrowserSession` into Agent G's browser tool, behind `AGENT_BROWSER_AGENT=admins`.
2. Send `AgentLive` (picture + cursor + last step) through the existing task stream. The live window already draws pictures; it needs to draw the cursor dot and the step label too.
3. Pause the "waits for the user" step as a card in chat: "The agent wants to press „გადახდა". Allow / Stop".
4. The paid D-16 Computer Use pilot, admin-only, under $1. Before anything depends on the function names and the grid, they must be checked against the live model.

## 3. Chrome extension or cloud browser?

**Recommendation: keep the cloud browser as the only browser. Do not build an extension now.** Revisit it only if a real need appears that the cloud browser cannot meet, and then only as an admin pilot.

### What an extension would give
- The user's own signed-in sessions (Gmail, bank, internal tools) with no login step.
- The user's own IP and country, so fewer bot walls and captchas.
- No sandbox cost per minute.

### Why the cloud browser is better for MyAvatar.ge now
| | Cloud browser (today) | Chrome extension |
|---|---|---|
| Reach | Every user on every device, including phones. Most of our users are on iPhone, where Chrome extensions don't exist. | Desktop Chrome only. A separate install and review for every update. |
| Blast radius | A throwaway VM with no access to the user's cookies. The worst case is one bad page in a box we destroy. | It runs inside the user's real browser, with every session they're signed in to. A prompt-injection on one page could act on their bank or mail tab. |
| What the user sees | The same live window in our UI, which we control. | The user watches their own tab move. Chrome's own "is debugging this browser" bar appears and cannot be hidden. |
| Our rules | Enforced in the driver we ship and in the server loop. | The server can check each action, but the code that clicks runs on a machine we don't control. |
| Store and legal | None. | Chrome Web Store review of `debugger` / `<all_urls>` permissions. A privacy policy for page contents leaving the device. GDPR questions about reading pages from the user's other tabs. |
| Cost | Sandbox minutes from the $20 ledger. | Free per run, but a second product to build, review and support. |

Logging in to a site the user chose is the main thing an extension would add. That already has a safer path in draft #346: the user types the password in our own login card, it is encrypted in the vault, and the cloud browser uses it once. Their own browser is never touched.

### If GG later wants an extension pilot, the shape would be
- **Manifest V3**, using the `chrome.debugger` API for real mouse and keyboard input. Chrome shows its own warning bar while it is attached. The extension does not try to hide it.
- **Pairing:** the user opens myavatar.ge, presses "connect this browser", and the page hands the extension a short-lived token tied to that user. Nothing works without it, and it can be revoked from Settings.
- **One tab at a time, with consent:** the agent works only in a tab the user picked for this task, never in other tabs. Closing the tab ends the task.
- **The same rules:** each proposed action goes to the server and through `checkAgentAction` and `sensitiveReason` first. The extension only executes what the server approved. Anything sensitive still waits for the user's tap.
- **Never:** reading or exporting cookies, reading other tabs, history or passwords.
- **Admins only**, behind its own flag, and only after a security review.

## 4. Flags and safety
- `AGENT_BROWSER_AGENT`: anything but `admins` means off. Off today.
- No merge, and no paid call, until GG says so.
- Billing and BOG are untouched.
