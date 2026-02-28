-- Migration: Agent definitions (hierarchy model)
-- ALL inter-agent communication goes through Agent G (director).

CREATE TABLE IF NOT EXISTS public.agent_definitions (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  type text CHECK (type IN ('director','specialist','integration')),
  parent_id text REFERENCES public.agent_definitions(id),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.agent_definitions (id, name, type, parent_id, description) VALUES
  ('agent-g',              'Agent G',               'director',     NULL,       'Director AI — routes and orchestrates all agent tasks'),
  ('avatar-agent',         'Avatar Builder',         'specialist',   'agent-g',  'Build and manage digital avatar pipeline'),
  ('workflow-agent',       'Workflow Builder',        'specialist',   'agent-g',  'Compose chained automations across services'),
  ('video-agent',          'Video Studio',            'specialist',   'agent-g',  'Generate cinematic videos from guided input'),
  ('media-agent',          'Media Production',        'specialist',   'agent-g',  'Produce campaign-ready multimedia outputs'),
  ('music-agent',          'Music Studio',            'specialist',   'agent-g',  'Generate tracks and production-ready stems'),
  ('photo-agent',          'Photo Studio',            'specialist',   'agent-g',  'Create editorial-grade photo outputs'),
  ('social-agent',         'Social Media Manager',    'specialist',   'agent-g',  'Plan and publish social content workflows'),
  ('visual-intel-agent',   'Visual Intelligence',     'specialist',   'agent-g',  'Analyze and optimize visual creative assets'),
  ('image-agent',          'Image Creator',           'specialist',   'agent-g',  'Generate design-ready image concepts'),
  ('text-agent',           'Text Intelligence',       'specialist',   'agent-g',  'Generate and optimize strategic copy'),
  ('prompt-agent',         'Prompt Builder',          'specialist',   'agent-g',  'Design reusable high-performing prompt systems'),
  ('shop-agent',           'Online Shop',             'specialist',   'agent-g',  'Launch and manage commerce storefront'),
  ('creative-engine-agent','Creative Engine',          'specialist',   'agent-g',  'Generate games and interactive content'),
  ('editing-agent',        'Universal Editing',        'specialist',   'agent-g',  'CapCut-level: trim, transitions, effects, subtitles'),
  ('telegram-agent',       'Telegram Integration',     'integration',  'agent-g',  'Telegram bot channel for user interactions'),
  ('whatsapp-agent',       'WhatsApp Integration',     'integration',  'agent-g',  'WhatsApp webhook for user interactions'),
  ('call-agent',           'Phone Call Agent',          'integration',  'agent-g',  'Twilio voice call agent for phone interactions')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.agent_definitions ENABLE ROW LEVEL SECURITY;

-- Public read access (agents are public metadata)
CREATE POLICY "agent_definitions_public_read"
  ON public.agent_definitions FOR SELECT
  TO authenticated
  USING (true);
