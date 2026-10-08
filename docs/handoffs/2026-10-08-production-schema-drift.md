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
