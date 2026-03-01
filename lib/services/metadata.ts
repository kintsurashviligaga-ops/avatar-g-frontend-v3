// lib/services/metadata.ts
// Rich metadata for each service — used by dynamic service pages

export type ServiceMeta = { icon: string; headline: string; description: string; features: string[] }

export const SERVICE_META: { [key: string]: ServiceMeta } = {
  'avatar': {
    icon: '⬡',
    headline: 'Build Your AI Avatar',
    description: 'Create photorealistic, stylized, or full-body avatars from a single photo. Export to GLB, poster, PNG, and turntable video.',
    features: ['Scan · Studio · Stylized modes', 'Full-body guarantee', 'Outfit + pose + lighting presets', 'Export pack: GLB + Poster + Turntable'],
  },
  'agent-g': {
    icon: '◈',
    headline: 'Agent G — Your AI Director',
    description: 'The orchestration brain behind every service. Give it a goal, it builds the plan and executes it end-to-end.',
    features: ['Multi-step pipeline orchestration', 'Quality gate enforcement', 'Multi-language output', 'One-click bundle execution'],
  },
  'workflow': {
    icon: '⬡',
    headline: 'Build Automated Workflows',
    description: 'Design drag-and-drop automation pipelines connecting every AI service. Schedule, trigger, and approve automatically.',
    features: ['Visual DAG editor', 'Retry + cost strategies', 'Schedule + approval gates', 'Workflow templates'],
  },
  'video': {
    icon: '▷',
    headline: 'AI Video Studio',
    description: 'From storyboard to final export. Generate shot lists, b-roll, captions, and multi-platform aspect ratios automatically.',
    features: ['Storyboard generation', 'Auto b-roll + shot list', 'Caption styles (14+ presets)', '9:16 · 1:1 · 16:9 exports'],
  },
  'editing': {
    icon: '⬡',
    headline: 'Universal Video Editing',
    description: 'CapCut-level editing powered by AI. Trim, transition, subtitle, lip-sync, color grade, and watermark — automated.',
    features: ['Auto subtitles (Whisper ASR)', 'Lip sync + color grade', 'Loudness normalization', 'Multi-format batch export'],
  },
  'music': {
    icon: '♪',
    headline: 'AI Music Studio',
    description: 'Generate original tracks, apply vocal chains, mix and master — with Georgian syllable alignment built in.',
    features: ['Beat + vocal presets', 'Mix & master engine', 'Stems export (premium)', 'KA syllable alignment'],
  },
  'media': {
    icon: '⬡',
    headline: 'Media Production Hub',
    description: 'Generate complete campaign packs. Brand kit consistency, deliverables checklist, and brief parsing — automated.',
    features: ['Campaign pack generator', 'Brand kit enforcement', 'Deliverables checklist', 'Brief → asset pipeline'],
  },
  'photo': {
    icon: '◎',
    headline: 'AI Photo Studio',
    description: 'Background removal, professional retouching, and batch processing for entire photo sets in seconds.',
    features: ['Background remove + replace', 'Retouch preset library', 'Batch processing', 'Before/after comparison'],
  },
  'image': {
    icon: '⬡',
    headline: 'AI Image Creator',
    description: 'Generate posters, thumbnails, and ad-ready images with platform-specific safe zones and style packs.',
    features: ['Poster + thumbnail + ad formats', 'Style pack library', 'Safe area enforcement', 'Prompt variation engine'],
  },
  'visual-intel': {
    icon: '◉',
    headline: 'Visual Intelligence',
    description: 'Score your creative work 0–100. Get fail reasons, auto-improve suggestions, and brand consistency audits.',
    features: ['Creative scoring 0–100', 'Fail reason analysis', 'Auto-improve suggestions', 'Brand consistency audit'],
  },
  'text': {
    icon: '⬡',
    headline: 'Text Intelligence',
    description: 'Write ads, landing pages, scripts, and docs using AIDA/PAS frameworks — in KA, EN, and RU simultaneously.',
    features: ['Ads · Landing pages · Scripts', 'AIDA / PAS frameworks', 'SEO pack', 'KA / EN / RU output'],
  },
  'prompt': {
    icon: '⬡',
    headline: 'Prompt Builder',
    description: 'Design, test, and export reusable prompt cards for consistent AI generation across all scenes and sessions.',
    features: ['Prompt card library', 'Negative prompt sets', 'Scene consistency engine', 'Export JSON pack'],
  },
  'shop': {
    icon: '⬡',
    headline: 'Online Shop',
    description: 'Create listings, set up subscriptions, manage affiliate links, and run store audits — all AI-driven.',
    features: ['Listing creation + optimization', 'Subscription setup', 'Affiliate link system', 'Store audit report'],
  },
}
