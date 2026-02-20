CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.agent_g_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  results JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_g_tasks_status_check CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'partial'))
);

CREATE TABLE IF NOT EXISTS public.agent_g_subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.agent_g_tasks(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_g_subtasks_status_check CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'partial'))
);

CREATE TABLE IF NOT EXISTS public.agent_g_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_g_channels_type_check CHECK (type IN ('telegram', 'whatsapp', 'mobile'))
);

CREATE INDEX IF NOT EXISTS agent_g_tasks_user_created_idx ON public.agent_g_tasks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_g_tasks_user_status_idx ON public.agent_g_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS agent_g_subtasks_task_created_idx ON public.agent_g_subtasks(task_id, created_at ASC);
CREATE INDEX IF NOT EXISTS agent_g_channels_user_type_idx ON public.agent_g_channels(user_id, type);

DROP TRIGGER IF EXISTS agent_g_tasks_updated_at_trigger ON public.agent_g_tasks;
CREATE TRIGGER agent_g_tasks_updated_at_trigger
  BEFORE UPDATE ON public.agent_g_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.agent_g_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_g_subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_g_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_g_tasks_owner_read ON public.agent_g_tasks;
CREATE POLICY agent_g_tasks_owner_read
  ON public.agent_g_tasks FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS agent_g_tasks_owner_insert ON public.agent_g_tasks;
CREATE POLICY agent_g_tasks_owner_insert
  ON public.agent_g_tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS agent_g_tasks_owner_update ON public.agent_g_tasks;
CREATE POLICY agent_g_tasks_owner_update
  ON public.agent_g_tasks FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS agent_g_tasks_owner_delete ON public.agent_g_tasks;
CREATE POLICY agent_g_tasks_owner_delete
  ON public.agent_g_tasks FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS agent_g_subtasks_owner_read ON public.agent_g_subtasks;
CREATE POLICY agent_g_subtasks_owner_read
  ON public.agent_g_subtasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.agent_g_tasks t
      WHERE t.id = task_id
        AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_g_subtasks_owner_write ON public.agent_g_subtasks;
CREATE POLICY agent_g_subtasks_owner_write
  ON public.agent_g_subtasks FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.agent_g_tasks t
      WHERE t.id = task_id
        AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.agent_g_tasks t
      WHERE t.id = task_id
        AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_g_channels_owner_crud ON public.agent_g_channels;
CREATE POLICY agent_g_channels_owner_crud
  ON public.agent_g_channels FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
