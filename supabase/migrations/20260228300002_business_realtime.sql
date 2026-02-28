-- supabase/migrations/20260228300002_business_realtime.sql
alter publication supabase_realtime add table public.business_projects;
alter publication supabase_realtime add table public.business_items;
alter publication supabase_realtime add table public.business_item_events;
