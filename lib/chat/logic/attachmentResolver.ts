/**
 * lib/chat/logic/attachmentResolver.ts
 * Processes attachments: validation, preview generation, usage inference.
 */

import type { ChatAttachment, AttachmentType } from '../types';
import { MAX_ATTACHMENT_SIZE, MAX_ATTACHMENTS, inferAttachmentUsage } from '../types';

export interface AttachmentValidation {
  valid: boolean;
  error?: string;
}

/**
 * Validate a file before creating an attachment object.
 */
export function validateAttachment(
  file: File,
  currentCount: number
): AttachmentValidation {
  if (currentCount >= MAX_ATTACHMENTS) {
    return { valid: false, error: `Maximum ${MAX_ATTACHMENTS} attachments allowed` };
  }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    return { valid: false, error: `File size exceeds ${MAX_ATTACHMENT_SIZE / (1024 * 1024)}MB limit` };
  }
  return { valid: true };
}

/**
 * Create a ChatAttachment from a File object.
 */
export function fileToAttachment(file: File): ChatAttachment {
  const type = inferFileType(file);
  return {
    attachmentId: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
  };
}

/**
 * Generate a preview URL for an image attachment.
 * Returns a cleanup function to revoke the object URL.
 */
export function createAttachmentPreview(file: File): { url: string; revoke: () => void } | null {
  if (!file.type.startsWith('image/')) return null;
  const url = URL.createObjectURL(file);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}

/**
 * Get suggested actions based on attachment types.
 */
export function getSuggestedActionsForAttachments(attachments: ChatAttachment[]): string[] {
  const suggestions = new Set<string>();
  for (const att of attachments) {
    for (const usage of inferAttachmentUsage(att.type)) {
      suggestions.add(usage);
    }
  }
  return [...suggestions];
}

function inferFileType(file: File): AttachmentType {
  const mime = file.type;
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}
