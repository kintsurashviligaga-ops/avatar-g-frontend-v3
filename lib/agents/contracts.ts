/**
 * lib/agents/contracts.ts
 * =======================
 * UNIFIED AGENT CONTRACT SYSTEM — Single source of truth
 *
 * Every agent in the MyAvatar.ge multi-agent platform is defined here.
 * Agent G (director) orchestrates all specialist agents.
 *
 * This replaces the fragmented registries:
 *   - lib/agents/registry.ts (billing)
 *   - lib/agents/agentRegistry.ts (chat)
 *   - lib/router/agentGRouter.ts (provider routing)
 */

import type { AgentType, WorkerType, LocaleCode, StylePreset } from '@/types/core';
import type { MediaType, ExportFormat } from '@/lib/services/catalog';

// ─── Agent Contract Interface ────────────────────────────────────────────────

export interface AgentContract {
  /** Unique agent identifier (kebab-case) */
  agentId: string;
  /** Human-readable name */
  name: string;
  /** Georgian name */
  nameKa: string;
  /** Russian name */
  nameRu: string;
  /** Agent role: director | specialist | integration */
  agentType: AgentType;
  /** Compute requirement */
  workerType: WorkerType;
  /** Which service slug(s) this agent powers */
  serviceSlugs: string[];
  /** Domain keywords for intent routing */
  domain: string[];
  /** Emoji icon for UI */
  icon: string;
  /** What this agent can do */
  capabilities: string[];
  /** What input media types it accepts */
  acceptedInputs: MediaType[];
  /** What output media types it produces */
  producedOutputs: MediaType[];
  /** Export formats supported */
  exportFormats: ExportFormat[];
  /** Agent IDs this agent can hand off work to */
  canHandoffTo: string[];
  /** Agent IDs that can hand off work to this agent */
  receivesFrom: string[];
  /** Model routing */
  provider: 'gpt' | 'replicate' | 'claude' | 'local';
  /** Default model */
  model: string;
  /** System prompt for this agent */
  systemPrompt: string;
  /** Permissions */
  permissions: string[];
  /** Credit cost per invocation */
  baseCost: number;
  /** Minimum plan required */
  requiredPlan: 'FREE' | 'PRO' | 'PREMIUM' | 'ENTERPRISE';
  /** QA quality threshold (0-100) */
  qaThreshold: number;
  /** Timeout in seconds */
  timeoutSeconds: number;
  /** Max retry attempts */
  maxAttempts: number;
  /** Supported languages */
  supportedLanguages: LocaleCode[];
  /** Is this agent currently active */
  active: boolean;
}

// ─── Master Agent: Agent G ───────────────────────────────────────────────────

const AGENT_G: AgentContract = {
  agentId: 'agent-g',
  name: 'Agent G',
  nameKa: 'აგენტი G',
  nameRu: 'Агент G',
  agentType: 'director',
  workerType: 'cpu',
  serviceSlugs: ['agent-g'],
  domain: ['orchestrate', 'plan', 'delegate', 'coordinate', 'pipeline', 'bundle', 'project', 'workflow'],
  icon: '⬢',
  capabilities: ['orchestrate', 'plan', 'delegate', 'quality-gate', 'pipeline-exec', 'bundle-run', 'status-track', 'memory-manage'],
  acceptedInputs: ['text', 'image', 'video', 'audio', 'file', 'document'],
  producedOutputs: ['text', 'image', 'video', 'audio', 'document'],
  exportFormats: ['json', 'pdf', 'txt'],
  canHandoffTo: [
    'avatar-agent', 'video-agent', 'image-agent', 'thumbnail-agent',
    'music-agent', 'subtitle-agent', 'video-editor-agent', 'reels-agent',
    'store-agent', 'seo-agent', 'affiliate-agent', 'business-agent',
    'revenue-agent', 'risk-agent', 'executive-agent', 'dev-agent',
    'content-agent', 'marketing-agent', 'qa-agent',
  ],
  receivesFrom: [],
  provider: 'gpt',
  model: 'gpt-4.1',
  systemPrompt: `You are Agent G — the executive AI director of MyAvatar.ge. You are the central brain that orchestrates all specialist agents.

Your responsibilities:
1. Understand user intent and break it into actionable sub-tasks
2. Route each sub-task to the correct specialist agent
3. Coordinate multi-step pipelines with dependency management
4. Enforce quality gates between pipeline stages
5. Aggregate results into unified deliverables
6. Maintain project context and memory across sessions

You have 19 specialist agents at your command. Always confirm understanding before executing complex pipelines. Think step-by-step. Provide structured, actionable outputs. Speak the user's language (KA, EN, or RU).`,
  permissions: ['chat', 'orchestrate', 'execute', 'admin', 'memory-write', 'delegate'],
  baseCost: 5,
  requiredPlan: 'FREE',
  qaThreshold: 90,
  timeoutSeconds: 300,
  maxAttempts: 3,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

// ─── Specialist Agents ───────────────────────────────────────────────────────

const AVATAR_AGENT: AgentContract = {
  agentId: 'avatar-agent',
  name: 'Avatar Agent',
  nameKa: 'ავატარ აგენტი',
  nameRu: 'Аватар-агент',
  agentType: 'specialist',
  workerType: 'gpu',
  serviceSlugs: ['avatar'],
  domain: ['avatar', 'character', 'persona', 'digital-human', '3d-model', 'face', 'portrait', 'headshot'],
  icon: '👤',
  capabilities: ['avatar-generation', 'avatar-customization', 'face-swap', 'style-transfer', '3d-model'],
  acceptedInputs: ['text', 'image'],
  producedOutputs: ['image', '3d-model'],
  exportFormats: ['png', 'jpg', 'webp', 'glb'],
  canHandoffTo: ['video-agent', 'image-agent', 'store-agent', 'thumbnail-agent'],
  receivesFrom: ['agent-g', 'video-agent', 'reels-agent'],
  provider: 'replicate',
  model: 'stability-ai/sdxl',
  systemPrompt: 'You are the Avatar Agent for MyAvatar.ge. You create photorealistic digital humans, character avatars, 3D models, and identity assets. Guide users through avatar customization: style, expression, lighting, outfit, and background. Always maintain brand consistency.',
  permissions: ['chat', 'generate', 'edit'],
  baseCost: 10,
  requiredPlan: 'FREE',
  qaThreshold: 85,
  timeoutSeconds: 120,
  maxAttempts: 3,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

const VIDEO_AGENT: AgentContract = {
  agentId: 'video-agent',
  name: 'Video Agent',
  nameKa: 'ვიდეო აგენტი',
  nameRu: 'Видео-агент',
  agentType: 'specialist',
  workerType: 'gpu',
  serviceSlugs: ['video'],
  domain: ['video', 'cinematic', 'animation', 'clip', 'footage', 'scene', 'storyboard', 'motion'],
  icon: '🎬',
  capabilities: ['video-generation', 'storyboard', 'scene-composition', 'animation', 'text-to-video'],
  acceptedInputs: ['text', 'image', 'video'],
  producedOutputs: ['video'],
  exportFormats: ['mp4', 'webm'],
  canHandoffTo: ['video-editor-agent', 'music-agent', 'subtitle-agent', 'thumbnail-agent', 'reels-agent'],
  receivesFrom: ['agent-g', 'avatar-agent', 'image-agent', 'music-agent'],
  provider: 'replicate',
  model: 'anotherjesse/zeroscope-v2-xl',
  systemPrompt: 'You are the Video Agent for MyAvatar.ge. You generate cinematic AI video from text or image prompts. Create storyboards, shot lists, scene compositions, and multi-platform exports. Guide users through the video production workflow.',
  permissions: ['chat', 'generate', 'edit'],
  baseCost: 20,
  requiredPlan: 'FREE',
  qaThreshold: 85,
  timeoutSeconds: 180,
  maxAttempts: 2,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

const IMAGE_AGENT: AgentContract = {
  agentId: 'image-agent',
  name: 'Image & Poster Agent',
  nameKa: 'სურათისა და პოსტერის აგენტი',
  nameRu: 'Агент изображений и постеров',
  agentType: 'specialist',
  workerType: 'gpu',
  serviceSlugs: ['image'],
  domain: ['image', 'poster', 'banner', 'visual', 'graphic', 'ad-creative', 'illustration', 'artwork'],
  icon: '🖼️',
  capabilities: ['image-generation', 'poster-design', 'ad-creative', 'illustration', 'style-transfer', 'inpainting'],
  acceptedInputs: ['text', 'image'],
  producedOutputs: ['image'],
  exportFormats: ['png', 'jpg', 'webp', 'svg'],
  canHandoffTo: ['video-agent', 'thumbnail-agent', 'store-agent', 'marketing-agent'],
  receivesFrom: ['agent-g', 'avatar-agent', 'content-agent', 'marketing-agent'],
  provider: 'replicate',
  model: 'stability-ai/sdxl',
  systemPrompt: 'You are the Image & Poster Agent for MyAvatar.ge. You create campaign-grade visuals, ad creatives, posters, banners, and commercial imagery. Suggest composition, style packs, safe zones for platform-specific outputs.',
  permissions: ['chat', 'generate', 'edit'],
  baseCost: 8,
  requiredPlan: 'FREE',
  qaThreshold: 85,
  timeoutSeconds: 120,
  maxAttempts: 3,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

const THUMBNAIL_AGENT: AgentContract = {
  agentId: 'thumbnail-agent',
  name: 'Thumbnail Agent',
  nameKa: 'მინიატურის აგენტი',
  nameRu: 'Агент миниатюр',
  agentType: 'specialist',
  workerType: 'gpu',
  serviceSlugs: ['photo'],
  domain: ['thumbnail', 'cover', 'photo-edit', 'retouch', 'upscale', 'background-remove', 'enhance'],
  icon: '📸',
  capabilities: ['thumbnail-generation', 'bg-removal', 'upscale-4x', 'portrait-retouch', 'batch-enhance'],
  acceptedInputs: ['image'],
  producedOutputs: ['image'],
  exportFormats: ['png', 'jpg', 'webp'],
  canHandoffTo: ['avatar-agent', 'image-agent', 'video-agent', 'store-agent'],
  receivesFrom: ['agent-g', 'video-agent', 'image-agent', 'reels-agent'],
  provider: 'replicate',
  model: 'stability-ai/sdxl',
  systemPrompt: 'You are the Thumbnail Agent for MyAvatar.ge. You create optimized thumbnails, cover images, and enhanced photos. Handle background removal, upscaling, retouching, and batch processing.',
  permissions: ['chat', 'generate', 'edit'],
  baseCost: 6,
  requiredPlan: 'FREE',
  qaThreshold: 80,
  timeoutSeconds: 90,
  maxAttempts: 3,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

const MUSIC_AGENT: AgentContract = {
  agentId: 'music-agent',
  name: 'Music Agent',
  nameKa: 'მუსიკის აგენტი',
  nameRu: 'Музыкальный агент',
  agentType: 'specialist',
  workerType: 'gpu',
  serviceSlugs: ['music'],
  domain: ['music', 'beat', 'track', 'score', 'soundtrack', 'jingle', 'mix', 'master', 'stems', 'audio'],
  icon: '🎵',
  capabilities: ['music-generation', 'beat-production', 'mixing', 'mastering', 'stem-separation', 'jingle'],
  acceptedInputs: ['text', 'audio'],
  producedOutputs: ['audio'],
  exportFormats: ['mp3', 'wav', 'flac'],
  canHandoffTo: ['video-agent', 'video-editor-agent', 'store-agent', 'reels-agent'],
  receivesFrom: ['agent-g', 'video-agent', 'content-agent'],
  provider: 'replicate',
  model: 'meta/musicgen',
  systemPrompt: 'You are the Music Agent for MyAvatar.ge. You compose original beats, scores, soundscapes, jingles, and handle mixing/mastering. Guide users through audio production including Georgian syllable alignment.',
  permissions: ['chat', 'generate', 'mix'],
  baseCost: 15,
  requiredPlan: 'FREE',
  qaThreshold: 80,
  timeoutSeconds: 120,
  maxAttempts: 2,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

const SUBTITLE_AGENT: AgentContract = {
  agentId: 'subtitle-agent',
  name: 'Subtitle Agent',
  nameKa: 'სუბტიტრების აგენტი',
  nameRu: 'Агент субтитров',
  agentType: 'specialist',
  workerType: 'cpu',
  serviceSlugs: ['editing'],
  domain: ['subtitle', 'caption', 'transcribe', 'translate', 'srt', 'vtt'],
  icon: '💬',
  capabilities: ['auto-subtitle', 'speech-to-text', 'subtitle-burn', 'multi-language-caption', 'timing-sync'],
  acceptedInputs: ['video', 'audio'],
  producedOutputs: ['text', 'video'],
  exportFormats: ['txt', 'json', 'mp4'],
  canHandoffTo: ['video-editor-agent', 'content-agent'],
  receivesFrom: ['agent-g', 'video-agent', 'video-editor-agent'],
  provider: 'gpt',
  model: 'gpt-4o',
  systemPrompt: 'You are the Subtitle Agent for MyAvatar.ge. You handle auto-captioning, speech-to-text transcription, multi-language subtitle generation, timing sync, and subtitle burn-in. Support KA, EN, and RU.',
  permissions: ['chat', 'generate', 'edit'],
  baseCost: 5,
  requiredPlan: 'FREE',
  qaThreshold: 90,
  timeoutSeconds: 120,
  maxAttempts: 3,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

const VIDEO_EDITOR_AGENT: AgentContract = {
  agentId: 'video-editor-agent',
  name: 'Video Editor Agent',
  nameKa: 'ვიდეო ედიტორის აგენტი',
  nameRu: 'Агент видеомонтажа',
  agentType: 'specialist',
  workerType: 'gpu',
  serviceSlugs: ['editing'],
  domain: ['editing', 'cut', 'trim', 'transitions', 'color-grade', 'post-production', 'montage'],
  icon: '✂️',
  capabilities: ['auto-cut', 'color-grading', 'transitions', 'batch-export', 'post-production', 'stabilize'],
  acceptedInputs: ['video', 'audio', 'image'],
  producedOutputs: ['video'],
  exportFormats: ['mp4', 'webm'],
  canHandoffTo: ['subtitle-agent', 'music-agent', 'store-agent', 'reels-agent'],
  receivesFrom: ['agent-g', 'video-agent', 'reels-agent', 'subtitle-agent'],
  provider: 'gpt',
  model: 'gpt-4o',
  systemPrompt: 'You are the Video Editor Agent for MyAvatar.ge. You handle auto-cutting, color grading, transitions, batch exports, and post-production. Optimize for platform-specific aspect ratios and formats.',
  permissions: ['chat', 'generate', 'edit'],
  baseCost: 12,
  requiredPlan: 'FREE',
  qaThreshold: 85,
  timeoutSeconds: 180,
  maxAttempts: 2,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

const REELS_AGENT: AgentContract = {
  agentId: 'reels-agent',
  name: 'Reels & Social Video Agent',
  nameKa: 'რილსი და სოციალური ვიდეოს აგენტი',
  nameRu: 'Агент рилсов и соц-видео',
  agentType: 'specialist',
  workerType: 'gpu',
  serviceSlugs: ['media'],
  domain: ['reels', 'shorts', 'tiktok', 'instagram', 'social-video', 'vertical', '9:16'],
  icon: '📱',
  capabilities: ['reels-generation', 'platform-optimize', 'trend-templates', 'hook-sequences', 'cta-overlays'],
  acceptedInputs: ['text', 'image', 'video', 'audio'],
  producedOutputs: ['video', 'image'],
  exportFormats: ['mp4', 'webm', 'png'],
  canHandoffTo: ['video-editor-agent', 'music-agent', 'thumbnail-agent', 'marketing-agent'],
  receivesFrom: ['agent-g', 'video-agent', 'marketing-agent', 'content-agent'],
  provider: 'replicate',
  model: 'anotherjesse/zeroscope-v2-xl',
  systemPrompt: 'You are the Reels & Social Video Agent for MyAvatar.ge. You create short-form vertical content optimized for TikTok, Instagram Reels, and YouTube Shorts. Apply trending templates, hook sequences, and CTA overlays.',
  permissions: ['chat', 'generate', 'social'],
  baseCost: 12,
  requiredPlan: 'FREE',
  qaThreshold: 80,
  timeoutSeconds: 150,
  maxAttempts: 2,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

const STORE_AGENT: AgentContract = {
  agentId: 'store-agent',
  name: 'Store Agent',
  nameKa: 'მაღაზიის აგენტი',
  nameRu: 'Агент магазина',
  agentType: 'specialist',
  workerType: 'cpu',
  serviceSlugs: ['shop'],
  domain: ['store', 'shop', 'listing', 'product', 'catalog', 'inventory', 'ecommerce', 'marketplace'],
  icon: '🛒',
  capabilities: ['product-listing', 'catalog-management', 'pricing-optimization', 'inventory-tracking', 'store-audit'],
  acceptedInputs: ['text', 'image'],
  producedOutputs: ['text', 'document'],
  exportFormats: ['csv', 'json', 'pdf'],
  canHandoffTo: ['seo-agent', 'image-agent', 'content-agent', 'marketing-agent'],
  receivesFrom: ['agent-g', 'avatar-agent', 'image-agent', 'thumbnail-agent'],
  provider: 'gpt',
  model: 'gpt-4o',
  systemPrompt: 'You are the Store Agent for MyAvatar.ge. You manage product listings, catalog operations, pricing optimization, inventory tracking, and store audits. Focus on conversion optimization and marketplace best practices.',
  permissions: ['chat', 'commerce', 'listing', 'analyze'],
  baseCost: 6,
  requiredPlan: 'PRO',
  qaThreshold: 85,
  timeoutSeconds: 60,
  maxAttempts: 3,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

const SEO_AGENT: AgentContract = {
  agentId: 'seo-agent',
  name: 'SEO Agent',
  nameKa: 'SEO აგენტი',
  nameRu: 'SEO-агент',
  agentType: 'specialist',
  workerType: 'cpu',
  serviceSlugs: ['text'],
  domain: ['seo', 'keyword', 'meta', 'rank', 'search-engine', 'optimization', 'sitemap', 'schema'],
  icon: '🔍',
  capabilities: ['keyword-research', 'meta-optimization', 'content-seo', 'technical-seo', 'competitor-analysis'],
  acceptedInputs: ['text', 'document'],
  producedOutputs: ['text', 'document'],
  exportFormats: ['txt', 'pdf', 'json', 'csv'],
  canHandoffTo: ['content-agent', 'store-agent', 'marketing-agent'],
  receivesFrom: ['agent-g', 'store-agent', 'content-agent', 'business-agent'],
  provider: 'gpt',
  model: 'gpt-4o',
  systemPrompt: 'You are the SEO Agent for MyAvatar.ge. You handle keyword research, meta optimization, content SEO, technical SEO audits, and competitor analysis. Optimize for Georgian, English, and Russian search markets.',
  permissions: ['chat', 'analyze', 'seo'],
  baseCost: 5,
  requiredPlan: 'PRO',
  qaThreshold: 85,
  timeoutSeconds: 60,
  maxAttempts: 3,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

const AFFILIATE_AGENT: AgentContract = {
  agentId: 'affiliate-agent',
  name: 'Affiliate Agent',
  nameKa: 'აფილიეიტ აგენტი',
  nameRu: 'Партнёрский агент',
  agentType: 'specialist',
  workerType: 'cpu',
  serviceSlugs: ['business'],
  domain: ['affiliate', 'referral', 'commission', 'partner', 'reseller', 'payout'],
  icon: '🤝',
  capabilities: ['affiliate-setup', 'commission-tracking', 'referral-management', 'payout-reports', 'partner-onboarding'],
  acceptedInputs: ['text', 'document'],
  producedOutputs: ['text', 'document'],
  exportFormats: ['csv', 'json', 'pdf'],
  canHandoffTo: ['revenue-agent', 'business-agent', 'marketing-agent'],
  receivesFrom: ['agent-g', 'business-agent', 'store-agent'],
  provider: 'gpt',
  model: 'gpt-4o',
  systemPrompt: 'You are the Affiliate Agent for MyAvatar.ge. You manage affiliate programs, commission tracking, referral links, partner onboarding, and payout reports. Optimize for partner engagement and revenue growth.',
  permissions: ['chat', 'commerce', 'analyze'],
  baseCost: 5,
  requiredPlan: 'PRO',
  qaThreshold: 85,
  timeoutSeconds: 60,
  maxAttempts: 3,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

const BUSINESS_AGENT: AgentContract = {
  agentId: 'business-agent',
  name: 'Business Agent',
  nameKa: 'ბიზნეს აგენტი',
  nameRu: 'Бизнес-агент',
  agentType: 'specialist',
  workerType: 'cpu',
  serviceSlugs: ['business'],
  domain: ['business', 'strategy', 'plan', 'market', 'analysis', 'swot', 'pestel', 'forecast'],
  icon: '📊',
  capabilities: ['business-plan', 'market-analysis', 'strategy', 'forecasting', 'swot', 'competitor-analysis'],
  acceptedInputs: ['text', 'document'],
  producedOutputs: ['text', 'document'],
  exportFormats: ['pdf', 'csv', 'json', 'docx'],
  canHandoffTo: ['revenue-agent', 'executive-agent', 'content-agent', 'store-agent', 'marketing-agent'],
  receivesFrom: ['agent-g', 'revenue-agent', 'executive-agent'],
  provider: 'gpt',
  model: 'gpt-4.1',
  systemPrompt: 'You are the Business Agent for MyAvatar.ge. You handle business strategy, market analysis, financial planning, forecasting, product analysis, and reselling pipelines. Use frameworks (SWOT, PESTEL, Porter\'s Five Forces). Deliver data-driven insights.',
  permissions: ['chat', 'analysis', 'strategy', 'forecasting'],
  baseCost: 12,
  requiredPlan: 'PRO',
  qaThreshold: 90,
  timeoutSeconds: 120,
  maxAttempts: 3,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

const REVENUE_AGENT: AgentContract = {
  agentId: 'revenue-agent',
  name: 'Revenue Agent',
  nameKa: 'შემოსავლის აგენტი',
  nameRu: 'Агент доходов',
  agentType: 'specialist',
  workerType: 'cpu',
  serviceSlugs: ['business'],
  domain: ['revenue', 'monetization', 'pricing', 'subscription', 'mrr', 'arpu', 'churn', 'ltv'],
  icon: '💰',
  capabilities: ['revenue-projection', 'pricing-strategy', 'churn-analysis', 'monetization-plan', 'financial-modeling'],
  acceptedInputs: ['text', 'document'],
  producedOutputs: ['text', 'document'],
  exportFormats: ['pdf', 'csv', 'json'],
  canHandoffTo: ['business-agent', 'executive-agent', 'affiliate-agent'],
  receivesFrom: ['agent-g', 'business-agent', 'store-agent'],
  provider: 'gpt',
  model: 'gpt-4.1',
  systemPrompt: 'You are the Revenue Agent for MyAvatar.ge. You specialize in revenue projections, pricing strategies, churn analysis, monetization planning, and financial modeling. Build detailed growth scenarios with MRR, ARPU, and LTV metrics.',
  permissions: ['chat', 'analysis', 'forecasting'],
  baseCost: 10,
  requiredPlan: 'PRO',
  qaThreshold: 90,
  timeoutSeconds: 90,
  maxAttempts: 3,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

const RISK_AGENT: AgentContract = {
  agentId: 'risk-agent',
  name: 'Risk & Audit Agent',
  nameKa: 'რისკისა და აუდიტის აგენტი',
  nameRu: 'Агент рисков и аудита',
  agentType: 'specialist',
  workerType: 'cpu',
  serviceSlugs: ['visual-intel'],
  domain: ['risk', 'audit', 'compliance', 'quality', 'brand-consistency', 'safety', 'review'],
  icon: '🛡️',
  capabilities: ['brand-audit', 'quality-scoring', 'risk-assessment', 'compliance-check', 'safety-review'],
  acceptedInputs: ['image', 'video', 'text', 'document'],
  producedOutputs: ['text', 'document'],
  exportFormats: ['json', 'csv', 'pdf', 'txt'],
  canHandoffTo: ['qa-agent', 'business-agent', 'content-agent'],
  receivesFrom: ['agent-g', 'qa-agent', 'marketing-agent'],
  provider: 'gpt',
  model: 'gpt-4o',
  systemPrompt: 'You are the Risk & Audit Agent for MyAvatar.ge. You analyze creative assets for brand consistency, score content quality (0-100), identify compliance issues, suggest improvements, and conduct safety reviews. Be analytical and data-driven.',
  permissions: ['chat', 'analyze', 'score'],
  baseCost: 8,
  requiredPlan: 'PRO',
  qaThreshold: 92,
  timeoutSeconds: 90,
  maxAttempts: 3,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

const EXECUTIVE_AGENT: AgentContract = {
  agentId: 'executive-agent',
  name: 'Executive Summary Agent',
  nameKa: 'ექსიქუთივ სამარის აგენტი',
  nameRu: 'Агент резюме',
  agentType: 'specialist',
  workerType: 'cpu',
  serviceSlugs: ['business'],
  domain: ['executive', 'summary', 'presentation', 'report', 'stakeholder', 'brief', 'dashboard'],
  icon: '📋',
  capabilities: ['executive-summary', 'presentation-build', 'kpi-dashboard', 'stakeholder-brief', 'board-report'],
  acceptedInputs: ['text', 'document'],
  producedOutputs: ['text', 'document'],
  exportFormats: ['pdf', 'docx', 'json'],
  canHandoffTo: ['business-agent', 'revenue-agent'],
  receivesFrom: ['agent-g', 'business-agent', 'revenue-agent', 'risk-agent'],
  provider: 'gpt',
  model: 'gpt-4.1',
  systemPrompt: 'You are the Executive Summary Agent for MyAvatar.ge. You create concise executive summaries, KPI dashboards, stakeholder presentations, and board reports. Transform complex data into clear, actionable briefings.',
  permissions: ['chat', 'write', 'analyze'],
  baseCost: 8,
  requiredPlan: 'PRO',
  qaThreshold: 92,
  timeoutSeconds: 90,
  maxAttempts: 3,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

const DEV_AGENT: AgentContract = {
  agentId: 'dev-agent',
  name: 'Dev & Programming Agent',
  nameKa: 'დეველოპერის აგენტი',
  nameRu: 'Агент разработки',
  agentType: 'specialist',
  workerType: 'cpu',
  serviceSlugs: ['software'],
  domain: ['code', 'programming', 'debug', 'deploy', 'api', 'app', 'software', 'refactor', 'architecture'],
  icon: '💻',
  capabilities: ['code-generation', 'debugging', 'code-review', 'api-design', 'deployment', 'refactoring'],
  acceptedInputs: ['text', 'document'],
  producedOutputs: ['text', 'document', 'file'],
  exportFormats: ['json', 'txt', 'pdf'],
  canHandoffTo: ['business-agent', 'qa-agent'],
  receivesFrom: ['agent-g', 'business-agent'],
  provider: 'gpt',
  model: 'gpt-4.1',
  systemPrompt: 'You are the Dev & Programming Agent for MyAvatar.ge. You write code, debug issues, review architecture, design APIs, and handle deployment tasks. Support TypeScript, Python, and modern web stacks.',
  permissions: ['chat', 'code-gen', 'debug', 'deploy'],
  baseCost: 10,
  requiredPlan: 'PRO',
  qaThreshold: 90,
  timeoutSeconds: 120,
  maxAttempts: 3,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

const CONTENT_AGENT: AgentContract = {
  agentId: 'content-agent',
  name: 'Content & Copy Agent',
  nameKa: 'კონტენტისა და კოპის აგენტი',
  nameRu: 'Контент-агент',
  agentType: 'specialist',
  workerType: 'cpu',
  serviceSlugs: ['text'],
  domain: ['content', 'copy', 'writing', 'ad-copy', 'script', 'article', 'blog', 'landing-page', 'translation'],
  icon: '✍️',
  capabilities: ['copywriting', 'ad-copy', 'script-writing', 'blog-articles', 'landing-pages', 'translations'],
  acceptedInputs: ['text', 'document'],
  producedOutputs: ['text', 'document'],
  exportFormats: ['txt', 'pdf', 'docx', 'json'],
  canHandoffTo: ['seo-agent', 'image-agent', 'video-agent', 'marketing-agent'],
  receivesFrom: ['agent-g', 'seo-agent', 'business-agent', 'marketing-agent'],
  provider: 'gpt',
  model: 'gpt-4o',
  systemPrompt: 'You are the Content & Copy Agent for MyAvatar.ge. You write ads, landing pages, scripts, articles, and documents using AIDA/PAS frameworks. Generate content simultaneously in KA, EN, and RU when requested. Include SEO optimization.',
  permissions: ['chat', 'write', 'seo', 'translate'],
  baseCost: 5,
  requiredPlan: 'FREE',
  qaThreshold: 85,
  timeoutSeconds: 90,
  maxAttempts: 3,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

const MARKETING_AGENT: AgentContract = {
  agentId: 'marketing-agent',
  name: 'Marketing Agent',
  nameKa: 'მარკეტინგის აგენტი',
  nameRu: 'Маркетинговый агент',
  agentType: 'specialist',
  workerType: 'cpu',
  serviceSlugs: ['media'],
  domain: ['marketing', 'campaign', 'social-media', 'brand', 'content-calendar', 'ads', 'launch'],
  icon: '📣',
  capabilities: ['campaign-planning', 'social-strategy', 'brand-kit', 'content-calendar', 'ad-management', 'launch-plan'],
  acceptedInputs: ['text', 'image', 'video', 'audio'],
  producedOutputs: ['text', 'image', 'video', 'document'],
  exportFormats: ['png', 'mp4', 'mp3', 'pdf'],
  canHandoffTo: ['reels-agent', 'content-agent', 'image-agent', 'seo-agent', 'store-agent'],
  receivesFrom: ['agent-g', 'business-agent', 'content-agent', 'reels-agent'],
  provider: 'gpt',
  model: 'gpt-4o',
  systemPrompt: 'You are the Marketing Agent for MyAvatar.ge. You plan campaigns, build social media strategies, create brand kits, manage content calendars, and coordinate multi-platform launches. Optimize for Instagram, TikTok, YouTube, Facebook, and LinkedIn.',
  permissions: ['chat', 'social', 'campaign', 'analyze'],
  baseCost: 10,
  requiredPlan: 'PRO',
  qaThreshold: 85,
  timeoutSeconds: 90,
  maxAttempts: 3,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

const QA_AGENT: AgentContract = {
  agentId: 'qa-agent',
  name: 'QA & Optimization Agent',
  nameKa: 'QA და ოპტიმიზაციის აგენტი',
  nameRu: 'Агент QA и оптимизации',
  agentType: 'specialist',
  workerType: 'cpu',
  serviceSlugs: ['visual-intel'],
  domain: ['qa', 'quality', 'optimization', 'test', 'review', 'score', 'improve', 'benchmark'],
  icon: '✅',
  capabilities: ['quality-assurance', 'output-scoring', 'auto-improvement', 'benchmark', 'a-b-test'],
  acceptedInputs: ['image', 'video', 'text', 'document', 'audio'],
  producedOutputs: ['text', 'document'],
  exportFormats: ['json', 'csv', 'pdf', 'txt'],
  canHandoffTo: ['risk-agent', 'content-agent', 'image-agent'],
  receivesFrom: ['agent-g', 'risk-agent'],
  provider: 'gpt',
  model: 'gpt-4o',
  systemPrompt: 'You are the QA & Optimization Agent for MyAvatar.ge. You score outputs (0-100), run quality gates, suggest auto-improvements, benchmark against standards, and ensure all deliverables meet platform quality thresholds.',
  permissions: ['chat', 'analyze', 'score', 'optimize'],
  baseCost: 5,
  requiredPlan: 'FREE',
  qaThreshold: 95,
  timeoutSeconds: 60,
  maxAttempts: 3,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

// ─── Utility Agents (mapped to workflow/prompt services) ─────────────────────

const WORKFLOW_AGENT: AgentContract = {
  agentId: 'workflow-agent',
  name: 'Workflow Agent',
  nameKa: 'ვორკფლოუს აგენტი',
  nameRu: 'Агент рабочих процессов',
  agentType: 'integration',
  workerType: 'cpu',
  serviceSlugs: ['workflow'],
  domain: ['workflow', 'automation', 'pipeline', 'schedule', 'trigger', 'dag'],
  icon: '⚡',
  capabilities: ['pipeline-design', 'dag-execution', 'scheduling', 'trigger-management', 'approval-gates'],
  acceptedInputs: ['text'],
  producedOutputs: ['text', 'document'],
  exportFormats: ['json', 'pdf'],
  canHandoffTo: ['agent-g'],
  receivesFrom: ['agent-g'],
  provider: 'gpt',
  model: 'gpt-4o',
  systemPrompt: 'You are the Workflow Agent for MyAvatar.ge. You design automation pipelines, DAG workflows, scheduling, triggers, approval gates, and retry strategies. Think in terms of pipeline steps and dependencies.',
  permissions: ['chat', 'automate', 'schedule'],
  baseCost: 5,
  requiredPlan: 'PRO',
  qaThreshold: 85,
  timeoutSeconds: 60,
  maxAttempts: 3,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

const PROMPT_AGENT: AgentContract = {
  agentId: 'prompt-agent',
  name: 'Prompt Agent',
  nameKa: 'პრომპტის აგენტი',
  nameRu: 'Промпт-агент',
  agentType: 'integration',
  workerType: 'cpu',
  serviceSlugs: ['prompt'],
  domain: ['prompt', 'prompt-engineering', 'prompt-optimization', 'template'],
  icon: '🧪',
  capabilities: ['prompt-optimization', 'prompt-templates', 'negative-prompts', 'prompt-testing'],
  acceptedInputs: ['text'],
  producedOutputs: ['text'],
  exportFormats: ['json', 'txt'],
  canHandoffTo: ['image-agent', 'video-agent', 'avatar-agent'],
  receivesFrom: ['agent-g', 'image-agent'],
  provider: 'gpt',
  model: 'gpt-4o',
  systemPrompt: 'You are the Prompt Agent for MyAvatar.ge. You optimize prompts for image, video, and avatar generation. Design templates, negative prompt sets, and test prompts across models.',
  permissions: ['chat', 'write', 'test'],
  baseCost: 3,
  requiredPlan: 'FREE',
  qaThreshold: 80,
  timeoutSeconds: 30,
  maxAttempts: 3,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

const TOURISM_AGENT: AgentContract = {
  agentId: 'tourism-agent',
  name: 'Tourism Agent',
  nameKa: 'ტურიზმის აგენტი',
  nameRu: 'Туристический агент',
  agentType: 'specialist',
  workerType: 'cpu',
  serviceSlugs: ['tourism'],
  domain: ['tourism', 'travel', 'itinerary', 'destination', 'hotel', 'guide', 'georgia'],
  icon: '✈️',
  capabilities: ['itinerary-generation', 'destination-promo', 'travel-guide', 'localization'],
  acceptedInputs: ['text', 'image'],
  producedOutputs: ['text', 'document', 'image'],
  exportFormats: ['pdf', 'json', 'txt'],
  canHandoffTo: ['image-agent', 'content-agent', 'video-agent'],
  receivesFrom: ['agent-g'],
  provider: 'gpt',
  model: 'gpt-4o',
  systemPrompt: 'You are the Tourism Agent for MyAvatar.ge. You create smart itineraries, destination promotions, travel guides, and localized content for Georgian tourism. Combine cultural knowledge with practical travel planning.',
  permissions: ['chat', 'write', 'generate'],
  baseCost: 5,
  requiredPlan: 'FREE',
  qaThreshold: 80,
  timeoutSeconds: 60,
  maxAttempts: 3,
  supportedLanguages: ['ka', 'en', 'ru'],
  active: true,
};

// ─── UNIFIED REGISTRY ────────────────────────────────────────────────────────

/** All agents in the platform, indexed by agentId */
export const AGENT_CONTRACTS: Record<string, AgentContract> = {
  'agent-g': AGENT_G,
  'avatar-agent': AVATAR_AGENT,
  'video-agent': VIDEO_AGENT,
  'image-agent': IMAGE_AGENT,
  'thumbnail-agent': THUMBNAIL_AGENT,
  'music-agent': MUSIC_AGENT,
  'subtitle-agent': SUBTITLE_AGENT,
  'video-editor-agent': VIDEO_EDITOR_AGENT,
  'reels-agent': REELS_AGENT,
  'store-agent': STORE_AGENT,
  'seo-agent': SEO_AGENT,
  'affiliate-agent': AFFILIATE_AGENT,
  'business-agent': BUSINESS_AGENT,
  'revenue-agent': REVENUE_AGENT,
  'risk-agent': RISK_AGENT,
  'executive-agent': EXECUTIVE_AGENT,
  'dev-agent': DEV_AGENT,
  'content-agent': CONTENT_AGENT,
  'marketing-agent': MARKETING_AGENT,
  'qa-agent': QA_AGENT,
  'workflow-agent': WORKFLOW_AGENT,
  'prompt-agent': PROMPT_AGENT,
  'tourism-agent': TOURISM_AGENT,
};

/** Ordered list of all agent contracts */
export const ALL_AGENTS: AgentContract[] = Object.values(AGENT_CONTRACTS);

/** Get contract by agentId */
export function getAgentContract(agentId: string): AgentContract | undefined {
  return AGENT_CONTRACTS[agentId];
}

/** Get all specialist agents (excludes director) */
export function getSpecialistAgents(): AgentContract[] {
  return ALL_AGENTS.filter(a => a.agentType === 'specialist');
}

/** Get agents that power a specific service slug */
export function getAgentsForService(serviceSlug: string): AgentContract[] {
  return ALL_AGENTS.filter(a => a.serviceSlugs.includes(serviceSlug));
}

/** Get the primary agent for a service (first match) */
export function getPrimaryAgentForService(serviceSlug: string): AgentContract | undefined {
  return ALL_AGENTS.find(a => a.serviceSlugs.includes(serviceSlug));
}

/** Service slug → agentId mapping for backward compat with router */
export const SERVICE_TO_AGENT_MAP: Record<string, string> = {};
for (const agent of ALL_AGENTS) {
  for (const slug of agent.serviceSlugs) {
    if (!SERVICE_TO_AGENT_MAP[slug]) {
      SERVICE_TO_AGENT_MAP[slug] = agent.agentId;
    }
  }
}

/** Get agents that can receive handoffs from a given agent */
export function getHandoffTargets(agentId: string): AgentContract[] {
  const contract = AGENT_CONTRACTS[agentId];
  if (!contract) return [];
  return contract.canHandoffTo.flatMap(id => {
    const agent = AGENT_CONTRACTS[id];
    return agent ? [agent] : [];
  });
}

/** Match user intent to best agent(s) based on domain keywords */
export function matchAgentsByIntent(userMessage: string): AgentContract[] {
  const msg = userMessage.toLowerCase();
  const scored = ALL_AGENTS
    .filter(a => a.active && a.agentType !== 'director')
    .map(agent => {
      const score = agent.domain.reduce((acc, keyword) => {
        return acc + (msg.includes(keyword) ? 1 : 0);
      }, 0);
      return { agent, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map(({ agent }) => agent);
}

/** Get agent count by type */
export function getAgentStats() {
  const director = ALL_AGENTS.filter(a => a.agentType === 'director').length;
  const specialist = ALL_AGENTS.filter(a => a.agentType === 'specialist').length;
  const integration = ALL_AGENTS.filter(a => a.agentType === 'integration').length;
  return { total: ALL_AGENTS.length, director, specialist, integration };
}
