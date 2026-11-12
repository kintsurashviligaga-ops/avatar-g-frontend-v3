# 12 — Computer Use vs Playwright (D-09: evaluate only, no build)

## 1. What we have today (Playwright-style scripted browser)

`lib/agent/browser/{policy,runner,script}.ts`: Agent G plans a **fixed list of steps** (`goto, click, type, press, wait,
text, links, screenshot`; max 20 steps, 5 shots, 120 s), checked by a pure policy, then run in a **throwaway Vercel
Sandbox microVM** from the Chromium snapshot (no env, empty profile, private/metadata IPv4 ranges denied, password
fields refused). Worst case reserved against the $20 sandbox ledger first. Admin-only (D-08). Status
IMPLEMENTED_UNVERIFIED (LIVE window untested on a real cloud browser).

Weakness: the plan is written **before** seeing the page. Selectors guessed blind fail on real sites; multi-page tasks
need re-planning round trips.

## 2. What Google Computer Use is (P2, fetched 2026-11-12)

- A model tool: the model receives a screenshot + goal and returns UI actions (click at x,y, type, scroll, navigate…).
  **The client executes the actions** and sends back a new screenshot — Google does not host the browser.
- Supported models on the page: Gemini 4 Carbon, Gemini 4 Argon, Gemini 3.5–3.8 Flash; on generateContent and Interactions.
- Safety: per-action `safety_decision`; `require_confirmation` means the client must ask the user before executing;
  built-in prompt-injection detection on screen content.
- Price: same token rates as the underlying Gemini model (screenshots are input tokens).
- Launch stage and date: **not stated on P2** (Phase 0's "GA 10-30" came from a release-note excerpt → MEDIUM confidence).

## 3. Comparison

| Criterion | Scripted Playwright (today) | Computer Use loop (proposal) |
|---|---|---|
| Success on unknown sites | low–medium (blind selectors) | higher (sees the page each step) — **unmeasured** |
| Latency per task | one sandbox run, ~30 s start + steps | start + N model round trips (screenshot each) |
| Cost per task | sandbox minutes only | sandbox minutes + N × (screenshot input + action output) tokens on 3.8 Flash |
| Predictability / quote | exact worst case (steps fixed) | needs a step cap × per-step worst case; quote is a ceiling |
| Safety control | pure policy before run; no free actions | per-action check needed: our policy must vet **every** action + honour `require_confirmation` |
| Prompt injection | page text = data; plan fixed before page seen (strong) | model reads the page → injection surface larger; Google detection helps, our A3/A4 classes (`07` §3) still required |
| Vertex-only (D-05) | n/a | yes (Vertex surface) |
| D-06 | n/a | must stay on 3.5–3.8 Flash; Carbon/Argon not until price book |
| Infra reuse | — | same sandbox, snapshot, deny-list, reservation, workspace output |
| Visible process (Manus-like) | screenshots at fixed steps | natural: every step has a screenshot |

## 4. Recommendation (for GG)

Keep Playwright as the executor in both designs. Add Computer Use as an **optional planner** inside the same sandbox:
the model proposes the next action from a screenshot, our `policy.ts` checks it (same op set mapped from Google's
actions, same deny-list, A3 → approval record, A4 → refuse), then Playwright executes it. Hard caps: 20 actions,
120 s, 3.8 Flash only, admin-only (D-08).

Before any build (M-13), a **measurement pilot** with GG's OK: 10 fixed public-site tasks, scripted vs Computer Use,
record success, seconds, tokens, $. Estimated cost < $1 on 3.8 Flash promo rates (to confirm with countTokens on
a real screenshot — free). Decision on M-13 only from those numbers.

## 5. Unknowns

Launch stage on Vertex · rate limits for the tool · whether `safety_decision` appears on every action or only risky
ones · token count of one 1280×800 screenshot (free countTokens probe can answer).
