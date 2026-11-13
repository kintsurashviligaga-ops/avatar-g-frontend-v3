# 04 — Computer Use confirmation policy (DRAFT, code prepared, not wired)

Computer Use is not built (D-09 evaluation done, D-16 pilot not run). This is the contract any build must meet, and
`lib/agent/computerUse/confirmPolicy.ts` encodes it with 9 tests.

## Roles

- **Gemini Computer Use proposes** one action at a time (`click_at`, `type_text_at`, `navigate`, …). Each may carry a
  `safety_decision`; `require_confirmation` means a person must agree first.
- **Our Playwright runner executes**, in a throwaway sandbox with an empty profile, the same as today's browser agent
  (`lib/agent/browser/policy.ts`). The model never touches the browser directly.
- **The user decides** on anything with an outside effect, by an explicit tap on a card.

## Verdicts (`judgeAction`)

| Situation | Verdict |
|-----------|---------|
| run over 20 actions or 120 s | refuse |
| action name we do not map | refuse |
| `navigate` to a non-public host (localhost, IP literal, `.internal`, user:pass@) or a non-http URL | refuse |
| model says `require_confirmation` | confirm |
| a `safety_decision` value we do not recognise | confirm (fail closed) |
| typing into a password, one-time-code, card, IBAN or similar field | confirm |
| a click or Enter on buy / pay / order / send / submit / delete / confirm (en, ka, ru) | confirm |
| `navigate` to a different site than the current one | confirm |
| anything else (scroll, plain clicks, reading) | allow |

## The confirmation itself

- Bound to `(runId, actionIndex, actionHash)`: a tap cannot be replayed onto another action or a later step.
- Only a **tap** counts. Typed or spoken "yes", and anything the model says, never confirm (D-08 spirit, Phase 7 rule).
- Expires after **2 minutes**; an expired card ends that branch.
- A decline ends that branch honestly and tells the model it was declined.
- `safety_acknowledgement` is sent back to Google only when Google itself asked and the user tapped yes.

## Still fixed regardless

Admin-only (D-08). No user credentials, cookies or sessions in the browser. Never pay, enter card data or log in on the
user's behalf without that tap. 3.8 Flash for the pilot, spend inside a GG-approved budget.

## To verify when building

The exact field names (`safety_decision.decision`, `safety_acknowledgement`) against Google's current Computer Use docs;
the policy treats any unknown value as `confirm`, so a rename fails safe.
