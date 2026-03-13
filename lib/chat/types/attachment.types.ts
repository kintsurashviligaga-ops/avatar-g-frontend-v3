/**
 * lib/chat/types/attachment.types.ts
 * Normalized attachment model for all file uploads.
 */

export type AttachmentType = 'image' | 'video' | 'audio' | 'document' | 'reference';

export interface ChatAttachment {
  attachmentId: string;
  type: AttachmentType;
  fileName: string;
  mimeType: string;
  size: number;
  previewUrl?: string;
  extractedMetadata?: Record<string, string>;
  linkedAssetId?: string;
}

/**
 * Infer the likely usage flow from an attachment type.
 * - image → avatar / poster / product image flows
 * - video → subtitle / edit / reel flows
 * - audio → music / subtitle / cover generation flows
 */
export function inferAttachmentUsage(type: AttachmentType): string[] {
  switch (type) {
    case 'image':
      return ['avatar-create', 'poster-generate', 'product-image', 'style-transfer'];
    case 'video':
      return ['subtitle-generate', 'video-edit', 'reels-export', 'thumbnail-generate'];
    case 'audio':
      return ['music-generate', 'subtitle-generate', 'voice-clone'];
    case 'document':
      return ['business-plan-create', 'content-generate', 'seo-optimize'];
    case 'reference':
      return ['style-transfer', 'brand-match'];
    default:
      return [];
  }
}

/** Size limits */
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_ATTACHMENTS = 5;
