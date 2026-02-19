export type BusinessAgentLocale = 'ka' | 'en';

export type BusinessAgentOfferType = 'service' | 'product';

export type BusinessAgentGoal =
  | 'get_clients'
  | 'increase_sales'
  | 'build_brand'
  | 'automate_ops'
  | 'content_plan'
  | 'customer_support';

export type BusinessAgentMode =
  | 'sales_agent'
  | 'marketing_agent'
  | 'operations_agent'
  | 'support_agent'
  | 'strategy_agent';

export type BusinessAgentFileMeta = {
  id: string;
  name: string;
  size: number;
  type: string;
  uploaded_at: string;
};

export type BusinessProfile = {
  business_name: string;
  category: string;
  location: string;
  language: BusinessAgentLocale;
  target_audience: string;
  offer_type: BusinessAgentOfferType;
  price_range: string;
  working_hours: string;
  website_url: string;
  instagram_url: string;
};

export type BusinessAgentInputs = {
  files: BusinessAgentFileMeta[];
  products_services_text: string;
  faq_text: string;
  policies_text: string;
};

export type BusinessGeneratedPack = {
  offer_positioning: {
    summary: string;
    key_points: string[];
  };
  customer_persona: {
    primary_persona: string;
    pain_points: string[];
    decision_triggers: string[];
  };
  action_plan_30_day: {
    week_1: string[];
    week_2: string[];
    week_3: string[];
    week_4: string[];
  };
  scripts: {
    dm_script: string;
    call_script: string;
    email_script: string;
  };
  content_ideas: string[];
  kpi_dashboard_suggestions: string[];
};

export type BusinessAgentProject = {
  id: string;
  owner_id: string;
  title: string;
  locale: BusinessAgentLocale;
  business_profile: BusinessProfile;
  goals: BusinessAgentGoal[];
  mode: BusinessAgentMode;
  inputs: BusinessAgentInputs;
  generated_pack: BusinessGeneratedPack | null;
  created_at: string;
  updated_at: string;
};

export type BusinessAgentRun = {
  id: string;
  project_id: string;
  owner_id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  error: string | null;
  result: BusinessGeneratedPack | null;
  created_at: string;
};

export type BusinessAgentPackInput = {
  locale: BusinessAgentLocale;
  profile: BusinessProfile;
  goals: BusinessAgentGoal[];
  mode: BusinessAgentMode;
  inputs: BusinessAgentInputs;
};
