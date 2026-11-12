# 00 — Executive summary and Phase 0 final report (v5.1)

Date 2026-11-12 (UTC). Repo `avatar-g-frontend-v3`, audit base `main` @ `4c502c7`; production READY `970ca60`
(`4c502c7` was building at 09:10Z). Read-only audit: no source, test, schema, env, Vercel, GCP, Supabase or BOG change,
no deploy, no paid call. Google facts fetched live from official Google pages 2026-11-12 09:03–09:12Z (`04` §2).

## 1. Executive summary

MyAvatar.ge is a large, working Next.js 14 + Supabase product on Vertex AI only. Its core creative paths (chat, Veo and
Omni video with Georgian speech, Live voice and talking avatar, mic dictation, Georgian PDF, code run for admins) have
recorded owner use in production. Agent G already has quote → approve → reserve → execute → deliver for code, browser
and media, but its newest parts (browser agent, site agent, Work Mode, workspace) are in production for admins without a
recorded passing end-to-end run. The urgent problems are lifecycle and money, not features: the read-aloud default model
is failing and its id shuts down on 2026-11-17, the browser snapshot expires ~2026-11-13, eight routes still use a
second (legacy) credit ledger, Google's promotional prices end on 2026-11-30 / 2026-12-31, and Gemini 4 long decodes are
billed even on timeout from 2026-11-13. Gemini 4 Carbon/Argon, Omni 1.2, Nano Banana 2.1 and Lyria 3.5 are GA but not
used. Gemini Decision exists only on the Developer API, which our Vertex-only policy excludes.

## 2. What works today (evidence)

Chat (3.8/3.6 Flash, 3.1 Pro) · Veo 3.1 Fast/Standard (owner E2E 2026-10-26, contract #269) · Omni Georgian speaking
video + „გააგრძელე" continue (owner 2026-10-26) · Live voice + talking avatar `gemini-3.8-live` (owner 2026-10-26) ·
Chirp 3 mic ka/ru/en (owner 2026-11-01) · Georgian PDF → Library (DOC-01 2026-10-31) · code run for admins (CODE-01
2026-11-01) · canonical credit ledger with reserve / refund-on-miss · Drive link + pick (desktop) · CI green on
`970ca60`. Details: `11-truth-matrix.md`.

## 3. What partially works

Image on `gemini-3.1-flash-image` (contract PASS, no owner E2E after it) · music with vocals (flag on, no listening
check) · Drive answers (DRIVE-01 not run; iPhone Safari second open fails) · task graph / Work Mode (no parallel steps,
offline test only) · MCP client (empty allowlist) · Interactions use (storage settings unknown) · approvals (per card, no
approval center).

## 4. What is broken

- Read-aloud: default `gemini-2.5-flash-preview-tts` answered HTTP 500 twice in paid certification (#269); the id is not
  on the Vertex endpoint table and its Developer-API id shuts down 2026-11-17 (B-01).
- Imagen 4 path: model shut down 2026-08-17 and 404 on Vertex (dead code behind an opt-in flag).
- `chirp_3` request with several listed languages → 400 (the adapter works around it with the Georgian leg).

## 5. What is missing

Gemini 4 Carbon/Argon · Gemini Decision · Google Computer Use · Omni 1.2 · Nano Banana 2.1 · Lyria 3.5 · provider cost
reconciliation · timeout-cost handling · parallel DAG · approval center · Gmail/Calendar · multi-file app builder ·
DOCX/XLSX/PPTX · safety identifiers · Georgian QC corpus · staging environment separate from production.

## 6. Unknown, and how to resolve

| Unknown | Resolve by |
|---|---|
| Is legacy `public.credits` live; are the 8 legacy callers reachable? | owner runs read-only `docs/ledger-unification/01_introspect.sql` |
| Vertex lifecycle for 3.5/3.7 Flash, Omni 1.1 preview, Lyria ids, Chirp 3 | fetch the full Agent Platform model-versions page (only partly readable today) and Cloud Speech docs |
| Project entitlement for Carbon, Argon, Omni 1.2, Nano Banana 2.1, 3.8 TTS | free `models.list` / `countTokens` probe from a Production-env deployment (owner OK, D-03) |
| Interactions `store` / retention on Vertex | read Vertex Interactions docs + inspect request bodies |
| Stripe / IAP live status | owner confirms; Vercel env names |
| Developer-API rate limits page | fetch `ai.google.dev/gemini-api/docs/rate-limits` (not fetched) |

## 7. Critical security and financial risks

Financial: two ledgers (B-02); promo price ends; timeout billed for long decodes; no reconciliation; BOG not certified
(B-03). Security/privacy: Previews read the production DB; Interactions stores by default; browser policy is a deny-list;
~60 routes still import refused vendor clients; non-Google SDKs still installed. No secret was found in the repo; no
critical security failure was found that stops the audit.

## 8. Existing functionality to preserve

See `08-gaps-risks-and-priorities.md` "Existing functionality to preserve".

## 9. Google model verification table

`04-google-ai-integration-audit.md` §4 (every model id in the runtime, official URL, status, retirement, runtime
evidence, verdict; sources S1–S17 with fetch times).

## 10. Project entitlement / runtime findings

No runtime probe today. Last evidence: certification #269 (2026-11-06) PASS for image, Lyria 3 Pro, Veo 3.1 fast +
standard, Cloud TTS ka/ru, Chirp 3 ka; FAIL for the read-aloud default and the multi-language Chirp request. Custom
avatar and lip-sync = BLOCKED by Google allowlist.

## 11. Carbon and Argon

Separate GA models (Carbon 2026-11-10, Argon 2026-10-13), 1M context, 1M output, long decode on `v1beta1` /
Interactions. Carbon: thinking LOW/MEDIUM/HIGH only (MINIMAL or `thinking_budget` → 400), `temperature`/`top_p`/`top_k`
ignored, Computer Use supported, Live not. Argon Vertex price $2/$10 per 1M to 2026-11-30, $4/$20 from 2026-12-01;
Carbon Vertex price not published. Not referenced in the repo.

## 12. Omni: official vs internal

We call `gemini-omni-1.1-flash-preview` (Vertex Preview name; the Developer API GA name is `gemini-omni-1.1-flash`).
`gemini-omni-1.2-flash` is GA on Vertex since 2026-11-05 (global, Interactions only, 3–15 s, up to 4K, edit/extend/
upscale, no grounding/tools/system instructions). No alias or auto-routing from 1.1 to 1.2 is documented.

## 13. Long-decode pricing

No separate long-decode tier on Vertex. From 2026-11-13 a completion over 32K tokens is billed even if it fails by
timeout. Our refund-on-miss model must change before any long decode.

## 14. Interactions API storage

`store=true` by default; 55 days paid (7/14/28/55 configurable), 1 day free; `background` needs storage; tools and
system instruction must be resent each turn; `delete` exists. Our Omni continuation depends on stored interactions.

## 15. Gemini Decision suitability

`gemini-decision-1`, Developer API v1beta only, closed-ended yes/no / choice / score with calibrated confidence, zero output
tokens, 262K context. Not a generator or planner. Unusable on our Vertex-only transport unless the founder allows a
Developer-API path (D-05).

## 16. Financial and BOG findings

`06-financial-and-bog-audit.md`. Idempotency key = our `ref` (`bog:<shop_order_id>` for BOG), enforced by unique
partial indexes and row locks; BOG callback RSA-verified on the raw body; no BOG retry, cron + return page reconcile.

## 17. Multi-tool readiness

`10-multi-tool-readiness-audit.md`. Python/Node sandbox, browser, workspace, SSE timeline, Library exist; Computer Use,
Gmail/Calendar, app builder, approval center and parallel DAG do not.

## 18. Recommended target architecture (direction only; Phase 1 designs it)

Keep the Next.js + Supabase + Vertex shape. Add: (a) one **capability registry** fed by a dated Google lifecycle table
(model id, surface, region, status, retirement, price version) that disables a capability when its source lapses;
(b) one ledger (canonical) with versioned prices, reservation sized to worst-case cost, settlement against Cloud Billing
export, and timeout-cost rules; (c) Agent G engine = persisted task graph with parallel steps, a server-side approval
center, Gemini 3.8 Flash for routing and Argon/Carbon only for approved deep tasks; (d) a real staging project with its
own Supabase DB; (e) Interactions with `store` and retention set explicitly per feature.

## 19. Prioritized roadmap

P0 (now, small): fix read-aloud model, remake browser snapshot, prune dead ids. P1: retire legacy ledger, versioned
prices before 2026-11-30, timeout-cost rule, Interactions retention policy, Omni 1.2 and Nano Banana 2.1 migrations with
paid tests, BOG sandbox certification. P2: capability registry, staging DB, approval center, parallel DAG, Computer Use
(if approved), Gmail/Calendar, Georgian QC corpus. Details and sizes: `08`.

## 20. Complexity estimates and assumptions

`08` "Complexity estimates".

## 21. External dependencies

Google (Vertex quotas, allowlists, price changes), Vercel (Sandbox snapshots, env), Supabase (prod DB, owner SQL), Bank
of Georgia (sandbox credentials), Google OAuth verification (Gmail restricted scopes), Pexels.

## 22. Founder decisions required

See `docs/execution/DECISIONS.md` D-01 … D-10. The first one is Phase 1 approval itself.

**Phase 0 is complete. Work stops here until the founder explicitly approves Phase 1.**
