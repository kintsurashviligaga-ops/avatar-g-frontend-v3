/**
 * lib/chat/logic/resultMapper.ts
 * Normalizes raw service/API outputs into the shared ResultCard model.
 */

import type { ResultCard, ResultAsset, SuggestionChip, ResultType } from '../types';

/** Raw API result shape (from /api/chat or /api/chat/orchestrate) */
export interface RawApiResult {
  response?: string;
  artifacts?: Array<{
    type?: string;
    label?: string;
    mimeType?: string;
    url?: string;
    content?: string;
  }>;
  model?: string;
  agentId?: string;
  provider?: string;
}

/**
 * Map a raw API result into a normalized ResultCard.
 */
export function mapToResultCard(
  raw: RawApiResult,
  agentId: string,
  resultType: ResultType = 'text'
): ResultCard {
  const assets: ResultAsset[] = (raw.artifacts ?? []).map((a, i) => ({
    assetId: `asset_${Date.now()}_${i}`,
    type: inferAssetType(a.mimeType, a.type),
    label: a.label ?? `Asset ${i + 1}`,
    url: a.url,
    content: a.content,
    mimeType: a.mimeType,
    preview: a.url,
  }));

  const suggestions = buildResultSuggestions(resultType, agentId);

  return {
    resultId: `result_${Date.now()}`,
    resultType,
    title: inferTitle(resultType),
    subtitle: raw.response?.slice(0, 100),
    preview: assets[0]?.url,
    sourceAgentId: agentId,
    status: 'complete',
    assets,
    actions: buildResultActions(resultType),
    suggestions,
    linkedAssetIds: assets.map(a => a.assetId),
    qaScore: undefined,
    exportOptions: inferExportOptions(resultType),
    createdAt: new Date().toISOString(),
  };
}

function inferAssetType(
  mimeType?: string,
  typeHint?: string
): ResultAsset['type'] {
  if (typeHint === 'image' || mimeType?.startsWith('image/')) return 'image';
  if (typeHint === 'video' || mimeType?.startsWith('video/')) return 'video';
  if (typeHint === 'audio' || mimeType?.startsWith('audio/')) return 'audio';
  if (typeHint === '3d' || mimeType?.includes('gltf') || mimeType?.includes('glb')) return '3d-model';
  if (mimeType?.startsWith('application/')) return 'document';
  return 'text';
}

function inferTitle(resultType: ResultType): string {
  const titles: Record<ResultType, string> = {
    avatar: 'Avatar Created',
    video: 'Video Generated',
    image: 'Image Generated',
    poster: 'Poster Created',
    thumbnail: 'Thumbnail Ready',
    music: 'Music Composed',
    'subtitle-set': 'Subtitles Generated',
    'product-listing': 'Product Listing',
    'business-plan': 'Business Plan',
    'revenue-plan': 'Revenue Plan',
    'executive-summary': 'Executive Summary',
    'app-spec': 'App Specification',
    'workflow-package': 'Workflow Complete',
    text: 'Text Generated',
    document: 'Document Ready',
  };
  return titles[resultType] ?? 'Result Ready';
}

function buildResultActions(resultType: ResultType): SuggestionChip[] {
  const actions: SuggestionChip[] = [
    { label: 'Open', action: 'open-result', variant: 'primary' },
    { label: 'Save to Project', action: 'save-to-project', variant: 'secondary' },
    { label: 'Export', action: 'export-result', icon: '📤', variant: 'secondary' },
  ];
  if (resultType !== 'text' && resultType !== 'document') {
    actions.push({ label: 'Create Variant', action: 'create-variant', variant: 'secondary' });
  }
  return actions;
}

function buildResultSuggestions(resultType: ResultType, agentId: string): SuggestionChip[] {
  const map: Partial<Record<ResultType, SuggestionChip[]>> = {
    avatar: [
      { label: 'Generate Video', action: 'Create a video with this avatar', icon: '🎬' },
      { label: 'Create Poster', action: 'Make a poster with this avatar', icon: '🖼️' },
    ],
    video: [
      { label: 'Add Music', action: 'Add music to this video', icon: '🎵' },
      { label: 'Add Captions', action: 'Add subtitles to this video', icon: '💬' },
      { label: 'Make Reels', action: 'Create social reels from this video', icon: '📱' },
    ],
    image: [
      { label: 'Make Thumbnail', action: 'Create a thumbnail from this', icon: '📐' },
      { label: 'Add to Store', action: 'Use this image for a store listing', icon: '🏪' },
    ],
    'business-plan': [
      { label: 'Revenue Plan', action: 'Create a revenue plan', icon: '💰' },
      { label: 'Risk Scan', action: 'Run a risk assessment', icon: '🛡️' },
      { label: 'Executive Summary', action: 'Generate executive summary', icon: '📋' },
    ],
    music: [
      { label: 'Create Video', action: 'Generate a video with this music', icon: '🎬' },
    ],
    poster: [
      { label: 'Make Thumbnail', action: 'Create thumbnail from this poster', icon: '📐' },
      { label: 'Make Reel', action: 'Create a reel from this poster', icon: '📱' },
    ],
  };
  return map[resultType] ?? [
    { label: 'Continue', action: 'Continue with the next step', variant: 'primary' },
  ];
}

function inferExportOptions(resultType: ResultType): string[] {
  const map: Record<ResultType, string[]> = {
    avatar: ['png', 'jpg', 'webp', 'glb'],
    video: ['mp4', 'webm'],
    image: ['png', 'jpg', 'webp', 'svg'],
    poster: ['png', 'jpg', 'pdf'],
    thumbnail: ['png', 'jpg', 'webp'],
    music: ['mp3', 'wav'],
    'subtitle-set': ['srt', 'vtt', 'txt'],
    'product-listing': ['json', 'csv'],
    'business-plan': ['pdf', 'docx', 'json'],
    'revenue-plan': ['pdf', 'json'],
    'executive-summary': ['pdf', 'docx'],
    'app-spec': ['json', 'md'],
    'workflow-package': ['json', 'zip'],
    text: ['txt', 'md'],
    document: ['pdf', 'docx'],
  };
  return map[resultType] ?? ['json'];
}
