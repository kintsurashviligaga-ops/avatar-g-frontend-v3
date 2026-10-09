# Production schema drift (2026-10-08)

Checked live against the Production Supabase project `zwksnayknzggdcenqqxy` on 2026-10-08 at 16:05 UTC, through the
Supabase connector, read-only (`pg_class` in schema `public`). Code side: every `.from('<name>')` in `app/`, `lib/`,
`components/`, `workers/` and `services/` on branch `claude/launch-certification-wmvitt`, tests excluded, storage
bucket names removed. `main` (572d5fac) gives the same result.

## Result

- Production `public` has **52** tables and views.
- The code calls `.from()` on **160** names. **124** of them do **not** exist in Production.
- Production's migration history (`supabase_migrations`) has 11 entries; most of the repo's `supabase/migrations/`
  files were never applied there, so the repo's migrations folder does not describe Production.

### Tables in Production (52)

Music_jobs, active_visitors, admin_emails, agent_configs, agent_evolution_traces, agent_execution_feedback,
agent_video_queue, analytics_events, artifacts, avatar_builder_jobs, avatars, bog_orders, character_references,
chat_messages, chat_sessions, clip_cache, commission_rules, credit_ledger, credit_transactions, director_runs,
error_logs, feature_flags, gemini_chat_messages, gemini_chat_sessions, gemini_message_feedback,
generation_checkpoints, generation_jobs, image_architect_jobs, job_steps, jobs, memories, music_jobs, notifications,
payout_requests, pricing_tiers, profiles, project_intelligence, prompt_optimization_proposals,
provider_webhook_events, render_jobs, studio_jobs, subscription_allowance_grants, subscriptions, support_chats,
support_messages, transactions, user_creations, user_profile_metadata, voice_calls, voice_jobs, voice_samples,
wallet_topups.

### Called by the code, missing in Production (124)

affiliate_clicks, affiliate_commission_events, affiliate_conversions, affiliate_payouts, affiliate_referrals,
affiliate_tracking, affiliates, agent_definitions, agent_g_calls, agent_g_channel_events, agent_g_channels,
agent_g_connect_codes, agent_g_events, agent_g_memory, agent_g_subtasks, agent_g_tasks, agent_g_user_prefs,
audit_logs, avatar_assets, billing_webhook_events, business_agent_projects, business_agent_runs,
business_item_events, business_items, business_profiles, business_projects, conversations, credits, credits_ledger,
disputes, events, execution_trace, executive_task_logs, finance_daily_aggregates, fraud_checks, fulfillment_errors,
fulfillment_jobs, growth_kpis, inventory_movements, invoice_counters, invoice_items, invoices, job_logs,
job_runtime_logs, launch_30_plans, launch_plans, launch_readiness_checklist, longform_jobs, longform_scenes,
marketplace_favorites, marketplace_inquiries, marketplace_listings, marketplace_messages, marketplace_orders, media,
messages, onboarding_events, orchestration_runs, order_items, order_line_items, order_shipments, orders,
org_branding, org_members, payment_attempts, payment_provider_configs, payments, payout_accounts,
platform_commissions, products, profit_first_config, profit_snapshots, project_versions, projects,
push_subscriptions, referral_codes, referral_events, refunds, return_requests, runtime_logs, seller_payouts,
seller_profiles, service_jobs, service_outputs, shipment_events, shipments, shipping_events, shipping_profiles,
shipping_rates, shipping_zones, shop_stores, shop_wallets, shops, simulation_scenarios, smm_assets, smm_posts,
smm_projects, stores, stripe_connect_accounts, stripe_connect_events, stripe_events, stripe_invoices,
stripe_payments, supplier_products, suppliers, support_tickets, tax_accounting_records, tracking_tokens, tracks,
usage_meter_events, user_consents, user_credits, user_profiles, video_clips, videos, voice_assets, voice_profiles,
voice_projects, wallet_transactions, webhook_events, worker_heartbeat, workflow_definitions, workflow_runs,
workflow_step_runs.

### Already known consequences

- Stripe webhook: `webhook_events` is missing, so its dedupe is in-memory only (`isEventProcessed` reads `data: null`,
  `markEventProcessed` logs the error and the webhook still answers 200). Credit grants (`sub:<invoice>`,
  `stripe:<session>`) and the refund / dispute reversal refs are idempotent through `deduct_credits` /
  `credit_ledger`, which exist.
- `/api/admin/payments` reads `stripe_events` and `payment_attempts`, neither exists: the admin Payments view has no data.
- Migration `20261008a` (RLS on 9 internal tables) was a no-op in Production for this reason.

## Which live features break

Triage of 2026-10-08 (read-only, branch head ebec2f74): for every `app/api/**/route.ts` and every page under
`app/[locale]`, `app/share` and `app/auth`, the import graph was followed to the missing tables it can reach and the
`/api/...` URLs pages call were collected; the handlers that matter were then read. Supabase-js does not throw on a
missing table, it returns `{ data: null, error }` (PGRST205), so what matters is how each caller treats `error`.
Runtime-built URLs are not seen by this method. `media` in the list above is a storage bucket, not a table.

### HARD on a live path (1) — fixed on this branch

- Agent G hub, Connectors tab (`HubSheet`, mounted on the dashboard, home, settings, library and studio pages):
  `GET /api/agent-g/channels` answered 500 to every signed-in user because `agent_g_channels` is missing, so the tab
  showed Telegram and WhatsApp as broken even when the bot is configured. The route now returns the runtime status
  with `channels: []` and `channels_unavailable: true`, and logs the error (`app/api/agent-g/channels/route.ts`, test
  `route.test.ts`). Production keeps the 500 until this branch is deployed.

### SILENT on live paths (the feature does nothing or drops data)

| Feature | Missing tables | What happens |
|---|---|---|
| Credits chip, Settings | `credits` | `/api/credits/balance` balance is right (`profiles.credits_balance`); `monthlyAllowance` and `resetAt` are always null |
| Generation notifications (every studio generation route, via `lib/notifications/dispatch.ts`) | `push_subscriptions`, `agent_g_channels` | push and WhatsApp report `not_configured`; the in-app bell (`notifications`) works |
| Push opt-in card | `push_subscriptions` | shows "not set up"; `/api/push/subscribe` answers 503 |
| WhatsApp link card (Settings, hub) | `agent_g_channels`, `agent_g_connect_codes`, `agent_g_channel_events` | "not available"; POST answers 503; nobody can link WhatsApp |
| Live-avatar enroll | `avatar_assets` | insert logged and skipped; the storage object is the real record (by design) |
| Stripe webhook `/api/stripe/webhook` (alias `/api/webhooks/stripe`) | `webhook_events`; `affiliates`, `affiliate_*`; `finance_daily_aggregates`, `stripe_invoices`, `stripe_payments`, …; `user_profiles` | dedupe is in-memory per instance (credit effects stay idempotent on `stripe:<session>`, `sub:<invoice>` and the reversal refs through `deduct_credits`); no affiliate commission is ever recorded; finance aggregates are dropped; customer mapping falls back to `subscriptions` |
| `/api/billing/webhook` (a second Stripe endpoint) | `billing_webhook_events`, `credits` | dedupe lost; `monthly_allowance` upsert dropped; wallet top-up credit unaffected (idempotent RPC). It does **not** handle `charge.refunded` / `charge.dispute.created`: the credit reversal runs only on `/api/stripe/webhook` |
| Cron `/api/app/worker/tick` (every 2 min) | `service_jobs`, `agent_g_channel_events` | scan fails and is logged, the tick carries on; Telegram inbound log dropped |

### Clean (no missing table on the path)

Sign-up and sign-in (`/api/auth/*`, `app/auth/callback`); studio chat (`/api/chat/*`, `/api/agent/run`); BOG checkout,
orders, webhook, subscription and its cron; uploads; Stripe tier and wallet checkout; profile, settings, memory,
support chat, referral panel; the main admin panel.

### DEAD (no UI caller, or behind a flag that is off)

- Agent G tasks / calls / memory (`agent_g_tasks`, `agent_g_subtasks`, `agent_g_calls`, `agent_g_user_prefs`,
  `agent_g_memory`, `agent_g_events`): no mounted caller; memory is behind `AGENT_G_MEMORY_ENABLED` (default `false`).
- Credit enforcement in `lib/billing/enforce.ts` throws when `credits` is missing: a 500 on `/api/ai`,
  `/api/voice-lab/jobs`, `/api/agents/execute`, `/api/app/services/[slug]/run`, `/api/video/generate`,
  `/api/app/workflows`; none has a linked UI caller.
- Vapi voice webhook: `deductCreditsForCall` reads 0 from the missing `credits` table and charges nothing. Dead only if
  Vapi is not configured in Production (not checked: the Vercel connector was refused the env list); if it is
  configured, this is a revenue leak.
- Account pages `/account/billing|invoices|payments`, marketplace / shop / shipping / commerce, affiliate, business
  agent, SMM, observability, long-form video (`LONGFORM_VIDEO_ENABLED`), `/api/app/*`, `/api/projects/*`,
  `/api/voice-lab/*`, `/api/support`, `/api/growth/referrals/*`: no page links to them, or legacy URLs redirect home.

### What this means

- Only one live 500 (fixed on the branch). The rest is features that quietly do nothing in Production: WhatsApp
  linking, push notifications, affiliate commissions, Stripe webhook dedupe, monthly-allowance display.
- Creating tables is a per-feature decision (each also needs its own keys and an RLS review: the repo's original
  `agent_g_channels` policy let a browser write links directly, which the current code forbids). Not done without the
  owner's approval.
- Owner action 5 must point at the right endpoint: the refund / dispute reversal runs only if the Live endpoint's URL
  is `/api/stripe/webhook` or `/api/webhooks/stripe`, not `/api/billing/webhook`.

## Triage update (2026-10-09, fix order row 11)

Read-only again: code on branch head `7cc1a781`; every path below is byte-identical to Production `29e7d67`. Production
`public` still has the same 52 tables (read 08:25Z). Since 2026-10-08 the static ratchet `__tests__/schema-drift.test.ts`
also reads `.rpc()` names and `const`-named tables, so the gap is now **125 tables and 11 functions** (new names:
`research_jobs`, `research_context_files`, `user_plugin_settings`, `auth.users`; `media`, `onboarding_events` and
`payment_provider_configs` left the list). The reachability map follows every route and page import graph to a missing
name; it over-approximates (a shared import reaches a table its branch never touches), so each hit below was read by hand.

### The 11 missing functions

| Function | Caller | Class | Why |
|---|---|---|---|
| `debit_wallet_gel` | `lib/observability/agentTrace.ts` | DEAD | debits only with `deduct: true`; no live caller sets it (film passes `deduct: billable` with the waiver on, `filmComposite.ts:1084`; music video passes `false`). Both charge once up front through RPCs that exist. **No revenue gap.** |
| `match_rag_documents` | `lib/rag/retrieve.ts` | DEAD | runs only when `/api/chat/orchestrate` gets `useRag: true`; no client sends it |
| `founder_financial_audit` | `lib/monetization/audit-engine.ts` | BROKEN, founder-only | the founder's chat audit command answers with the RPC error; no user sees it |
| `ensure_user_billing_rows`, `reset_user_credits_if_due`, `deduct_credits_transaction` | `lib/billing/enforce.ts`; `/api/billing/webhook` | DEAD / SILENT | enforce throws on the missing `credits`; its only reachable caller is the Pipeline page below. The billing webhook is the known SILENT row above |
| `claim_next_job` | `workers/shared/queue.ts` | DEAD | a separate worker process, not deployed on Vercel; no route imports it |
| `claim_longform_jobs`, `claim_longform_scenes` | `lib/video/longform/runtime.ts` | DEAD | `LONGFORM_VIDEO_ENABLED` is off (`/api/video/capabilities` answers `longform: false`) |
| `add_value`, `deduct_from_wallet` | `lib/commerce/server.ts` | DEAD | marketplace / shop commerce, no UI |

### Gated by design (a probe shows "opening soon"; nothing 500s)

- **Deep Research + Connectors** (`research_jobs`, `research_context_files`): `lib/research/capabilities.ts` probes the
  table; `/api/research` answers `available: false`. Migration `supabase/migrations/20261003b_research_jobs.sql` is
  prepared, not applied.
- **Plugins tab** (`user_plugin_settings`): `lib/plugins/settings.ts` probes the table; the switches show disabled.
  Migration `20261003e_user_plugin_settings.sql` is prepared, not applied.

### Pages reachable only by typing the address (no link, not in the sitemap or the services hub)

| Page | Missing | What happens |
|---|---|---|
| `/{lang}/services/workflow` (Pipeline builder) | `credits`, `workflow_definitions`, `workflow_runs` | Save and Run POST `/api/app/workflows`; `getBillingSnapshot` throws on `credits` → 500; the button stops with no message |
| `/{lang}/account/invoices` | `invoices`, `shops`, `invoice_counters` | list answers 500 → error toast; its create and detail links are 404 pages |
| `/{lang}/admin/disputes` | `disputes`, `orders` | not linked from the admin panel; any signed-in user can open it; `/api/disputes` fails on the missing tables, so the list is empty. Latent: its "admin view" has no admin check, only the caller's RLS, so the table must never be created without a policy |
| `/{lang}/account/billing` (also where `/account/payments|business|returns` land) | `stripe_invoices`, `stripe_payments`, `user_profiles` | `/api/finance/me/summary` always 500 and the page hides that block; Stripe subscription status still reads `subscriptions`. Tied to the payments decision |

### Fixed on the branch (code only, no DB change)

- **Vapi webhooks failed open.** `/api/voice/webhook` and `/api/voice/inbound` skipped the signature check when
  `VAPI_WEBHOOK_SECRET` was unset, so anyone could POST a call event and write `voice_calls` rows (any `user_id`, phone
  number, transcript) through the service role. Both now answer 503 until the secret is set (`7cc1a781`, test
  `app/api/voice/webhook/route.test.ts`, 6 cases; the 2 fail-closed cases fail on the old code). Production's
  `voice_calls` had **0 rows** (read 2026-10-09), so no live Vapi integration used the unsigned path, and the Vapi
  revenue-leak question above is moot: no call was ever recorded.

### Decisions for the owner (each new table is a database change)

1. ~~**Orphan pages:** retire `/services/workflow`, `/account/invoices` and `/admin/disputes`~~ — **decided 2026-10-09
   09:32Z (owner chose "retire" on the card); done on the branch:** each address redirects (307) like the other old
   pages (`/services/workflow` → dashboard, `/account/invoices` → `/account/billing`, `/admin/disputes` → `/admin`) and
   the page files are deleted (`lib/routing/shellRedirects.test.ts`). Their API routes stay (no UI calls them).
   `/account/billing` waits for decision 4.
2. **Deep Research:** apply `20261003b` to open it, or keep "opening soon". Recommended: keep closed until the launch
   blockers are cleared (it also runs paid Gemini calls).
3. **Plugins tab:** apply `20261003e`, or keep it disabled. Low value either way; recommended: keep.
4. **Stripe-side tables** (`webhook_events` dedupe, `user_profiles`, `stripe_invoices`, `stripe_payments`, affiliates,
   finance aggregates): decide together with the Stripe Live / pricing-table decision (owner actions 5 and the Stripe
   webhook URL).
5. **WhatsApp link and push** (`agent_g_channels`, `agent_g_connect_codes`, `agent_g_channel_events`,
   `push_subscriptions`): create the tables with an RLS review, or remove the two cards. Unchanged from 2026-10-08.
