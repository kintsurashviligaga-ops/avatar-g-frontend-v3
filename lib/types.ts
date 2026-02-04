export type ServiceKey =
  | 'avatar'
  | 'voice'
  | 'image'
  | 'music'
  | 'video'
  | 'game'
  | 'production'
  | 'business'

export type AssetType = 'avatar' | 'voice' | 'image' | 'music' | 'video' | 'project'

export interface Asset {
  id: string
  type: AssetType
  title: string
  createdAt: string
  url?: string
  sizeLabel?: string
  meta?: Record<string, unknown>
}

export type PipelineJobAction = 'convert' | 'sync' | 'attach' | 'generate'
export type PipelineJobStatus = 'queued' | 'processing' | 'ready' | 'error'

export interface PipelineJob {
  id: string
  createdAt: string
  sourceService?: ServiceKey
  targetService: ServiceKey
  action: PipelineJobAction
  assetId?: string
  status: PipelineJobStatus
  error?: string
}

export interface ChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  text: string
  createdAt: string
  meta?: {
    service?: ServiceKey
    promptPreview?: string
    selections?: Record<string, string>
    assetRefs?: string[]
    pipelineJobId?: string
  }
}

export interface ServiceConfig {
  key: ServiceKey
  title: string
  subtitle: string
  icon: string
  accent: string
  dropdowns: DropdownConfig[]
}

export interface DropdownConfig {
  key: string
  label: string
  options: string[]
}

export type ChatTab = 'chat' | 'history' | 'library' | 'pipeline'

export interface WorkspaceState {
  activeService: ServiceKey | null
  chatTab: ChatTab
  messages: ChatMessage[]
  assets: Asset[]
  pipelineJobs: PipelineJob[]
  credits: number
  storageUsed: number
  storageTotal: number
  dropdownSelections: Record<string, string>
  isRecording: boolean
}
