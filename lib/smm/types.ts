export type SmmGoal =
  | 'grow_followers'
  | 'sell_product'
  | 'build_brand'
  | 'announce_event'
  | 'recruit'
  | 'tourism_promo';

export type SmmAudienceLang = 'ka' | 'en' | 'ru';

export type SmmBrandVoice = 'luxury' | 'friendly' | 'corporate' | 'noir' | 'energetic';

export type SmmPlatform =
  | 'instagram'
  | 'tiktok'
  | 'youtube_shorts'
  | 'facebook'
  | 'telegram'
  | 'linkedin';

export type SmmPostStatus = 'draft' | 'planned' | 'scheduled' | 'published';

export type SmmAssetType = 'image' | 'video' | 'music' | 'avatar';

export type SmmAssetStatus = 'pending' | 'ready' | 'error';

export interface SmmProject {
  id: string;
  owner_id: string;
  title: string;
  goal: SmmGoal;
  audience_lang: SmmAudienceLang;
  platforms: SmmPlatform[];
  brand_voice: SmmBrandVoice;
  created_at: string;
}

export interface SmmPost {
  id: string;
  project_id: string;
  day_index: number;
  title: string;
  hook: string;
  caption: string;
  hashtags: string[];
  status: SmmPostStatus;
  scheduled_at: string | null;
  created_at: string;
}

export interface SmmAsset {
  id: string;
  post_id: string;
  type: SmmAssetType;
  provider: string;
  status: SmmAssetStatus;
  url: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface SmmPlanInput {
  goal: SmmGoal;
  audienceLang: SmmAudienceLang;
  platforms: SmmPlatform[];
  brandVoice: SmmBrandVoice;
  persona: string;
  timeframeDays: 7 | 14 | 30;
}

export interface SmmGeneratedPost {
  day_index: number;
  title: string;
  hook: string;
  caption: string;
  hashtags: string[];
  status: SmmPostStatus;
  scheduled_at: string | null;
}
