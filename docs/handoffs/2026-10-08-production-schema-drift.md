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

Triage in progress (2026-10-08); this section is filled in when it is done.
