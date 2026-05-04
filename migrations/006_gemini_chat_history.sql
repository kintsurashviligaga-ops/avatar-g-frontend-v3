-- Migration: 006_gemini_chat_history.sql
-- Gemini Chat History — sessions, messages, and feedback tables

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS gemini_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  service_context TEXT NOT NULL DEFAULT 'general',
  locale TEXT NOT NULL DEFAULT 'ka',
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gemini_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  user_id UUID,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  service_context TEXT DEFAULT 'general',
  locale TEXT DEFAULT 'ka',
  model TEXT,
  credits_used INTEGER DEFAULT 0,
  has_attachment BOOLEAN DEFAULT false,
  feedback INTEGER CHECK (feedback IN (-1, 0, 1)),
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gemini_chat_messages_session_id_fkey'
  ) THEN
    ALTER TABLE gemini_chat_messages
      ADD CONSTRAINT gemini_chat_messages_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES gemini_chat_sessions(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS gemini_message_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES gemini_chat_messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating IN (-1, 1)),
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gemini_message_feedback_message_id_key'
  ) THEN
    ALTER TABLE gemini_message_feedback
      ADD CONSTRAINT gemini_message_feedback_message_id_key UNIQUE (message_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gemini_chat_messages_session_id
  ON gemini_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_gemini_chat_messages_user_id_created_at
  ON gemini_chat_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gemini_chat_sessions_user_id_updated_at
  ON gemini_chat_sessions(user_id, updated_at DESC);

-- Enable RLS
ALTER TABLE gemini_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gemini_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE gemini_message_feedback ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'gemini_chat_sessions'
      AND policyname = 'Users see own sessions'
  ) THEN
    CREATE POLICY "Users see own sessions" ON gemini_chat_sessions
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'gemini_chat_messages'
      AND policyname = 'Users see own messages'
  ) THEN
    CREATE POLICY "Users see own messages" ON gemini_chat_messages
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'gemini_message_feedback'
      AND policyname = 'Users manage own feedback'
  ) THEN
    CREATE POLICY "Users manage own feedback" ON gemini_message_feedback
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
