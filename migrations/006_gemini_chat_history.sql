-- Migration: 006_gemini_chat_history.sql
-- Gemini Chat History — sessions, messages, and feedback tables

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

CREATE TABLE IF NOT EXISTS gemini_message_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES gemini_chat_messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating IN (-1, 1)),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE gemini_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gemini_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE gemini_message_feedback ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users see own sessions" ON gemini_chat_sessions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users see own messages" ON gemini_chat_messages
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own feedback" ON gemini_message_feedback
  FOR ALL USING (auth.uid() = user_id);
