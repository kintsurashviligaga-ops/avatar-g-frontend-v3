# SCHEMA_MAP.md — authoritative DB schema (MyAvatar.ge)
_STEP 0 output. Source: `supabase/migrations/**` (71) + `migrations/**` (8) = **158 tables**; exact columns for the PostgREST-exposed set introspected live (read-only, service-role, values never read). Use this so later steps REUSE existing tables and new tables don't collide._

## Tables later steps want to CREATE — collision check
| new table | for | already exists? | note |
|---|---|---|---|
| `agent_execution_feedback` | STEP 3 (feedback telemetry) | ✅ no — safe to create | — |
| `prompt_optimization_proposals` | STEP 5 (proposals) | ✅ no — safe to create | — |
| `agent_configs` | STEP 5 (versioned live prompts/params) | ✅ no — safe to create | — |
| `payment_events` | STEP 6 (idempotent webhook ledger) | ✅ no — safe to create | — |

> None of the four collide. **But** existing payment/credit tables MUST be reused, not duplicated (STEP 6): see 'Payments & credits landscape'.

## Key REUSED tables — live columns (exact, from PostgREST)

### `profiles`
- `id`, `email`, `tier`, `credits_balance`, `abuse_level`, `created_at`, `updated_at`, `referral_code`, `referral_count`, `referral_credits_earned`, `referral_redeemed`, `referral_used_code`, `full_name`, `avatar_name`, `is_avatar_named`, `free_avatar_chats_remaining`, `free_films_remaining`, `avatar_url`

### `user_creations`
- `id`, `user_id`, `task_id`, `kind`, `service`, `title`, `prompt`, `url`, `thumbnail_url`, `duration_seconds`, `metadata`, `credits_used`, `is_public`, `share_token`, `created_at`

### `generation_jobs`
- `id`, `user_id`, `service_type`, `status`, `current_stage`, `pct`, `params`, `result`, `signed_url`, `error`, `created_at`, `updated_at`, `cost_usd`, `cost_gel`, `duration_ms`

### `credit_ledger`
- `id`, `user_id`, `job_id`, `delta`, `reason`, `metadata`, `created_at`

### `wallet_topups`
- `ref`, `user_id`, `amount_gel`, `created_at`

### `notifications`
- `id`, `user_id`, `type`, `message`, `read`, `created_at`

### `chat_sessions`
- `id`, `user_id`, `created_at`

### `chat_messages`
- `id`, `session_id`, `role`, `content`, `created_at`

### `media_assets`
- _in migrations; not PostgREST-exposed (RLS/service-role-only) — verify columns against migrations/live DB before schema-dependent edits._

### `render_jobs`
- `id`, `status`, `payload`, `result`, `error_message`, `created_at`, `started_at`, `finished_at`, `updated_at`, `completed_at`, `progress`, `result_url`, `worker_id`

### `video_clips`
- _in migrations; not PostgREST-exposed (RLS/service-role-only) — verify columns against migrations/live DB before schema-dependent edits._

### `voice_assets`
- _in migrations; not PostgREST-exposed (RLS/service-role-only) — verify columns against migrations/live DB before schema-dependent edits._

## Payments & credits landscape (STEP 6 — reuse these, do NOT invent)
- **Balance of record:** `profiles.credits_balance` (+ `tier`, `free_films_remaining`, `free_avatar_chats_remaining`). Credit movements: `credit_ledger` (`user_id, job_id, delta, reason, metadata`).
- **Top-up:** `wallet_topups` (`ref, user_id, amount_gel, created_at`), `wallet_transactions`.
- **Payment/webhook tables present:** `affiliate_payouts`, `billing_webhook_events`, `credit_ledger`, `credit_transactions`, `credits`, `credits_ledger`, `invoice_counters`, `invoice_items`, `invoices`, `payment_attempts`, `payment_provider_configs`, `payout_accounts`, `payout_requests`, `seller_payouts`, `shop_wallets`, `stripe_connect_accounts`, `stripe_connect_events`, `stripe_customers`, `stripe_events`, `stripe_invoices`, `stripe_payments`, `subscriptions`, `user_credits`, `wallet_topups`, `wallet_transactions`, `webhook_events`.
- STEP 6 wants `payment_events` UNIQUE(provider,event_id). Existing `stripe_events`/`webhook_events`/`billing_webhook_events`/`payment_attempts` already cover parts of this — **read their columns before creating `payment_events`; prefer extending/reusing over a parallel table.**

## Full table inventory (158)
<details><summary>all tables</summary>

| `affiliate_clicks` | `affiliate_commission_events` | `affiliate_conversions` | `affiliate_payouts` |
|---|---|---|---|
| `affiliate_referrals` | `affiliate_tracking` | `affiliates` | `agent_definitions` |
| `agent_evolution_traces` | `agent_g_calls` | `agent_g_channel_events` | `agent_g_channels` |
| `agent_g_connect_codes` | `agent_g_events` | `agent_g_memory` | `agent_g_subtasks` |
| `agent_g_tasks` | `agent_g_user_prefs` | `ai_usage_log` | `analytics_events` |
| `audit_logs` | `avatar_assets` | `avatars` | `billing_webhook_events` |
| `business_agent_projects` | `business_agent_runs` | `business_item_events` | `business_items` |
| `business_profiles` | `business_projects` | `character_references` | `chat_messages` |
| `chat_sessions` | `clip_cache` | `connector_configs` | `conversations` |
| `credit_ledger` | `credit_transactions` | `credits` | `credits_ledger` |
| `digital_license_transfers` | `digital_licenses` | `disputes` | `error_logs` |
| `events` | `execution_trace` | `executive_task_logs` | `finance_daily_aggregates` |
| `founder_coupons` | `fraud_checks` | `fulfillment_errors` | `fulfillment_jobs` |
| `fx_rates` | `gemini_chat_messages` | `gemini_chat_sessions` | `gemini_message_feedback` |
| `generation_checkpoints` | `generation_jobs` | `growth_campaigns` | `growth_kpis` |
| `inventory_movements` | `invoice_counters` | `invoice_items` | `invoices` |
| `job_logs` | `job_runtime_logs` | `jobs` | `kpi_daily` |
| `launch_30_plans` | `launch_plans` | `launch_readiness_checklist` | `live_sessions` |
| `marketplace_favorites` | `marketplace_inquiries` | `marketplace_listings` | `marketplace_messages` |
| `marketplace_orders` | `media_assets` | `memories` | `messages` |
| `notifications` | `onboarding_events` | `orchestration_runs` | `order_items` |
| `order_shipments` | `orders` | `org_branding` | `org_members` |
| `orgs` | `payment_attempts` | `payment_provider_configs` | `payout_accounts` |
| `payout_requests` | `platform_commissions` | `presets` | `products` |
| `profiles` | `profit_first_config` | `profit_snapshots` | `project_versions` |
| `projects` | `rag_documents` | `referral_codes` | `referral_events` |
| `refunds` | `render_jobs` | `return_requests` | `revenue_forecasts` |
| `runtime_logs` | `seller_payouts` | `seller_profiles` | `service_jobs` |
| `service_outputs` | `shipment_events` | `shipments` | `shipping_events` |
| `shipping_profiles` | `shipping_rates` | `shipping_zones` | `shop_stores` |
| `shop_wallets` | `simulation_scenarios` | `smm_assets` | `smm_posts` |
| `smm_projects` | `stripe_connect_accounts` | `stripe_connect_events` | `stripe_customers` |
| `stripe_events` | `stripe_invoices` | `stripe_payments` | `subscriptions` |
| `supplier_products` | `suppliers` | `talk_clips` | `tax_accounting_records` |
| `tracking_tokens` | `tracks` | `usage_meter_events` | `user_consents` |
| `user_creations` | `user_credits` | `user_profiles` | `video_clips` |
| `voice_assets` | `voice_calls` | `voice_jobs` | `voice_profiles` |
| `voice_projects` | `voice_samples` | `wallet_topups` | `wallet_transactions` |
| `wardrobe_items` | `webhook_events` | `worker_heartbeat` | `workflow_definitions` |
| `workflow_runs` | `workflow_step_runs` |

</details>

## Notes
- `types/database.types.ts` is **minimal/stale** (only `chat_messages`, `chat_sessions`) — do NOT treat it as the schema; migrations + live introspection are authoritative.
- PostgREST exposes 30 of 158 tables (rest are service-role/RLS-restricted or non-`public`).
