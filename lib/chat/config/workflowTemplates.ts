/**
 * lib/chat/config/workflowTemplates.ts
 * Config-driven reusable workflow templates callable from chat.
 */

import type { WorkflowStep } from '../types';

export interface WorkflowTemplate {
  templateId: string;
  name: string;
  nameKa: string;
  nameRu: string;
  description: string;
  icon: string;
  steps: Omit<WorkflowStep, 'status' | 'durationMs'>[];
  estimatedMinutes: number;
  category: 'creator' | 'store' | 'business' | 'app' | 'marketing';
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    templateId: 'creator-flow',
    name: 'Creator Flow',
    nameKa: 'კრეატორ ფლოუ',
    nameRu: 'Креатор-флоу',
    description: 'Avatar → Video → Music → Subtitles → Reels export',
    icon: '🎬',
    category: 'creator',
    estimatedMinutes: 15,
    steps: [
      { index: 0, label: 'Create Avatar', agentId: 'avatar-agent' },
      { index: 1, label: 'Generate Video', agentId: 'video-agent' },
      { index: 2, label: 'Compose Music', agentId: 'music-agent' },
      { index: 3, label: 'Add Subtitles', agentId: 'subtitle-agent' },
      { index: 4, label: 'Export Reels', agentId: 'reels-agent' },
    ],
  },
  {
    templateId: 'store-flow',
    name: 'Store Flow',
    nameKa: 'მაღაზიის ფლოუ',
    nameRu: 'Магазин-флоу',
    description: 'Product image → Listing → SEO → Affiliate setup',
    icon: '🏪',
    category: 'store',
    estimatedMinutes: 10,
    steps: [
      { index: 0, label: 'Product Image', agentId: 'image-agent' },
      { index: 1, label: 'Create Listing', agentId: 'store-agent' },
      { index: 2, label: 'SEO Optimize', agentId: 'seo-agent' },
      { index: 3, label: 'Affiliate Setup', agentId: 'affiliate-agent' },
    ],
  },
  {
    templateId: 'business-flow',
    name: 'Business Flow',
    nameKa: 'ბიზნეს ფლოუ',
    nameRu: 'Бизнес-флоу',
    description: 'Business plan → Revenue plan → Risk scan → Executive summary',
    icon: '📊',
    category: 'business',
    estimatedMinutes: 20,
    steps: [
      { index: 0, label: 'Business Plan', agentId: 'business-agent' },
      { index: 1, label: 'Revenue Plan', agentId: 'revenue-agent' },
      { index: 2, label: 'Risk Scan', agentId: 'risk-agent' },
      { index: 3, label: 'Executive Summary', agentId: 'executive-agent' },
    ],
  },
  {
    templateId: 'app-flow',
    name: 'App Flow',
    nameKa: 'აპლიკაციის ფლოუ',
    nameRu: 'Апп-флоу',
    description: 'App spec → Architecture review → Task breakdown',
    icon: '💻',
    category: 'app',
    estimatedMinutes: 25,
    steps: [
      { index: 0, label: 'App Spec', agentId: 'dev-agent' },
      { index: 1, label: 'Architecture Review', agentId: 'dev-agent' },
      { index: 2, label: 'Task Breakdown', agentId: 'dev-agent' },
    ],
  },
  {
    templateId: 'marketing-flow',
    name: 'Marketing Flow',
    nameKa: 'მარკეტინგ ფლოუ',
    nameRu: 'Маркетинг-флоу',
    description: 'Campaign plan → Content creation → SEO → Social reels',
    icon: '📣',
    category: 'marketing',
    estimatedMinutes: 15,
    steps: [
      { index: 0, label: 'Campaign Plan', agentId: 'marketing-agent' },
      { index: 1, label: 'Create Content', agentId: 'content-agent' },
      { index: 2, label: 'SEO Optimize', agentId: 'seo-agent' },
      { index: 3, label: 'Social Reels', agentId: 'reels-agent' },
    ],
  },
  {
    templateId: 'social-content-pack',
    name: 'Social Content Pack',
    nameKa: 'სოციალური კონტენტ პაკეტი',
    nameRu: 'Пакет соцконтента',
    description: 'Poster → Thumbnail → Reels → Music → Caption',
    icon: '📱',
    category: 'creator',
    estimatedMinutes: 12,
    steps: [
      { index: 0, label: 'Create Poster', agentId: 'image-agent' },
      { index: 1, label: 'Make Thumbnail', agentId: 'thumbnail-agent' },
      { index: 2, label: 'Generate Reel', agentId: 'reels-agent' },
      { index: 3, label: 'Add Music', agentId: 'music-agent' },
      { index: 4, label: 'Write Caption', agentId: 'content-agent' },
    ],
  },
];

export function getWorkflowTemplate(templateId: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find(t => t.templateId === templateId);
}

export function getTemplatesByCategory(category: string): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES.filter(t => t.category === category);
}
