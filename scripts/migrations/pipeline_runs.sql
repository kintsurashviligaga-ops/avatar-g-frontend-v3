-- Pipeline runs: tracks every 5-stage generation flow
-- Run via Supabase dashboard SQL editor or migration tool

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id  UUID,
  service          TEXT NOT NULL,
  stage            TEXT CHECK (stage IN ('clarifying','confirming','generating','done','failed','cancelled')),
  answers          JSONB DEFAULT '{}',
  final_prompt     TEXT,
  credit_cost      INTEGER,
  credits_before   INTEGER,
  credits_after    INTEGER,
  job_id           UUID,
  result_url       TEXT,
  result_type      TEXT,
  started_at       TIMESTAMPTZ DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  duration_seconds INTEGER,
  metadata         JSONB DEFAULT '{}'
);

ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own pipeline runs" ON pipeline_runs
  FOR ALL USING (auth.uid() = user_id);

-- Realtime subscription for live credit updates
ALTER PUBLICATION supabase_realtime ADD TABLE pipeline_runs;

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS pipeline_runs_user_idx ON pipeline_runs (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS pipeline_runs_conv_idx  ON pipeline_runs (conversation_id);
