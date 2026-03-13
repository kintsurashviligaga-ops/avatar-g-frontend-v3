/**
 * lib/chat/types/result.types.ts
 * Normalized result model — all service outputs render through this.
 */

export type ResultType =
  | 'avatar'
  | 'video'
  | 'image'
  | 'poster'
  | 'thumbnail'
  | 'music'
  | 'subtitle-set'
  | 'product-listing'
  | 'business-plan'
  | 'revenue-plan'
  | 'executive-summary'
  | 'app-spec'
  | 'workflow-package'
  | 'text'
  | 'document';

export interface ResultAsset {
  assetId: string;
  type: 'image' | 'video' | 'audio' | 'text' | 'document' | '3d-model';
  label: string;
  url?: string;
  content?: string;
  mimeType?: string;
  preview?: string;
}

export interface SuggestionChip {
  label: string;
  action: string;
  icon?: string;
  variant?: 'primary' | 'secondary';
}

export interface ResultCard {
  resultId: string;
  resultType: ResultType;
  title: string;
  subtitle?: string;
  preview?: string;
  sourceAgentId: string;
  status: 'complete' | 'partial' | 'error';
  assets: ResultAsset[];
  actions: SuggestionChip[];
  suggestions: SuggestionChip[];
  linkedProjectId?: string;
  linkedWorkflowId?: string;
  linkedAssetIds: string[];
  qaScore?: number;
  exportOptions: string[];
  createdAt: string;
}

/**
 * Required result actions — every result card can render these
 */
export const RESULT_ACTIONS = [
  'open',
  'continue',
  'use-in-next',
  'save-to-project',
  'export',
  'create-variant',
  'ask-agent-g',
] as const;

export type ResultAction = (typeof RESULT_ACTIONS)[number];
