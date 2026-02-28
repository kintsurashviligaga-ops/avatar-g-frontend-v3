import type { WorkerType, AgentType, LocaleCode, StylePreset } from './core'

export interface AgentCapabilityPack {
  id: string
  name: string
  agent_type: AgentType
  parent_id: string | null
  worker_type: WorkerType
  timeout_seconds: number
  max_attempts: number
  qa_threshold: number // 0–100, default 85
  supported_languages: LocaleCode[]
  supported_presets: StylePreset[]
  capabilities: string[]
  input_schema: Record<string, unknown> // JSON Schema
  output_schema: Record<string, unknown> // JSON Schema
  active: boolean
  config: Record<string, unknown>
}

export type BundleType =
  | 'reels_pack_10'
  | 'brand_launch_kit'
  | 'song_cover_clip'
  | 'product_promo_kit'

export interface AgentGBundle {
  type: BundleType
  label: string
  description: string
  steps: { agentId: string; label: string; dependsOn?: number[] }[]
}

export const AGENT_G_BUNDLES: AgentGBundle[] = [
  {
    type: 'reels_pack_10',
    label: 'Reels Pack 10',
    description: '10 short-form videos from one source asset',
    steps: [
      { agentId: 'avatar-agent', label: 'Generate avatar / character' },
      { agentId: 'editing-agent', label: 'Cut 10 clips from source', dependsOn: [0] },
      { agentId: 'music-agent', label: 'Generate background tracks', dependsOn: [0] },
      { agentId: 'editing-agent', label: 'Add music + captions', dependsOn: [1, 2] },
      { agentId: 'image-agent', label: 'Generate 10 thumbnails', dependsOn: [1] },
      { agentId: 'text-agent', label: 'Write captions + hooks', dependsOn: [0] },
      { agentId: 'visual-intel-agent', label: 'QA score all outputs', dependsOn: [3, 4, 5] },
    ],
  },
  {
    type: 'brand_launch_kit',
    label: 'Brand Launch Kit',
    description: 'Full brand identity pack',
    steps: [
      { agentId: 'image-agent', label: 'Generate logo variants' },
      { agentId: 'photo-agent', label: 'Create brand photography set', dependsOn: [0] },
      { agentId: 'text-agent', label: 'Write brand voice guide', dependsOn: [0] },
      { agentId: 'media-agent', label: 'Assemble brand kit document', dependsOn: [0, 1, 2] },
      { agentId: 'prompt-agent', label: 'Generate reusable prompt cards', dependsOn: [0, 2] },
      { agentId: 'visual-intel-agent', label: 'Brand consistency audit', dependsOn: [3] },
    ],
  },
  {
    type: 'song_cover_clip',
    label: 'Song + Cover + Clip',
    description: 'Full single release pack',
    steps: [
      { agentId: 'music-agent', label: 'Produce track + stems' },
      { agentId: 'image-agent', label: 'Generate album cover art', dependsOn: [0] },
      { agentId: 'video-agent', label: 'Generate lyric video', dependsOn: [0, 1] },
      { agentId: 'editing-agent', label: 'Final mix + export', dependsOn: [0, 2] },
      { agentId: 'text-agent', label: 'Write press release', dependsOn: [0] },
      { agentId: 'visual-intel-agent', label: 'Final QA pass', dependsOn: [3, 4] },
    ],
  },
  {
    type: 'product_promo_kit',
    label: 'Product Promo Kit',
    description: 'Ad-ready product campaign pack',
    steps: [
      { agentId: 'photo-agent', label: 'Product photography set' },
      { agentId: 'image-agent', label: 'Ad creatives (1:1, 9:16, 16:9)', dependsOn: [0] },
      { agentId: 'video-agent', label: 'Product demo video', dependsOn: [0] },
      { agentId: 'editing-agent', label: 'Edit + add captions + music', dependsOn: [2] },
      { agentId: 'text-agent', label: 'Write ad copy variants', dependsOn: [0] },
      { agentId: 'media-agent', label: 'Compile campaign deliverables', dependsOn: [1, 3, 4] },
      { agentId: 'visual-intel-agent', label: 'Creative scoring + QA', dependsOn: [5] },
    ],
  },
]
