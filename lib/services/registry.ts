// lib/services/registry.ts
// =========================
// Topology source-of-truth — every consumer that needs orbit ring placement,
// agent routing, or worker assignment reads from here.
//
// The UI catalog with localized strings, hrefs, and icons lives in
// `lib/service-registry.ts` and is consumed by the dashboard/orbit shell.
// Both lists MUST stay slug-aligned; the dev-time assertion at the bottom
// of this file fails fast when they drift.

import { SERVICE_REGISTRY as CATALOG_REGISTRY } from '@/lib/service-registry'

export const SERVICE_REGISTRY = [
  { id: 'avatar',       name: 'Avatar Builder',      ring: 'inner', agentId: 'avatar-agent',       workerType: 'gpu' },
  { id: 'agent-g',      name: 'Agent G',             ring: 'inner', agentId: 'agent-g',            workerType: 'cpu' },
  { id: 'workflow',     name: 'Workflow Builder',    ring: 'inner', agentId: 'workflow-agent',     workerType: 'cpu' },
  { id: 'video',        name: 'Video Studio',        ring: 'inner', agentId: 'video-agent',        workerType: 'gpu' },
  { id: 'editing',      name: 'Universal Editing',   ring: 'mid',   agentId: 'video-editor-agent', workerType: 'gpu' },
  { id: 'music',        name: 'Music Studio',        ring: 'mid',   agentId: 'music-agent',        workerType: 'gpu' },
  { id: 'media',        name: 'Media Production',    ring: 'mid',   agentId: 'marketing-agent',    workerType: 'gpu' },
  { id: 'photo',        name: 'Photo Studio',        ring: 'mid',   agentId: 'thumbnail-agent',    workerType: 'gpu' },
  { id: 'image',        name: 'Image Creator',       ring: 'mid',   agentId: 'image-agent',        workerType: 'gpu' },
  { id: 'visual-intel', name: 'Visual Intelligence', ring: 'outer', agentId: 'qa-agent',           workerType: 'gpu' },
  { id: 'text',         name: 'Text Intelligence',   ring: 'outer', agentId: 'content-agent',      workerType: 'cpu' },
  { id: 'prompt',       name: 'Prompt Builder',      ring: 'outer', agentId: 'prompt-agent',       workerType: 'cpu' },
  { id: 'shop',         name: 'Online Shop',         ring: 'outer', agentId: 'store-agent',        workerType: 'cpu' },
  // ── Expansion services (kept in sync with lib/service-registry.ts) ──
  { id: 'software',     name: 'Software Dev',        ring: 'outer', agentId: 'software-agent',     workerType: 'cpu' },
  { id: 'business',     name: 'Business Agent',      ring: 'outer', agentId: 'business-agent',     workerType: 'cpu' },
  { id: 'tourism',      name: 'Tourism AI',          ring: 'outer', agentId: 'tourism-agent',      workerType: 'cpu' },
  { id: 'game',         name: 'Game Creator',        ring: 'outer', agentId: 'game-agent',         workerType: 'gpu' },
  { id: 'interior',     name: 'Interior Designer',   ring: 'outer', agentId: 'interior-agent',     workerType: 'gpu' },
  { id: 'next',         name: 'Expansion Slot',      ring: 'outer', agentId: 'main-assistant',     workerType: 'cpu' },
] as const

export type ServiceId = typeof SERVICE_REGISTRY[number]['id']
export type AgentId = typeof SERVICE_REGISTRY[number]['agentId']

// ── Dev-time drift detection ────────────────────────────────────────────────
// Catches the case where one registry adds/removes a service but the other
// gets forgotten. Runs once at module load in development only.
if (process.env.NODE_ENV === 'development') {
  const topologyIds = new Set(SERVICE_REGISTRY.map((s) => s.id))
  const catalogSlugs = new Set(CATALOG_REGISTRY.map((s) => s.slug))

  const missingInTopology = [...catalogSlugs].filter((slug) => !topologyIds.has(slug as ServiceId))
  const missingInCatalog = [...topologyIds].filter((id) => !catalogSlugs.has(id))

  if (missingInTopology.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      '[service-registry] catalog has slugs missing from topology — add them to lib/services/registry.ts:',
      missingInTopology,
    )
  }
  if (missingInCatalog.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      '[service-registry] topology has ids missing from catalog — add them to lib/service-registry.ts:',
      missingInCatalog,
    )
  }
}
