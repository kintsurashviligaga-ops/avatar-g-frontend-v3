-- ============================================================================
-- 20260711_hot_path_indexes.sql — read-path index hardening (V3)
-- ----------------------------------------------------------------------------
-- Two frequently-hit read paths currently do more work than they need because
-- the closest existing index doesn't match the predicate/sort. Both indexes are
-- idempotent (IF NOT EXISTS) and net-new names, so this migration is safe to
-- re-run. Neither touches asset generation, billing, or the deduct_credits /
-- refund_credits SAGA — they only accelerate SELECTs. Low-write tables, so the
-- brief CREATE INDEX lock is acceptable (matches the repo's plain-CREATE convention).
-- ============================================================================

-- (1) Unread-notifications COUNT probe.
-- lib/notifications/store.ts unreadCount(): SELECT count(*) ... WHERE user_id = $1 AND read = false
-- fires on every bell mount / 'myavatar:notifications-refresh'. The existing
-- notifications_user_created_idx (user_id, created_at DESC) does NOT include `read`,
-- so the count scans ALL of a user's rows and filters. A tiny PARTIAL index turns it
-- into an index-only count; markRead's UPDATE ... WHERE user_id AND read = false benefits too.
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id)
  WHERE read = false;

-- (2) Unfiltered Library "All" tab + CommandCenter feed.
-- app/api/creations GET default path: .eq('user_id').order('created_at' DESC).range()
-- with NO kind filter. The only matching index is user_creations_user_kind_idx
-- (user_id, KIND, created_at DESC) — `kind` sits between the eq column and the sort
-- column, so Postgres cannot return rows pre-sorted and adds a Sort node (which gets
-- worse as a user's library grows). This 2-col index gives an index-ordered scan for
-- the paginated All view; the kind-filtered tabs keep using the existing 3-col index.
CREATE INDEX IF NOT EXISTS user_creations_user_created_idx
  ON public.user_creations (user_id, created_at DESC);
