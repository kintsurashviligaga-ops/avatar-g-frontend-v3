-- supabase/migrations/20260228300003_business_agent_seed.sql
insert into public.agent_definitions
  (id, name, agent_type, parent_id, worker_type, timeout_seconds, qa_threshold,
   supported_languages, capabilities, input_schema, output_schema)
values (
  'business-agent',
  'Business Agent',
  'specialist',
  'agent-g',
  'cpu',
  180,
  90,
  ARRAY['ka','en','ru'],
  ARRAY[
    'plan_generation',
    'product_analysis',
    'profit_modeling',
    'connector_mapping',
    'risk_scoring',
    'compliance_check',
    'market_analysis',
    'pricing_strategy',
    'listing_copy_generation',
    'brand_kit_brief'
  ],
  '{
    "type": "object",
    "required": ["intent"],
    "properties": {
      "intent": {"type": "string", "enum": ["business_plan","product_analysis","resell_pipeline","marketplace_listing_pack"]},
      "project_id": {"type": "string"},
      "item_id": {"type": "string"},
      "profit_inputs": {"type": "object"},
      "language": {"type": "string", "enum": ["ka","en","ru"]}
    }
  }'::jsonb,
  '{
    "type": "object",
    "properties": {
      "plan": {"type": "object"},
      "analysis": {"type": "object"},
      "artifacts": {"type": "array"},
      "qa_report": {"type": "object"}
    }
  }'::jsonb
)
on conflict (id) do nothing;
