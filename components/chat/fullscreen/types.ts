/**
 * Fullscreen chat types — lightweight message types for the fullscreen experience.
 * These map to the existing lib/chat/types but are simpler for the page-level chat.
 */

export type FCMessageRole = 'user' | 'agent' | 'system' | 'result'

export type FCUserMessage = {
  id: string
  role: 'user'
  text: string
  attachments: FCAttachment[]
  createdAt: string
  status: 'sending' | 'sent' | 'failed'
}

export type FCAgentMessage = {
  id: string
  role: 'agent'
  text: string
  createdAt: string
  isStreaming: boolean
  suggestions?: string[]
  relatedService?: string
}

export type FCSystemMessage = {
  id: string
  role: 'system'
  statusType: 'uploading' | 'listening' | 'processing' | 'generating' | 'complete' | 'error'
  text: string
  createdAt: string
}

export type FCResultMessage = {
  id: string
  role: 'result'
  resultType: 'avatar' | 'image' | 'video' | 'music' | 'text' | 'workflow'
  title: string
  description?: string
  previewUrl?: string
  actions?: { label: string; action: string }[]
  createdAt: string
}

export type FCMessage = FCUserMessage | FCAgentMessage | FCSystemMessage | FCResultMessage

export type FCAttachment = {
  id: string
  kind: 'image' | 'video' | 'audio' | 'document'
  fileName: string
  mimeType: string
  localPreviewUrl?: string
  size?: number
}

export type VoiceStatus = 'idle' | 'requesting_permission' | 'listening' | 'processing' | 'error'
