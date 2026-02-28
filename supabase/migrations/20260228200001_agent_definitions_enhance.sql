-- Migration: Enhance agent_definitions with worker metadata
-- Adds columns needed by the 3-layer architecture: worker_type, timeout, QA threshold, etc.

ALTER TABLE public.agent_definitions ADD COLUMN IF NOT EXISTS agent_type text DEFAULT 'specialist'
  CHECK (agent_type IN ('director','specialist','integration'));
ALTER TABLE public.agent_definitions ADD COLUMN IF NOT EXISTS worker_type text DEFAULT 'cpu'
  CHECK (worker_type IN ('cpu','gpu','hybrid'));
ALTER TABLE public.agent_definitions ADD COLUMN IF NOT EXISTS timeout_seconds integer NOT NULL DEFAULT 300;
ALTER TABLE public.agent_definitions ADD COLUMN IF NOT EXISTS max_attempts smallint NOT NULL DEFAULT 3;
ALTER TABLE public.agent_definitions ADD COLUMN IF NOT EXISTS qa_threshold smallint NOT NULL DEFAULT 85;
ALTER TABLE public.agent_definitions ADD COLUMN IF NOT EXISTS supported_languages text[] NOT NULL DEFAULT '{ka,en,ru}';
ALTER TABLE public.agent_definitions ADD COLUMN IF NOT EXISTS capabilities text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.agent_definitions ADD COLUMN IF NOT EXISTS input_schema jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.agent_definitions ADD COLUMN IF NOT EXISTS output_schema jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill existing rows with correct metadata
UPDATE public.agent_definitions SET
  agent_type = 'director', worker_type = 'cpu', timeout_seconds = 60, qa_threshold = 100,
  capabilities = ARRAY['route','plan','qa_control','task_memory','bundle_orchestration']
WHERE id = 'agent-g';

UPDATE public.agent_definitions SET
  agent_type = 'specialist', worker_type = 'gpu', timeout_seconds = 600, qa_threshold = 90,
  capabilities = ARRAY['scan','studio','stylized','fast','cleanup','pose_presets','export_glb','export_poster','export_turntable']
WHERE id = 'avatar-agent';

UPDATE public.agent_definitions SET
  agent_type = 'specialist', worker_type = 'cpu', timeout_seconds = 120, qa_threshold = 80,
  capabilities = ARRAY['dag_build','connector_config','retry_strategy','cost_estimate','schedule']
WHERE id = 'workflow-agent';

UPDATE public.agent_definitions SET
  agent_type = 'specialist', worker_type = 'gpu', timeout_seconds = 900, qa_threshold = 88,
  capabilities = ARRAY['storyboard','shot_list','broll','captions','aspect_export','color_grade']
WHERE id = 'video-agent';

UPDATE public.agent_definitions SET
  agent_type = 'specialist', worker_type = 'gpu', timeout_seconds = 1200, qa_threshold = 90,
  capabilities = ARRAY['trim','transitions','subtitles_auto','lip_sync','color_grade','speed','audio_mix','watermark','multi_export']
WHERE id = 'editing-agent';

UPDATE public.agent_definitions SET
  agent_type = 'specialist', worker_type = 'gpu', timeout_seconds = 300, qa_threshold = 85,
  capabilities = ARRAY['beat_presets','vocal_chain','mix_master','stems_export','ka_syllable_align','loudness_target']
WHERE id = 'music-agent';

UPDATE public.agent_definitions SET
  agent_type = 'specialist', worker_type = 'gpu', timeout_seconds = 600, qa_threshold = 85,
  capabilities = ARRAY['campaign_pack','brand_kit_check','deliverables_checklist','brief_parse']
WHERE id = 'media-agent';

UPDATE public.agent_definitions SET
  agent_type = 'specialist', worker_type = 'gpu', timeout_seconds = 180, qa_threshold = 88,
  capabilities = ARRAY['bg_remove','retouch_presets','batch_process','before_after_preview']
WHERE id = 'photo-agent';

UPDATE public.agent_definitions SET
  agent_type = 'specialist', worker_type = 'gpu', timeout_seconds = 180, qa_threshold = 88,
  capabilities = ARRAY['poster','thumbnail','ad_image','style_packs','safe_areas','prompt_variations']
WHERE id = 'image-agent';

UPDATE public.agent_definitions SET
  agent_type = 'specialist', worker_type = 'gpu', timeout_seconds = 180, qa_threshold = 85,
  capabilities = ARRAY['creative_score','fail_reasons','auto_improve','brand_consistency_audit']
WHERE id = 'visual-intel-agent';

UPDATE public.agent_definitions SET
  agent_type = 'specialist', worker_type = 'cpu', timeout_seconds = 120, qa_threshold = 80,
  capabilities = ARRAY['ads','landing_page','scripts','docs','seo_pack','aida_pas','multilingual']
WHERE id = 'text-agent';

UPDATE public.agent_definitions SET
  agent_type = 'specialist', worker_type = 'cpu', timeout_seconds = 60, qa_threshold = 80,
  capabilities = ARRAY['prompt_cards','negative_prompts','scene_consistency','export_json']
WHERE id = 'prompt-agent';

UPDATE public.agent_definitions SET
  agent_type = 'specialist', worker_type = 'cpu', timeout_seconds = 120, qa_threshold = 80,
  capabilities = ARRAY['listing_create','subscription_setup','affiliate_link','order_pipeline','store_audit']
WHERE id = 'shop-agent';
